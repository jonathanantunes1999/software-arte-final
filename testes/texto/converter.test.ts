import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calcularAlertas } from '../../src/alertas/registo';
import { analisarDocumento } from '../../src/analise/analisador';
import { abrirPdf } from '../../src/analise/documento';
import { converterTexto, RESUMO_TEXTO_VAZIO, type PedidoTexto } from '../../src/texto/converter';
import { CFG_BASE } from '../fixtures/analisar';
import { pdfComTexto, type PaginaTexto } from '../fixtures/texto';

async function converter(paginas: PaginaTexto[], pedido: PedidoTexto = {}) {
  const bytes = await pdfComTexto(paginas);
  const copia = bytes.slice();
  const doc = await PDFDocument.load(bytes);
  const resumo = RESUMO_TEXTO_VAZIO();
  converterTexto(doc, pedido, resumo);
  const saida = await doc.save();
  const re = await PDFDocument.load(saida);
  return { resumo, doc: re, original: bytes, copia, saida };
}

function conteudo(doc: PDFDocument, i = 0): string {
  const c = doc.getPages()[i].node.Contents();
  const ss = c instanceof PDFArray ? c.asArray().map((x) => doc.context.lookup(x)) : [c];
  return ss.map((s) => String.fromCharCode(...decodePDFRawStream(s as PDFRawStream).decode())).join('\n').replace(/\s+/g, ' ').trim();
}
const fontesDe = (doc: PDFDocument, i = 0) => [...doc.getPages()[i].node.Resources()!.lookup(PDFName.of('Font'), PDFDict).keys()].map((k) => k.decodeText());
const BT = (corpo: string) => `BT ${corpo} ET`;

describe('texto em curvas: posição', () => {
  it('Tj: o glifo A aparece onde o texto estaria (corpo 10, Td 20 50)', async () => {
    const { resumo, doc } = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf 20 50 Td (A) Tj') }]);
    const t = conteudo(doc);
    expect(t).not.toContain('Tj');
    // A: (100,700) → 20 + 1, 50 + 7
    expect(t).toContain('21 57 m 21 50 l 26 50 l 26 57 l');
    expect(t).toMatch(/ f ?/);
    expect(t).toContain(' h '); // os contornos fecham-se
    expect(resumo).toMatchObject({ operadores: 1, glifos: 1 });
  });

  it('vários glifos avançam pela largura da fonte (700 = 7 pt a corpo 10)', async () => {
    const { doc } = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf 20 50 Td (AB) Tj') }]);
    // B começa em (250,700) → 20 + 7 (avanço do A) + 2,5 = 29,5 ; y = 57
    expect(conteudo(doc)).toContain('29.5 57 m');
  });

  it('TJ: os ajustes entre glifos contam (−1000 = um corpo para a direita)', async () => {
    const { doc } = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf 20 50 Td [(A) -1000 (B)] TJ') }]);
    // B: 20 + 7 + 10 + 2,5
    expect(conteudo(doc)).toContain('39.5 57 m');
  });

  it('espaçamento entre letras (Tc) e entre palavras (Tw, só no código 32)', async () => {
    const { doc } = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf 2 Tc 5 Tw 20 50 Td (A B) Tj') }]);
    // A: 7 + 2 = 9 ; espaço: 3 + 2 + 5 = 10 ; B começa em 20 + 19 + 2,5
    expect(conteudo(doc)).toContain('41.5 57 m');
  });

  it('escala horizontal (Tz 50) e elevação (Ts)', async () => {
    const { doc } = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf 50 Tz 3 Ts 20 50 Td (A) Tj') }]);
    // x = 20 + 100/1000*10*0,5 = 20,5 ; y = 50 + 7 + 3
    expect(conteudo(doc)).toContain('20.5 60 m');
  });

  it('matriz do texto (Tm) com rotação e escala', async () => {
    const { doc } = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf 0 2 -2 0 100 100 Tm (A) Tj') }]);
    // ponto (100,700)/1000*10 = (1,7) → x' = 0*1 + -2*7 + 100 = 86 ; y' = 2*1 + 0*7 + 100 = 102
    expect(conteudo(doc)).toContain('86 102 m');
  });

  it('as curvas ficam no mesmo espaço (cm à volta do texto não se mexe)', async () => {
    const { doc } = await converter([{ fontes: { F1: 'ttf' }, conteudo: `q 2 0 0 2 0 0 cm ${BT('/F1 10 Tf 20 50 Td (A) Tj')} Q` }]);
    const t = conteudo(doc);
    expect(t).toContain('q 2 0 0 2 0 0 cm');
    expect(t).toContain('21 57 m'); // as coordenadas continuam no espaço do cm, que é quem as escala
  });
});

describe('texto em curvas: tipos de fonte e operadores', () => {
  it('CFF (Type1C) e OpenType com CFF dão curvas cúbicas', async () => {
    const a = await converter([{ fontes: { F1: 'cff' }, conteudo: BT('/F1 10 Tf 20 50 Td (C) Tj') }]);
    expect(conteudo(a.doc)).toMatch(/ c /);
    const b = await converter([{ fontes: { F1: 'otf' }, conteudo: BT('/F1 10 Tf 20 50 Td (C) Tj') }]);
    expect(conteudo(b.doc)).toMatch(/ c /);
  });

  it('fonte composta Identity-H: códigos de 2 bytes', async () => {
    const { doc, resumo } = await converter([{ fontes: { F1: 'cid' }, conteudo: BT('/F1 10 Tf 20 50 Td <00020003> Tj') }]);
    expect(resumo.glifos).toBe(2);
    expect(conteudo(doc)).toContain('21 57 m'); // A
    expect(conteudo(doc)).toContain('29.5 57 m'); // B depois do avanço do A (700)
  });

  it("' passa para a linha seguinte e \" também põe Tw e Tc", async () => {
    const a = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf 12 TL 20 50 Td (A) \'') }]);
    expect(conteudo(a.doc)).toContain('T* ');
    expect(conteudo(a.doc)).not.toContain("'");
    const b = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf 12 TL 20 50 Td 3 1 (A) "') }]);
    expect(conteudo(b.doc)).toContain('3 Tw 1 Tc T*');
    // depois do T* o glifo está uma linha abaixo (12 pt)
    expect(conteudo(b.doc)).toContain('21 45 m');
  });

  it('modos de renderização: 0 preenche, 1 traça, 2 preenche e traça, 3 (invisível) desaparece', async () => {
    const m = async (tr: number) => conteudo((await converter([{ fontes: { F1: 'ttf' }, conteudo: BT(`/F1 10 Tf ${tr} Tr 20 50 Td (A) Tj`) }])).doc);
    expect(await m(0)).toMatch(/ f$| f /);
    expect(await m(1)).toMatch(/ S/);
    expect(await m(2)).toMatch(/ B/);
    expect(await m(3)).not.toContain(' m ');
  });

  it('coordenadas que arredondam para −0 escrevem-se 0', async () => {
    const { doc } = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf -1.0001 50 Td (A) Tj') }]);
    expect(conteudo(doc)).not.toContain('-0 ');
    expect(conteudo(doc)).toContain(' 0 57 m'.trim());
  });

  it('o espaço não desenha nada (mas avança)', async () => {
    const { doc, resumo } = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf 20 50 Td (A A) Tj') }]);
    expect(resumo.glifos).toBe(2);
    expect(conteudo(doc)).toContain('31 57 m'); // segundo A: 20 + 7 + 3 + 1
  });
});

describe('texto em curvas: o que fica por converter', () => {
  it('fonte não incorporada, Type 1 e texto usado como recorte: ficam como estão, com o motivo', async () => {
    const a = await converter([{ fontes: { F1: 'nao-incorporada' }, conteudo: BT('/F1 10 Tf 20 50 Td (A) Tj') }]);
    expect(conteudo(a.doc)).toContain('Tj');
    expect(a.resumo.naoConvertido[0].motivo).toContain('não incorporada');
    const b = await converter([{ fontes: { F1: 'type1' }, conteudo: BT('/F1 10 Tf 20 50 Td (A) Tj') }]);
    expect(b.resumo.naoConvertido[0].motivo).toContain('Type 1');
    const c = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf 7 Tr 20 50 Td (A) Tj') }]);
    expect(conteudo(c.doc)).toContain('Tj');
    expect(c.resumo.naoConvertido[0].motivo).toContain('recorte');
  });

  it('um bloco com uma fonte que não se converte fica todo como estava', async () => {
    const { doc, resumo } = await converter([{ fontes: { F1: 'ttf', F2: 'nao-incorporada' }, conteudo: BT('/F1 10 Tf 20 50 Td (A) Tj /F2 10 Tf (A) Tj') }]);
    expect(conteudo(doc).match(/Tj/g)).toHaveLength(2);
    expect(resumo.operadores).toBe(0);
    expect(resumo.naoConvertido.map((n) => n.motivo)).toContain('está num bloco com fontes que não se convertem');
  });

  it('blocos diferentes decidem-se à parte', async () => {
    const { doc, resumo } = await converter([{ fontes: { F1: 'ttf', F2: 'nao-incorporada' }, conteudo: `${BT('/F1 10 Tf 20 50 Td (A) Tj')} ${BT('/F2 10 Tf 20 80 Td (A) Tj')}` }]);
    expect(conteudo(doc).match(/Tj/g)).toHaveLength(1);
    expect(resumo.operadores).toBe(1);
  });

  it('glifo que a fonte não tem: o bloco fica por converter (nunca se perde uma letra)', async () => {
    const { doc, resumo } = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf 20 50 Td (AZ) Tj') }]);
    expect(conteudo(doc)).toContain('Tj');
    expect(resumo.naoConvertido[0].motivo).toContain('glifo sem contorno');
  });

  it('só converte as fontes escolhidas', async () => {
    const bytes = await pdfComTexto([{ fontes: { F1: 'ttf', F2: 'cff' }, conteudo: `${BT('/F1 10 Tf 20 50 Td (A) Tj')} ${BT('/F2 10 Tf 20 80 Td (A) Tj')}` }]);
    const doc = await PDFDocument.load(bytes);
    const todas = RESUMO_TEXTO_VAZIO();
    converterTexto(doc, {}, todas);
    expect(todas.fontesConvertidas.sort()).toEqual(['Teste', 'TesteCff']);
    const doc2 = await PDFDocument.load(bytes);
    const tt = doc2.context.enumerateIndirectObjects().find(([, o]) => o instanceof PDFDict && o.get(PDFName.of('BaseFont'))?.toString() === '/ABCDEF+Teste')![0];
    const r = RESUMO_TEXTO_VAZIO();
    converterTexto(doc2, { fontes: [tt.tag] }, r);
    expect(r.fontesConvertidas).toEqual(['Teste']);
    expect(conteudo(doc2).match(/Tj/g)).toHaveLength(1);
    expect(r.naoConvertido).toEqual([]); // a que ficou foi escolha do utilizador, não um problema
  });
});

describe('texto em curvas: fontes, formulários e o resto', () => {
  it('a fonte deixa de existir: sai dos recursos e o Tf também', async () => {
    const { doc, resumo } = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf 20 50 Td (A) Tj') }]);
    expect(fontesDe(doc)).toEqual([]);
    expect(conteudo(doc)).not.toContain('Tf');
    expect(resumo.fontesRemovidas).toEqual(['Teste']);
  });

  it('se outro texto ainda usa a fonte, fica', async () => {
    const { doc, resumo } = await converter([{ fontes: { F1: 'ttf' }, conteudo: `${BT('/F1 10 Tf 20 50 Td (A) Tj')} ${BT('/F1 10 Tf 7 Tr 20 80 Td (B) Tj')}` }]);
    expect(fontesDe(doc)).toEqual(['F1']);
    expect(resumo.fontesRemovidas).toEqual([]);
    expect(conteudo(doc)).toContain('Tf');
  });

  it('texto num Form (com os seus recursos) é convertido uma só vez, mesmo usado em duas páginas', async () => {
    const form = { Fm0: { conteudo: BT('/F1 10 Tf 20 50 Td (A) Tj'), fontes: { F1: 'ttf' as const } } };
    const { doc, resumo } = await converter([{ formularios: form, conteudo: '/Fm0 Do' }, { formularios: form, conteudo: '/Fm0 Do' }]);
    const xo = doc.getPages()[0].node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
    const f = xo.lookup(PDFName.of('Fm0')) as PDFRawStream;
    expect(String.fromCharCode(...decodePDFRawStream(f).decode())).toContain('21 57 m');
    expect(resumo.operadores).toBe(1); // o Form é um só, partilhado pelas duas páginas
  });

  it('o alerta "texto ainda está em fonte" desaparece', async () => {
    const { saida, copia } = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf 20 50 Td (AB) Tj') }]);
    const ids = async (b: Uint8Array) => calcularAlertas(analisarDocumento(await abrirPdf(b)), CFG_BASE).map((a) => a.id);
    expect((await ids(copia)).some((i) => i.includes('fonte'))).toBe(true);
    expect((await ids(saida)).filter((i) => i.includes('fonte'))).toEqual([]);
  });

  it('é idempotente e o original não é tocado', async () => {
    const { saida, original, copia } = await converter([{ fontes: { F1: 'ttf' }, conteudo: BT('/F1 10 Tf 20 50 Td (A) Tj') }]);
    expect(Array.from(original)).toEqual(Array.from(copia));
    const doc = await PDFDocument.load(saida);
    const r = RESUMO_TEXTO_VAZIO();
    converterTexto(doc, {}, r);
    expect(r.operadores).toBe(0);
  });

  it('cor e overprint do texto passam para as curvas (o resto do stream não muda)', async () => {
    const { doc } = await converter([{ fontes: { F1: 'ttf' }, conteudo: `0 0 0 1 k ${BT('/F1 10 Tf 20 50 Td (A) Tj')} 1 0 0 0 k 0 0 5 5 re f` }]);
    const t = conteudo(doc);
    expect(t.startsWith('0 0 0 1 k BT')).toBe(true);
    expect(t.endsWith('1 0 0 0 k 0 0 5 5 re f')).toBe(true);
  });
});
