import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calcularAlertas } from '../../src/alertas/registo';
import { analisarDocumento } from '../../src/analise/analisador';
import { abrirPdf } from '../../src/analise/documento';
import { aplicarCorrecoes, renomearSpots, SEM_CORRECOES, type PedidoCorrecoes } from '../../src/correcoes/aplicar';
import { BASE, CFG_BASE } from '../fixtures/analisar';
import { gerarPdfRaw, type PaginaRaw } from '../fixtures/gerar';

const ESTADOS = {
  GS0: { OP: false, op: false },
  GS1: { OP: true, op: true, OPM: 1 },
  GS2: { OP: true, op: true, OPM: 0 },
};
const ESPACOS = {
  CS0: { tipo: 'separation' as const, nome: 'cortante' },
  CS1: { tipo: 'separation' as const, nome: 'PANTONE 485 C' },
  CS2: { tipo: 'separation' as const, nome: 'PANTONE 485 CV' },
};
const FONTES = { F1: { tipo: 'incorporada' as const } };
const FUNDO = '0.8 0 0 0 k 0 0 300 300 re f';

const TUDO: PedidoCorrecoes = { overprintBranco: true, overprintPreto: true, overprintSpots: true, renomear: [] };

async function corrigir(spec: Partial<PaginaRaw> & { conteudo: string | string[] }, pedido: PedidoCorrecoes = TUDO) {
  const bytes = await gerarPdfRaw([{ ...BASE, estados: ESTADOS, espacos: ESPACOS, fontes: FONTES, ...spec }]);
  const copia = bytes.slice();
  const r = await aplicarCorrecoes(bytes, pedido, CFG_BASE);
  const antes = calcularAlertas(analisarDocumento(await abrirPdf(copia)), CFG_BASE).map((a) => a.id);
  const depois = calcularAlertas(analisarDocumento(await abrirPdf(r.bytes)), CFG_BASE).map((a) => a.id);
  return { r, antes, depois, original: bytes, copia, doc: await PDFDocument.load(r.bytes) };
}

function conteudo(doc: PDFDocument, i = 0): string {
  const c = doc.getPages()[i].node.Contents();
  const ss = c instanceof PDFArray ? c.asArray().map((x) => doc.context.lookup(x)) : [c];
  return ss.map((s) => String.fromCharCode(...decodePDFRawStream(s as PDFRawStream).decode())).join('\n');
}

describe('correções de overprint', () => {
  it('branco em overprint: desliga-o e o alerta desaparece', async () => {
    const { r, antes, depois } = await corrigir({ conteudo: `${FUNDO} /GS1 gs 0 0 0 0 k 20 20 50 50 re f` });
    expect(antes).toContain('overprint-branco');
    expect(depois).not.toContain('overprint-branco');
    expect(r.resumo.overprintBranco).toBe(1);
    expect(r.resumo.paginas).toEqual([0]);
  });

  it('preto (texto e linha fina) sem overprint: liga-o em modo 1', async () => {
    const c = `${FUNDO} /GS0 gs 0 0 0 1 k BT /F1 10 Tf 20 50 Td (Ola) Tj ET 0 0 0 1 K 0.5 w 10 10 m 200 10 l S`;
    const { r, antes, depois } = await corrigir({ conteudo: c });
    expect(antes).toContain('overprint-preto-desligado');
    expect(depois).not.toContain('overprint-preto-desligado');
    expect(r.resumo.overprintPreto).toBe(2);
  });

  it('preto com overprint em modo 0 (parece certo e não funciona): passa a modo 1', async () => {
    const { depois, antes } = await corrigir({ conteudo: `${FUNDO} /GS2 gs 0 0 0 1 k BT /F1 10 Tf 20 50 Td (Ola) Tj ET` });
    expect(antes).toContain('overprint-preto-desligado');
    expect(depois).not.toContain('overprint-preto-desligado');
  });

  it('spots técnicas sem overprint: liga-o', async () => {
    const { r, antes, depois } = await corrigir({ conteudo: `${FUNDO} /GS0 gs /CS0 CS 1 SCN 1 w 5 5 100 100 re S` });
    expect(antes).toContain('overprint-spots-tecnicas');
    expect(depois).not.toContain('overprint-spots-tecnicas');
    expect(r.resumo.overprintSpots).toBe(1);
  });

  it('cada objeto corrigido tem o seu par "ligar antes / repor depois" (os seguintes não são afetados)', async () => {
    const { doc } = await corrigir({ conteudo: `${FUNDO} /GS0 gs 0 0 0 1 K 0.5 w 10 10 m 200 10 l S 0 0 0 1 K 0.5 w 10 20 m 200 20 l S` });
    const t = conteudo(doc);
    expect((t.match(/ArtOv/g) ?? []).length).toBe(4);
    expect(t).toMatch(/\/ArtOv\d+ gs 10 10 m 200 10 l S \/ArtOv\d+ gs/);
    expect(t).toMatch(/\/ArtOv\d+ gs 10 20 m 200 20 l S \/ArtOv\d+ gs/);
  });

  it('a opacidade de estado vai antes do caminho e a reposição depois do operador de pintura', async () => {
    const { doc } = await corrigir({ conteudo: `${FUNDO} /GS0 gs 0 0 0 1 K 0.5 w 10 10 m 200 10 l S` });
    const t = conteudo(doc).replace(/\s+/g, ' ');
    // GS0: OP=op=false, OPM 0 → corrige para OP=1, op=0 (só o traço), OPM 1; repõe 000
    expect(t).toContain('/ArtOv101 gs 10 10 m 200 10 l S /ArtOv000 gs');
  });

  it('os estados novos existem nos recursos da página', async () => {
    const { doc } = await corrigir({ conteudo: `${FUNDO} /GS0 gs 0 0 0 1 K 0.5 w 10 10 m 200 10 l S` });
    const gs = doc.getPages()[0].node.Resources()!.lookup(PDFName.of('ExtGState'), PDFDict);
    expect(gs.has(PDFName.of('ArtOv101'))).toBe(true);
    expect(gs.has(PDFName.of('ArtOv000'))).toBe(true);
    expect(gs.has(PDFName.of('GS0'))).toBe(true); // os originais ficam
  });

  it('só faz o que se pediu', async () => {
    const c = `${FUNDO} /GS1 gs 0 0 0 0 k 20 20 50 50 re f /GS0 gs /CS0 CS 1 SCN 1 w 5 5 100 100 re S`;
    const { depois } = await corrigir({ conteudo: c }, { ...SEM_CORRECOES, overprintBranco: true });
    expect(depois).not.toContain('overprint-branco');
    expect(depois).toContain('overprint-spots-tecnicas');
  });

  it('sem nada pedido o ficheiro fica igual em conteúdo', async () => {
    const { doc, r } = await corrigir({ conteudo: `${FUNDO} 0 0 0 1 k 0 0 5 5 re f` }, SEM_CORRECOES);
    expect(conteudo(doc)).not.toContain('ArtOv');
    expect(r.resumo).toMatchObject({ overprintBranco: 0, overprintPreto: 0, overprintSpots: 0, spotsRenomeradas: 0, paginas: [] });
  });

  it('é idempotente: corrigir um ficheiro já corrigido não faz nada', async () => {
    const { r } = await corrigir({ conteudo: `${FUNDO} /GS0 gs 0 0 0 1 K 0.5 w 10 10 m 200 10 l S` });
    const outra = await aplicarCorrecoes(r.bytes, TUDO, CFG_BASE);
    expect(outra.resumo).toMatchObject({ overprintBranco: 0, overprintPreto: 0, overprintSpots: 0, paginas: [] });
  });

  it('objetos numa layer desligada não se mexem', async () => {
    const camadas = { MC0: { nome: 'Faca', oculta: true } };
    const { r } = await corrigir({ camadas, conteudo: `${FUNDO} /OC /MC0 BDC /GS0 gs /CS0 CS 1 SCN 1 w 5 5 100 100 re S EMC` });
    expect(r.resumo.overprintSpots).toBe(0);
  });

  it('formulários: o conteúdo do Form é corrigido no próprio Form', async () => {
    const { doc, r, depois } = await corrigir({
      formularios: { Fm0: { conteudo: '/GS0 gs /CS0 CS 1 SCN 1 w 5 5 100 100 re S', herdaRecursos: true } },
      conteudo: `${FUNDO} /Fm0 Do`,
    });
    expect(r.resumo.overprintSpots).toBe(1);
    expect(depois).not.toContain('overprint-spots-tecnicas');
    const xo = doc.getPages()[0].node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
    const form = xo.lookup(PDFName.of('Fm0')) as PDFRawStream;
    expect(String.fromCharCode(...decodePDFRawStream(form).decode())).toContain('ArtOv');
    // o Form herda os recursos da página, por isso é aí que o estado novo tem de existir
    expect(doc.getPages()[0].node.Resources()!.lookup(PDFName.of('ExtGState'), PDFDict).has(PDFName.of('ArtOv101'))).toBe(true);
  });

  it('o original não é tocado', async () => {
    const { original, copia } = await corrigir({ conteudo: `${FUNDO} /GS0 gs 0 0 0 1 K 0.5 w 10 10 m 200 10 l S` });
    expect(Array.from(original)).toEqual(Array.from(copia));
  });
});

describe('renomear spots', () => {
  const nomes = async (bytes: Uint8Array) => {
    const a = analisarDocumento(await abrirPdf(bytes));
    const s = new Set<string>();
    for (const p of a.paginas) for (const e of p.ir.eventos) for (const c of [e.cor, e.corTraco]) for (const n of c?.nomes ?? []) s.add(n);
    return [...s].sort();
  };

  it('junta duplicadas: PANTONE 485 CV passa a PANTONE 485 C e o alerta desaparece', async () => {
    const c = '/CS1 cs 1 scn 0 0 50 50 re f /CS2 cs 1 scn 60 0 50 50 re f';
    const { antes, depois, r } = await corrigir({ conteudo: c }, { ...SEM_CORRECOES, renomear: [{ de: 'PANTONE 485 CV', para: 'PANTONE 485 C' }] });
    expect(antes).toContain('spots-duplicadas');
    expect(depois).not.toContain('spots-duplicadas');
    expect(r.resumo.spotsRenomeradas).toBe(1);
    expect(await nomes(r.bytes)).toEqual(['PANTONE 485 C']);
  });

  it('dá o nome de uma técnica a uma spot (cortante → CutContour)', async () => {
    const { r } = await corrigir({ conteudo: '/CS0 CS 1 SCN 1 w 5 5 100 100 re S' }, { ...SEM_CORRECOES, renomear: [{ de: 'cortante', para: 'CutContour' }] });
    expect(await nomes(r.bytes)).toEqual(['CutContour']);
  });

  it('nomes com espaços e acentos (e a mesma spot em vários sítios)', async () => {
    const { r } = await corrigir(
      { conteudo: '/CS1 cs 1 scn 0 0 5 5 re f /CS1 CS 1 SCN 0 0 9 9 re S' },
      { ...SEM_CORRECOES, renomear: [{ de: 'PANTONE 485 C', para: 'Vermelho Ação' }] },
    );
    expect(await nomes(r.bytes)).toEqual(['Vermelho Ação']);
  });

  it('DeviceN: renomeia o nome dentro da lista de tintas', async () => {
    const { r } = await corrigir(
      { espacos: { CS9: { tipo: 'devicen', nomes: ['Cyan', 'Verniz'] } }, conteudo: '/CS9 cs 1 0.5 scn 0 0 5 5 re f' },
      { ...SEM_CORRECOES, renomear: [{ de: 'Verniz', para: 'Varnish' }] },
    );
    expect(r.resumo.spotsRenomeradas).toBe(1);
    expect(await nomes(r.bytes)).toEqual(['Cyan', 'Varnish']);
  });

  it('tintas de processo e nomes que não existem ficam como estão', async () => {
    const { r } = await corrigir({ conteudo: '/CS1 cs 1 scn 0 0 5 5 re f' }, { ...SEM_CORRECOES, renomear: [{ de: 'Cyan', para: 'X' }, { de: 'nao existe', para: 'Y' }] });
    expect(r.resumo.spotsRenomeradas).toBe(0);
    expect(await nomes(r.bytes)).toEqual(['PANTONE 485 C']);
  });

  it('nome novo vazio ou igual não faz nada', async () => {
    const { r } = await corrigir({ conteudo: '/CS1 cs 1 scn 0 0 5 5 re f' }, { ...SEM_CORRECOES, renomear: [{ de: 'PANTONE 485 C', para: '  ' }, { de: 'PANTONE 485 C', para: 'PANTONE 485 C' }] });
    expect(r.resumo.spotsRenomeradas).toBe(0);
  });

  it('/Colorants de um DeviceN: as chaves também mudam de nome', async () => {
    const pdf = await PDFDocument.create();
    const ctx = pdf.context;
    const sep = ctx.register(ctx.obj(['Separation', 'Verniz', 'DeviceGray', ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], N: 1 }))] as never));
    const dn = ctx.register(ctx.obj(['DeviceN', ['Verniz'], 'DeviceGray', ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], N: 1 })), { Colorants: { Verniz: sep } }] as never));
    const n = renomearSpots(pdf, new Map([['Verniz', 'Varnish']]));
    expect(n).toBe(2);
    const arr = ctx.lookup(dn) as PDFArray;
    const attr = ctx.lookup(arr.get(4)) as PDFDict;
    const col = ctx.lookup(attr.get(PDFName.of('Colorants'))) as PDFDict;
    expect([...col.keys()].map((k) => k.decodeText())).toEqual(['Varnish']);
  });
});
