import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calcularAlertas } from '../../src/alertas/registo';
import type { ConfigAlertas } from '../../src/alertas/tipos';
import { analisarDocumento } from '../../src/analise/analisador';
import { abrirPdf, lerPaginas } from '../../src/analise/documento';
import { aplicarCorrecoes, SEM_CORRECOES } from '../../src/correcoes/aplicar';
import { descreverResumo } from '../../src/correcoes/descrever';
import { conteudoDeMarcas } from '../../src/correcoes/marcas';
import { ptParaMm } from '../../src/comum/unidades';
import { CFG_BASE } from '../fixtures/analisar';
import { gerarPdfRaw, mm, type PaginaRaw } from '../fixtures/gerar';

const MARCAS = { comprimentoMm: 9.5, afastamentoMm: 5, ampliar: true };
const ARTE = `0.8 0 0 0 k 0 0 ${mm(100)} ${mm(100)} re f 0 0.9 0.9 0 k ${mm(40)} ${mm(40)} ${mm(20)} ${mm(20)} re f`;
/** A página acaba no corte: sem sangria, sem marcas e sem margem (o caso mais comum de ficheiro "cru") */
const CRU: PaginaRaw = { mediaMm: [100, 100], conteudo: ARTE };
/** Corte a 100 mm com 3 mm de sangria e margem de sobra para marcas de 9,5 mm a 5 mm */
const COM_MARGEM: PaginaRaw = { mediaMm: [130, 130], trimMm: [15, 15, 100, 100], bleedMm: [12, 12, 106, 106], conteudo: ARTE };

async function alertasDe(bytes: Uint8Array, cfg: ConfigAlertas = CFG_BASE) {
  return calcularAlertas(analisarDocumento(await abrirPdf(bytes)), cfg).map((a) => a.id);
}

async function corrigir(paginas: PaginaRaw[], pedido = { ...SEM_CORRECOES, marcas: MARCAS }, cfg: ConfigAlertas = CFG_BASE) {
  const bytes = await gerarPdfRaw(paginas);
  const original = bytes.slice();
  const r = await aplicarCorrecoes(bytes, pedido, cfg);
  return { r, original, entrada: bytes, antes: await alertasDe(original, cfg), depois: await alertasDe(r.bytes, cfg), doc: await PDFDocument.load(r.bytes) };
}

describe('marcas de corte automáticas', () => {
  it('página com margem: desenha as oito marcas, sem mexer nas caixas, e o alerta desaparece', async () => {
    const { r, antes, depois, doc } = await corrigir([COM_MARGEM]);
    expect(antes).toContain('marcas-corte-ausentes');
    expect(depois).not.toContain('marcas-corte-ausentes');
    expect(depois).not.toContain('marcas-corte-incompletas');
    expect(depois).not.toContain('marcas-corte-mal-colocadas');
    expect(r.resumo.marcas?.geradas).toEqual([0]);
    expect(r.resumo.marcas?.ampliadas).toEqual([]);
    const info = lerPaginas(doc).paginas[0];
    expect(ptParaMm(info.media.x1 - info.media.x0)).toBeCloseTo(130, 1);
    expect(info.larguraMm).toBeCloseTo(100, 1);
  });

  it('ficheiro cru, sem margem nenhuma: a página cresce, a medida final não muda, e não sobra alerta de marcas', async () => {
    const { r, antes, depois, doc } = await corrigir([CRU]);
    expect(antes.some((id) => id.startsWith('marcas-corte'))).toBe(true);
    expect(depois.some((id) => id.startsWith('marcas-corte'))).toBe(false);
    expect(r.resumo.marcas?.ampliadas).toEqual([0]);
    const info = lerPaginas(doc).paginas[0];
    // 100 mm + 2 × (5 + 9,5 + 0,5)
    expect(ptParaMm(info.media.x1 - info.media.x0)).toBeCloseTo(130, 1);
    expect(info.larguraMm).toBeCloseTo(100, 1);
    expect(info.alturaMm).toBeCloseTo(100, 1);
    expect(info.origemTrim).toBe('TrimBox');
    expect(ptParaMm(info.trim.x0 - info.media.x0)).toBeCloseTo(15, 1);
  });

  it('sem poder aumentar a página: encurta as marcas onde cabem, e deixa a página como estava onde nem assim', async () => {
    const poucaMargem: PaginaRaw = { mediaMm: [114, 114], trimMm: [7, 7, 100, 100], conteudo: ARTE };
    const { r, doc } = await corrigir([poucaMargem, CRU], { ...SEM_CORRECOES, marcas: { ...MARCAS, ampliar: false } });
    // 7 mm de margem: 5 de afastamento + 0,5 de folga deixam 1,5 mm: menos que o mínimo, não há marcas
    expect(r.resumo.marcas?.geradas).toEqual([]);
    expect(r.resumo.marcas?.semEspaco).toEqual([0, 1]);
    expect(r.resumo.avisos.join(' ')).toContain('Sem espaço');
    const info = lerPaginas(doc).paginas[0];
    expect(ptParaMm(info.media.x1 - info.media.x0)).toBeCloseTo(114, 1);

    const folga: PaginaRaw = { mediaMm: [124, 124], trimMm: [12, 12, 100, 100], conteudo: ARTE };
    const b = await corrigir([folga], { ...SEM_CORRECOES, marcas: { ...MARCAS, ampliar: false, afastamentoMm: 5 } });
    // 12 mm de margem: sobram 6,5 mm para a marca → 6,5 mm (arredondado para o meio mm)
    expect(b.r.resumo.marcas?.encurtadas).toEqual([0]);
    expect(b.depois).not.toContain('marcas-corte-ausentes');
    expect(ptParaMm(lerPaginas(b.doc).paginas[0].media.x1 - lerPaginas(b.doc).paginas[0].media.x0)).toBeCloseTo(124, 1);
  });

  it('o afastamento nunca fica abaixo da sangria', async () => {
    const { r, depois } = await corrigir([COM_MARGEM], { ...SEM_CORRECOES, marcas: { ...MARCAS, afastamentoMm: 1 } });
    expect(r.resumo.marcas?.afastamentoSubido).toBe(true);
    expect(r.resumo.marcas?.afastamentoMm).toBeGreaterThanOrEqual(3);
    expect(depois).not.toContain('marcas-corte-mal-colocadas');
  });

  it('em digital (só preto) desenha K 100% e o detetor aceita', async () => {
    const cfg: ConfigAlertas = { ...CFG_BASE, marcasCorteCor: 'preto' };
    const { depois } = await corrigir([COM_MARGEM], { ...SEM_CORRECOES, marcas: MARCAS }, cfg);
    expect(depois.some((id) => id.startsWith('marcas-corte'))).toBe(false);
    expect(conteudoDeMarcas({ x0: 0, y0: 0, x1: 10, y1: 10 }, 5, 5, 'preto')).toContain('0 0 0 1 K');
    expect(conteudoDeMarcas({ x0: 0, y0: 0, x1: 10, y1: 10 }, 5, 5, 'registo')).toContain('/ArtRegisto CS 1 SCN');
  });

  it('as marcas em cor de registo falham a verificação em digital (cor errada) e vice-versa: a cor segue as Definições', async () => {
    const bytes = await gerarPdfRaw([COM_MARGEM]);
    const registo = await aplicarCorrecoes(bytes, { ...SEM_CORRECOES, marcas: MARCAS }, CFG_BASE);
    expect(await alertasDe(registo.bytes, { ...CFG_BASE, marcasCorteCor: 'preto' })).toContain('marcas-corte-mal-colocadas');
  });

  it('só mexe nas páginas sem marcas', async () => {
    // a primeira já tem as suas marcas (as do corretor); a segunda não
    const marcadas = await corrigir([COM_MARGEM, COM_MARGEM]);
    const segunda = await aplicarCorrecoes(marcadas.r.bytes, { ...SEM_CORRECOES, marcas: MARCAS }, CFG_BASE);
    expect(segunda.resumo.marcas?.geradas).toEqual([]);

    const mista = await gerarPdfRaw([COM_MARGEM, COM_MARGEM]);
    const so1 = await aplicarCorrecoes(mista, { ...SEM_CORRECOES, marcas: MARCAS }, CFG_BASE);
    expect(so1.resumo.marcas?.geradas).toEqual([0, 1]);
  });

  it('com sangria no mesmo pedido: a sangria cresce primeiro e as marcas ficam fora dela', async () => {
    const { r, depois, doc } = await corrigir([CRU], { ...SEM_CORRECOES, sangria: { mm: 3 }, marcas: MARCAS });
    expect(r.resumo.sangria?.geradas).toEqual([0]);
    expect(r.resumo.marcas?.geradas).toEqual([0]);
    expect(depois).not.toContain('sangria-ausente');
    expect(depois.some((id) => id.startsWith('marcas-corte'))).toBe(false);
    const info = lerPaginas(doc).paginas[0];
    expect(info.sangriaMm.esquerda).toBeCloseTo(3, 1);
    expect(info.larguraMm).toBeCloseTo(100, 1);
  });

  it('as oito marcas: duas por canto, alinhadas com o corte, do lado de fora e à distância pedida', () => {
    const trim = { x0: 100, y0: 200, x1: 300, y1: 400 };
    const texto = conteudoDeMarcas(trim, 10, 20, 'preto');
    const linhas = [...texto.matchAll(/([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S/g)].map((m) => m.slice(1).map(Number));
    expect(linhas).toHaveLength(8);
    for (const [x0, y0, x1, y1] of linhas) {
      const horizontal = y0 === y1;
      // cada marca é reta e está sobre a linha do corte de um canto
      expect(horizontal ? [200, 400].includes(y0) : [100, 300].includes(x0)).toBe(true);
      // do lado de fora e a 10 mm do corte, com 20 mm de comprimento
      const perto = horizontal ? Math.min(Math.abs(x0 - (x0 < 200 ? 100 : 300)), Math.abs(x1 - (x1 < 200 ? 100 : 300))) : Math.min(Math.abs(y0 - (y0 < 300 ? 200 : 400)), Math.abs(y1 - (y1 < 300 ? 200 : 400)));
      expect(perto).toBeCloseTo(10, 5);
      expect(Math.abs(horizontal ? x1 - x0 : y1 - y0)).toBeCloseTo(20, 5);
      if (horizontal) expect(x0 < 100 || x0 > 300).toBe(true);
      else expect(y0 < 200 || y0 > 400).toBe(true);
    }
  });

  it('página com origem fora de 0,0 (MediaBox que não começa em zero): as marcas vão para o sítio certo', async () => {
    const base = await gerarPdfRaw([{ ...CRU }]);
    const pdf = await PDFDocument.load(base);
    pdf.getPages()[0].setMediaBox(mm(40), mm(60), mm(100), mm(100));
    const bytes = await pdf.save();
    const r = await aplicarCorrecoes(bytes, { ...SEM_CORRECOES, marcas: MARCAS }, CFG_BASE);
    expect(await alertasDe(r.bytes)).not.toContain('marcas-corte-ausentes');
    expect((await alertasDe(r.bytes)).some((id) => id.startsWith('marcas-corte'))).toBe(false);
    const info = lerPaginas(await PDFDocument.load(r.bytes)).paginas[0];
    expect(ptParaMm(info.trim.x0)).toBeCloseTo(40, 1);
    expect(ptParaMm(info.media.x0)).toBeCloseTo(25, 1);
    expect(ptParaMm(info.media.y0)).toBeCloseTo(45, 1);
  });

  it('página rodada: as marcas ficam nos cantos certos e a medida final não muda', async () => {
    const rodada: PaginaRaw = { ...CRU, rotacao: 90 };
    const a = await corrigir([rodada]);
    expect(a.depois.some((id) => id.startsWith('marcas-corte'))).toBe(false);
    const info = lerPaginas(a.doc).paginas[0];
    expect(info.rotacao).toBe(90);
    expect(info.larguraMm).toBeCloseTo(100, 1);
  });

  it('o original nunca é alterado, e a arte continua lá (agora num Form)', async () => {
    const { original, entrada, r, doc } = await corrigir([CRU]);
    expect(entrada).toEqual(original);
    expect(r.bytes).not.toEqual(original);
    expect(doc.getPages()[0].node.Resources()!.toString()).toContain('ArtPagina');
  });

  it('descreve o que fez em português', async () => {
    const { r } = await corrigir([CRU]);
    const frases = descreverResumo(r.resumo).join(' | ');
    expect(frases).toContain('marcas de corte (9.5 mm, a 5 mm do corte) em 1 página');
    expect(frases).toContain('a página cresceu');
    expect(frases).toContain('a medida final não mudou');
  });

  it('pedido a 0 mm ou sem marcas: não faz nada', async () => {
    const a = await corrigir([CRU], { ...SEM_CORRECOES, marcas: { ...MARCAS, comprimentoMm: 0 } });
    expect(a.r.resumo.marcas).toBeUndefined();
  });
});
