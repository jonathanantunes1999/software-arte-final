import { readFileSync } from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { analisarDocumento, prepararInspecao } from '../../src/analise/analisador';
import { abrirPdf, lerPaginas } from '../../src/analise/documento';
import { converterTexto, RESUMO_TEXTO_VAZIO, type PedidoTexto } from '../../src/texto/converter';
import { inventariarFontes } from '../../src/texto/inventario-fontes';
import { LARGURAS } from '../fixtures/texto';

const FONTE = new Uint8Array(readFileSync(new URL('../fixtures/fontes/teste.ttf', import.meta.url)));

/** Um PDF com uma fonte NÃO incorporada (como a fatura da clínica) e o texto dado */
async function pdfNaoIncorporada(opcoes: { base?: string; subtype?: string; encoding?: unknown; widths?: boolean; descritor?: Record<string, unknown>; texto?: string } = {}) {
  const pdf = await PDFDocument.create();
  const ctx = pdf.context;
  const larg: number[] = [];
  for (let i = 32; i <= 90; i++) larg.push(LARGURAS[i] ?? 500);
  const fonte: Record<string, unknown> = { Type: 'Font', Subtype: opcoes.subtype ?? 'Type1', BaseFont: opcoes.base ?? 'Helvetica' };
  if (opcoes.widths !== false) Object.assign(fonte, { FirstChar: 32, LastChar: 90, Widths: larg });
  if (opcoes.encoding) fonte.Encoding = opcoes.encoding;
  if (opcoes.descritor) fonte.FontDescriptor = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: opcoes.base ?? 'Helvetica', Flags: 32, ...opcoes.descritor } as never));
  const ref = ctx.register(ctx.obj(fonte as never));
  const pagina = pdf.addPage([300, 300]);
  pagina.node.set(PDFName.of('Resources'), ctx.obj({ Font: { F1: ref } } as never));
  pagina.node.set(PDFName.of('Contents'), ctx.register(ctx.stream(`BT /F1 10 Tf 20 50 Td (${opcoes.texto ?? 'AB'}) Tj ET`)));
  return pdf.save();
}

async function inventario(bytes: Uint8Array) {
  const pdf = await abrirPdf(bytes);
  const a = analisarDocumento(pdf);
  const c = prepararInspecao(pdf, lerPaginas(pdf));
  return inventariarFontes(c.l, a.fontes, new Set(a.paginas.flatMap((p) => p.ir.fontesUsadas)));
}

async function converter(bytes: Uint8Array, externa: boolean, extra: Partial<PedidoTexto> = {}) {
  const inv = await inventario(bytes);
  const doc = await PDFDocument.load(bytes);
  const resumo = RESUMO_TEXTO_VAZIO();
  const externas = externa ? Object.fromEntries(inv.filter((f) => f.substituivel).map((f) => [f.id, { nome: 'Teste (instalada)', bytes: FONTE }])) : undefined;
  converterTexto(doc, { externas, ...extra }, resumo);
  const re = await PDFDocument.load(await doc.save());
  const c = re.getPages()[0].node.Contents();
  const ss = c instanceof PDFArray ? c.asArray().map((x) => re.context.lookup(x)) : [c];
  const texto = ss.map((s) => String.fromCharCode(...decodePDFRawStream(s as PDFRawStream).decode())).join('\n').replace(/\s+/g, ' ').trim();
  const fontes = [...re.getPages()[0].node.Resources()!.lookup(PDFName.of('Font'), PDFDict).keys()];
  return { resumo, texto, fontes, inv };
}

describe('texto em curvas com a fonte instalada no computador', () => {
  it('uma fonte não incorporada aparece como substituível (e diz como a procurar)', async () => {
    const inv = await inventario(await pdfNaoIncorporada({ base: 'Helvetica-BoldOblique' }));
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({ convertivel: false, motivo: 'fonte não incorporada', substituivel: { nomeBase: 'Helvetica-BoldOblique', negrito: false, italico: false } });
  });

  it('as pistas do descritor (peso, itálico) vão no pedido de procura', async () => {
    const inv = await inventario(await pdfNaoIncorporada({ base: 'Verdana', descritor: { FontWeight: 700, ItalicAngle: -12 } }));
    expect(inv[0].substituivel).toMatchObject({ nomeBase: 'Verdana', negrito: true, italico: true });
  });

  it('sem fonte instalada o texto fica como estava', async () => {
    const r = await converter(await pdfNaoIncorporada(), false);
    expect(r.texto).toContain('Tj');
    expect(r.resumo.operadores).toBe(0);
    expect(r.resumo.naoConvertido[0].motivo).toContain('não incorporada');
  });

  it('com a fonte instalada o texto vira curvas nas mesmas posições que o PDF dita', async () => {
    const r = await converter(await pdfNaoIncorporada(), true);
    expect(r.texto).not.toContain('Tj');
    // A: (100,700) em 20,50 a corpo 10; B começa depois do avanço de 700 do PDF: 20 + 7 + 2,5
    expect(r.texto).toContain('21 57 m 21 50 l 26 50 l 26 57 l');
    expect(r.texto).toContain('29.5 57 m');
    expect(r.resumo).toMatchObject({ operadores: 1, glifos: 2, fontesConvertidas: ['Helvetica'], fontesRemovidas: ['Helvetica'] });
    expect(r.resumo.substituidas).toEqual([{ fonte: 'Helvetica', por: 'Teste (instalada)' }]);
    expect(r.fontes).toHaveLength(0);
  });

  it('as larguras vêm sempre do PDF, não da fonte instalada', async () => {
    // largura do B no PDF = 600 (a fonte instalada também tem 600); mudar a do A muda onde o B cai
    const bytes = await pdfNaoIncorporada();
    const doc = await PDFDocument.load(bytes);
    const fonte = doc.getPages()[0].node.Resources()!.lookup(PDFName.of('Font'), PDFDict).lookup(PDFName.of('F1'), PDFDict);
    const w = fonte.lookup(PDFName.of('Widths')) as PDFArray;
    w.set(65 - 32, doc.context.obj(900));
    const r = await converter(await doc.save(), true);
    // A avança 9 pt em vez de 7: B em 20 + 9 + 2,5
    expect(r.texto).toContain('31.5 57 m');
  });

  it('WinAnsiEncoding e /Differences escolhem o glifo pelo nome', async () => {
    const enc = { Type: 'Encoding', BaseEncoding: 'WinAnsiEncoding', Differences: [1, 'A', 'O'] };
    const r = await converter(await pdfNaoIncorporada({ encoding: enc, texto: '\\001\\002' }), true);
    expect(r.resumo.glifos).toBe(2);
    expect(r.texto).toContain('21 57 m');
  });

  it('TrueType não incorporada sem /Encoding usa WinAnsi (Verdana, Century Gothic…)', async () => {
    const r = await converter(await pdfNaoIncorporada({ base: 'Verdana', subtype: 'TrueType' }), true);
    expect(r.resumo.operadores).toBe(1);
    expect(r.texto).toContain('21 57 m');
  });

  it('um carácter que a fonte instalada não tem deixa o bloco como estava, com motivo', async () => {
    const r = await converter(await pdfNaoIncorporada({ texto: 'AZ' }), true);
    expect(r.texto).toContain('Tj');
    expect(r.resumo.naoConvertido[0].motivo).toBe('glifo sem contorno na fonte');
  });

  it('nunca se adivinha um glifo pelo código: /Differences manda A→Z e a fonte instalada não tem Z', async () => {
    const enc = { Type: 'Encoding', BaseEncoding: 'WinAnsiEncoding', Differences: [65, 'Z'] };
    const r = await converter(await pdfNaoIncorporada({ encoding: enc, texto: 'A' }), true);
    // sem a guarda, o código 65 iria buscar o glifo A da fonte instalada: letra errada em silêncio
    expect(r.texto).toContain('Tj');
    expect(r.resumo.naoConvertido[0].motivo).toBe('glifo sem contorno na fonte');
  });

  it('sem /Widths não se substitui: as posições já foram calculadas com larguras inventadas', async () => {
    const inv = await inventario(await pdfNaoIncorporada({ widths: false }));
    expect(inv[0].substituivel).toBeUndefined();
    expect(inv[0].motivo).toContain('/Widths');
  });

  it.each(['Symbol', 'ZapfDingbats', 'Wingdings-Regular'])('%s (símbolos) não se substitui', async (base) => {
    const inv = await inventario(await pdfNaoIncorporada({ base }));
    expect(inv[0].substituivel).toBeUndefined();
    expect(inv[0].motivo).toContain('símbolos');
  });

  it('uma fonte instalada que não se consegue ler não derruba a correção', async () => {
    const bytes = await pdfNaoIncorporada();
    const inv = await inventario(bytes);
    const doc = await PDFDocument.load(bytes);
    const resumo = RESUMO_TEXTO_VAZIO();
    converterTexto(doc, { externas: { [inv[0].id]: { nome: 'Lixo', bytes: new Uint8Array(40) } } }, resumo);
    expect(resumo.operadores).toBe(0);
    expect(resumo.naoConvertido[0].motivo).toContain('Lixo');
  });

  it('uma fonte instalada nunca substitui uma fonte que o PDF traz incorporada', async () => {
    // a incorporada tem prioridade (o desenho do PDF é o certo)
    const { pdfComTexto } = await import('../fixtures/texto');
    const bytes = await pdfComTexto([{ fontes: { F1: 'ttf' }, conteudo: 'BT /F1 10 Tf 20 50 Td (A) Tj ET' }]);
    const doc = await PDFDocument.load(bytes);
    const inv = await inventario(bytes);
    const resumo = RESUMO_TEXTO_VAZIO();
    // uma "instalada" ilegível nem chega a ser aberta: a incorporada resolve
    converterTexto(doc, { externas: { [inv[0].id]: { nome: 'Outra', bytes: new Uint8Array(FONTE.length) } } }, resumo);
    expect(resumo).toMatchObject({ operadores: 1, fontesConvertidas: ['Teste'], substituidas: [] });
  });
});
