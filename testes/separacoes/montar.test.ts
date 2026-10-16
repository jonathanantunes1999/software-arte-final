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

  it('spots que só aparecem num degradé, num padrão ou numa imagem também ganham placa', async () => {
    const a = await separar({ degrades: { Sh0: { espaco: { separation: 'Verniz' }, de: [0], para: [1] } }, conteudo: '/Sh0 sh' });
    expect(a.r.placas.map((p) => p.nome)).toContain('Verniz');
    const b = await separar({ degrades: { Sh0: { espaco: { separation: 'Verniz' }, de: [0], para: [1] } }, padroes: { P1: { degrade: 'Sh0' } }, conteudo: '/Pattern cs /P1 scn 0 0 5 5 re f' });
    expect(b.r.placas.map((p) => p.nome)).toContain('Verniz');
    const c = await separar({ imagens: { Im0: { larguraPx: 1, alturaPx: 1, espaco: { separation: 'Verniz' }, dados: [255] } }, conteudo: '/Im0 Do' });
    expect(c.r.placas.map((p) => p.nome)).toContain('Verniz');
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

  describe('imagens', () => {
    const planoDoPixel = (doc: PDFDocument, pagina: number, nome: string) => {
      const xo = doc.getPages()[pagina].node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
      const s = xo.lookup(PDFName.of(nome)) as PDFRawStream;
      return { dict: s.dict, bytes: Array.from(decodePDFRawStream(s).decode()) };
    };
    const IMG = { Im0: { larguraPx: 2, alturaPx: 1, espaco: 'CMYK' as const, dados: [255, 0, 0, 0, 0, 128, 0, 51] } };

    it('imagem CMYK: cada placa recebe o seu plano em cinzento (255 − tinta)', async () => {
      const { r, saida } = await separar({ imagens: IMG, conteudo: '/Im0 Do' });
      expect(r.avisos.imagens).toBe(0);
      expect(planoDoPixel(saida, 0, 'Im0').bytes).toEqual([0, 255]); // ciano: 100% e 0%
      expect(planoDoPixel(saida, 1, 'Im0').bytes).toEqual([255, 127]); // magenta: 0% e 50%
      expect(planoDoPixel(saida, 3, 'Im0').bytes).toEqual([255, 204]); // preto: 0% e 20%
    });

    it('placa sem tinta nenhuma da imagem: um pixel branco (a imagem apaga o que está por baixo)', async () => {
      const { saida } = await separar({ imagens: IMG, conteudo: '/Im0 Do' });
      const y = planoDoPixel(saida, 2, 'Im0');
      expect(y.bytes).toEqual([255]);
      expect(y.dict.get(PDFName.of('Width'))?.toString()).toBe('1');
    });

    it('as máscaras (SMask) da imagem mantêm-se em todas as placas, até na imagem branca', async () => {
      const { saida } = await separar({ imagens: { Im0: { ...IMG.Im0, extra: { SMask: 'auto' } } }, conteudo: '/Im0 Do' });
      expect(planoDoPixel(saida, 0, 'Im0').dict.has(PDFName.of('SMask'))).toBe(true);
      expect(planoDoPixel(saida, 2, 'Im0').dict.has(PDFName.of('SMask'))).toBe(true); // placa Y: a imagem não tem amarelo, mas continua a ter a máscara
    });

    it('imagem cinzento: fica como está na placa K e branca nas outras', async () => {
      const { r, saida } = await separar({ imagens: { Im0: { larguraPx: 2, alturaPx: 1, espaco: 'Gray', dados: [0, 200] } }, conteudo: '/Im0 Do' });
      expect(r.avisos.imagens).toBe(0);
      expect(planoDoPixel(saida, 3, 'Im0').bytes).toEqual([0, 200]);
      expect(planoDoPixel(saida, 0, 'Im0').bytes).toEqual([255]);
    });

    it('imagem com overprint: marca as placas de processo mas não toca nas spots', async () => {
      const { saida } = await separar({ imagens: IMG, conteudo: '/CS0 cs 1 scn 0 0 1 1 re f /GS1 gs /Im0 Do' });
      const alfaDaImagem = (i: number) => {
        const nome = /\/(ArtA\d+) gs \/Im0 Do/.exec(conteudoDe(saida, i))![1];
        return saida.getPages()[i].node.Resources()!.lookup(PDFName.of('ExtGState'), PDFDict).lookup(PDFName.of(nome), PDFDict).lookup(PDFName.of('ca'), PDFNumber).asNumber();
      };
      expect(alfaDaImagem(0)).toBe(1); // ciano
      expect(alfaDaImagem(3)).toBe(1); // preto
      expect(alfaDaImagem(4)).toBe(0); // Verniz: fica por baixo, intacto
    });

    it('JPEG 2000 e outros: não se separam, contam-se com o motivo', async () => {
      const { r } = await separar({ imagens: { Im0: { larguraPx: 1, alturaPx: 1, espaco: 'CMYK', extra: { Filter: 'JPXDecode' } } }, conteudo: '/Im0 Do' });
      expect(r.avisos).toMatchObject({ imagens: 1, motivos: ['JPEG 2000'] });
    });

    it('imagem inline conta como não separada', async () => {
      const { r } = await separar({ conteudo: 'q 10 0 0 10 0 0 cm BI /W 1 /H 1 /BPC 8 /CS /RGB ID \u0000\u0000\u0000 EI Q' });
      expect(r.avisos).toMatchObject({ imagens: 1, motivos: ['imagem inline'] });
    });

    it('a mesma imagem usada duas vezes gera um só plano por placa', async () => {
      const { saida } = await separar({ imagens: IMG, conteudo: '/Im0 Do /Im0 Do' });
      expect(saida.getPageCount()).toBe(4);
      expect(planoDoPixel(saida, 0, 'Im0').bytes).toEqual([0, 255]);
    });

    it('imagem dentro de um Form sem /Resources próprios usa os da página', async () => {
      const { saida, r } = await separar({ imagens: IMG, formularios: { Fm0: { conteudo: '/Im0 Do', herdaRecursos: true } }, conteudo: '/Fm0 Do' });
      expect(r.avisos.imagens).toBe(0);
      expect(planoDoPixel(saida, 0, 'Im0').bytes).toEqual([0, 255]);
    });
  });

  describe('degradés', () => {
    const DEG = { Sh0: { espaco: 'CMYK' as const, de: [0, 0, 0, 0], para: [1, 0, 0, 0.5] } };
    const funcaoDaPlaca = (doc: PDFDocument, pagina: number, nome: string) => {
      const sh = doc.getPages()[pagina].node.Resources()!.lookup(PDFName.of('Shading'), PDFDict).lookup(PDFName.of(nome), PDFDict);
      const f = sh.lookup(PDFName.of('Function')) as PDFRawStream;
      return { sh, bytes: Array.from(decodePDFRawStream(f).decode()) };
    };

    it('sh: cada placa recebe uma função amostrada com a sua tinta (255 − tinta)', async () => {
      const { r, saida } = await separar({ degrades: DEG, conteudo: '/Sh0 sh' });
      expect(r.avisos.degrades).toBe(0);
      const c = funcaoDaPlaca(saida, 0, 'Sh0');
      expect(c.bytes).toHaveLength(256);
      expect(c.bytes[0]).toBe(255); // sem ciano no início
      expect(c.bytes[255]).toBe(0); // ciano 100% no fim
      const k = funcaoDaPlaca(saida, 3, 'Sh0');
      expect(k.bytes[255]).toBe(127); // K 50%
      expect(funcaoDaPlaca(saida, 1, 'Sh0').bytes.every((b) => b === 255)).toBe(true); // magenta: nada
      expect(c.sh.lookup(PDFName.of('ColorSpace'))?.toString()).toBe('/DeviceGray');
      expect(c.sh.has(PDFName.of('Extend'))).toBe(true);
    });

    it('o conteúdo mantém o sh, com a opacidade antes', async () => {
      const { saida } = await separar({ degrades: DEG, conteudo: '/Sh0 sh' });
      expect(conteudoDe(saida, 0)).toMatch(/\/ArtA0 gs \/Sh0 sh/);
    });

    it('degradé de spot: só a placa da spot leva tinta', async () => {
      const { r, saida } = await separar({
        degrades: { Sh0: { espaco: { separation: 'Verniz' }, de: [0], para: [1] } },
        espacos: ESPACOS,
        conteudo: '/CS0 cs 1 scn 0 0 1 1 re f /Sh0 sh',
      });
      const i = r.placas.findIndex((p) => p.nome === 'Verniz');
      const v = funcaoDaPlaca(saida, i, 'Sh0');
      expect(v.bytes[0]).toBe(255);
      expect(v.bytes[255]).toBe(0);
      expect(funcaoDaPlaca(saida, 3, 'Sh0').bytes.every((b) => b === 255)).toBe(true);
    });

    it('padrão de degradé (scn): a placa tem a sua versão do padrão, e o scn não se altera', async () => {
      const { r, saida } = await separar({ degrades: DEG, padroes: { P1: { degrade: 'Sh0' } }, conteudo: '/Pattern cs /P1 scn 0 0 50 50 re f' });
      expect(r.avisos.padroes).toBe(0);
      expect(conteudoDe(saida, 0)).toContain('/Pattern cs /P1 scn'); // nem o cs nem o scn mudam
      const pad = saida.getPages()[0].node.Resources()!.lookup(PDFName.of('Pattern'), PDFDict).lookup(PDFName.of('P1'), PDFDict);
      const sh = pad.lookup(PDFName.of('Shading'), PDFDict);
      expect(sh.lookup(PDFName.of('ColorSpace'))?.toString()).toBe('/DeviceGray');
    });

    it('padrão de mosaico e malhas: não se separam e contam-se com o motivo', async () => {
      const a = await separar({ padroes: { P1: { mosaico: true } }, conteudo: '/Pattern cs /P1 scn 0 0 50 50 re f' });
      expect(a.r.avisos).toMatchObject({ padroes: 1, motivosDegrades: ['padrão de mosaico'] });
      const b = await separar({ degrades: { Sh0: { tipo: 4, espaco: 'CMYK', de: [0, 0, 0, 0], para: [1, 0, 0, 0] } }, conteudo: '/Sh0 sh' });
      expect(b.r.avisos).toMatchObject({ degrades: 1, motivosDegrades: ['malha de degradé (tipo 4)'] });
      expect(conteudoDe(b.saida, 0)).not.toContain('sh');
    });

    it('degradé com overprint: deixa em paz as placas que não toca', async () => {
      const { saida } = await separar({ degrades: DEG, conteudo: '/GS1 gs /Sh0 sh' });
      const alfa = (i: number) => {
        const nome = /\/(ArtA\d+) gs \/Sh0 sh/.exec(conteudoDe(saida, i))![1];
        return saida.getPages()[i].node.Resources()!.lookup(PDFName.of('ExtGState'), PDFDict).lookup(PDFName.of(nome), PDFDict).lookup(PDFName.of('ca'), PDFNumber).asNumber();
      };
      expect(alfa(0)).toBe(1); // CMYK em modo 1: o degradé toca nas quatro de processo
    });
  });
});
