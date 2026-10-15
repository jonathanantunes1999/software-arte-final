import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { prepararInspecao } from '../../src/analise/analisador';
import { abrirPdf, lerPaginas } from '../../src/analise/documento';
import { separarPagina } from '../../src/separacoes/montar';
import { BASE } from '../fixtures/analisar';
import { gerarPdfRaw, mm, type PaginaRaw } from '../fixtures/gerar';

const ESTADOS = {
  GS0: { OP: false, op: false },
  GS1: { OP: true, op: true, OPM: 1 },
};
const ESPACOS = {
  CS0: { tipo: 'separation' as const, nome: 'Verniz' },
  CS1: { tipo: 'separation' as const, nome: 'PANTONE 485 C' },
};
const FONTES = { F1: { tipo: 'incorporada' as const } };

async function separar(spec: Partial<PaginaRaw> & { conteudo: string | string[] }, simular = true, ocultas?: (c: ReturnType<typeof prepararInspecao>) => Set<string>) {
  const bytes = await gerarPdfRaw([{ ...BASE, estados: ESTADOS, espacos: ESPACOS, fontes: FONTES, ...spec }]);
  const pdf = await abrirPdf(bytes);
  const ctx = prepararInspecao(pdf, lerPaginas(pdf));
  const r = await separarPagina(ctx, 0, ocultas ? ocultas(ctx) : ctx.ocgPorOmissao, simular);
  const saida = await PDFDocument.load(r.bytes);
  return { r, saida, pdf, ctx };
}

function conteudoDe(doc: PDFDocument, pagina: number): string {
  const p = doc.getPages()[pagina];
  const c = p.node.Contents();
  const streams = c instanceof PDFArray ? c.asArray().map((x) => doc.context.lookup(x)) : [c];
  return streams.map((s) => String.fromCharCode(...decodePDFRawStream(s as PDFRawStream).decode())).join('\n');
}

describe('separar página: montagem do PDF das placas', () => {
  it('uma página por placa: C, M, Y, K e as spots usadas, na ordem em que aparecem', async () => {
    const { r, saida } = await separar({ conteudo: '/CS1 cs 1 scn 0 0 10 10 re f /CS0 cs 1 scn 0 0 10 10 re f /CS1 cs 1 scn 0 0 5 5 re f' });
    expect(r.placas.map((p) => p.id)).toEqual(['C', 'M', 'Y', 'K', 'spot:PANTONE 485 C', 'spot:Verniz']);
    expect(saida.getPageCount()).toBe(6);
  });

  it('spots só usadas numa layer desligada não ganham placa', async () => {
    const { r } = await separar({ camadas: { MC0: { nome: 'Faca', oculta: true } }, conteudo: '/OC /MC0 BDC /CS0 cs 1 scn 0 0 10 10 re f EMC' });
    expect(r.placas.map((p) => p.id)).toEqual(['C', 'M', 'Y', 'K']);
  });

  it('cor das spots: a alternativa do espaço (aqui vermelho-alaranjado) em vez da paleta', async () => {
    const { r } = await separar({ conteudo: '/CS0 cs 1 scn 0 0 10 10 re f' });
    const verniz = r.placas.find((p) => p.nome === 'Verniz')!;
    expect(verniz.rgb[0]).toBeGreaterThan(200);
    expect(verniz.rgb[1]).toBeLessThan(80);
  });

  it('as páginas mantêm as caixas e a rotação da original', async () => {
    const { saida } = await separar({ mediaMm: [100, 150], trimMm: [5, 5, 95, 145], rotacao: 90, conteudo: '0 0 0 1 k 0 0 10 10 re f' });
    const p = saida.getPages()[3];
    expect(p.getMediaBox().width).toBeCloseTo(mm(100), 1);
    expect(p.getMediaBox().height).toBeCloseTo(mm(150), 1);
    expect(p.getTrimBox().x).toBeCloseTo(mm(5), 1);
    expect(p.getRotation().angle).toBe(90);
  });

  it('o conteúdo de cada placa é o reescrito (cinzentos + opacidades)', async () => {
    const { saida } = await separar({ conteudo: '0.8 0 0 0 k 10 10 50 50 re f' });
    expect(conteudoDe(saida, 0)).toContain('0.2 g'); // ciano
    expect(conteudoDe(saida, 1)).toContain('1 g'); // magenta
    expect(conteudoDe(saida, 0)).toContain('/ArtA0 gs');
  });

  it('as opacidades existem nos recursos da página', async () => {
    const { saida } = await separar({ conteudo: '/GS1 gs 0 0 0 1 k 10 10 50 50 re f' });
    const res = saida.getPages()[0].node.Resources()!;
    const gs = res.lookup(PDFName.of('ExtGState'), PDFDict);
    const a0 = gs.lookup(PDFName.of('ArtA0'), PDFDict);
    expect(a0.lookup(PDFName.of('ca'), PDFNumber).asNumber()).toBe(0); // placa C: K em overprint não a toca
    // os estados originais mantêm-se
    expect(gs.has(PDFName.of('GS1'))).toBe(true);
  });

  it('formulários: cada placa tem a sua versão, com o seu conteúdo', async () => {
    const { saida } = await separar({ formularios: { Fm0: { conteudo: '0.5 0 0 0 k 0 0 20 20 re f' } }, conteudo: '/Fm0 Do' });
    const forma = (i: number) => {
      const xo = saida.getPages()[i].node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
      const s = xo.lookup(PDFName.of('Fm0')) as PDFRawStream;
      return String.fromCharCode(...decodePDFRawStream(s).decode());
    };
    expect(forma(0)).toContain('0.5 g'); // ciano: 50% → cinzento 0,5
    expect(forma(1)).toContain('1 g');
  });

  it('não leva nada que não seja preciso: sem anotações nem imagens retiradas', async () => {
    const { saida } = await separar({ imagens: { Im0: { larguraPx: 2, alturaPx: 2, espaco: 'CMYK' } }, conteudo: '/Im0 Do' });
    const xo = saida.getPages()[0].node.Resources()!.lookupMaybe(PDFName.of('XObject'), PDFDict);
    expect(xo?.has(PDFName.of('Im0'))).toBe(false);
    expect(saida.getPages()[0].node.has(PDFName.of('Annots'))).toBe(false);
  });

  it('não altera o original: o conteúdo e os recursos ficam iguais', async () => {
    const bytes = await gerarPdfRaw([{ ...BASE, estados: ESTADOS, espacos: ESPACOS, fontes: FONTES, conteudo: '/GS1 gs 0 0 0 1 k 10 10 50 50 re f' }]);
    const pdf = await abrirPdf(bytes);
    const ctx = prepararInspecao(pdf, lerPaginas(pdf));
    const antes = conteudoDe(pdf, 0);
    const gsAntes = [...pdf.getPages()[0].node.Resources()!.lookup(PDFName.of('ExtGState'), PDFDict).keys()].map((k) => k.decodeText());
    await separarPagina(ctx, 0, ctx.ocgPorOmissao, true);
    expect(conteudoDe(pdf, 0)).toBe(antes);
    expect([...pdf.getPages()[0].node.Resources()!.lookup(PDFName.of('ExtGState'), PDFDict).keys()].map((k) => k.decodeText())).toEqual(gsAntes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('as fontes partilham-se entre placas (não se copiam 4 vezes)', async () => {
    const { saida } = await separar({ conteudo: 'BT /F1 12 Tf 10 10 Td (A) Tj ET' });
    const fonte = (i: number) => saida.getPages()[i].node.Resources()!.lookup(PDFName.of('Font'), PDFDict).get(PDFName.of('F1'));
    expect(fonte(0)).toBeInstanceOf(PDFRef);
    expect(String(fonte(0))).toBe(String(fonte(1)));
    expect(String(fonte(0))).toBe(String(fonte(3)));
  });

  it('conta o que não se separou', async () => {
    const { r } = await separar({ imagens: { Im0: { larguraPx: 2, alturaPx: 2, espaco: 'CMYK' } }, conteudo: '/Im0 Do /Sh0 sh /Pattern cs /P1 scn 0 0 5 5 re f' });
    expect(r.avisos).toMatchObject({ imagens: 1, degrades: 1, padroes: 1 });
  });
});
