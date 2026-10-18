import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calcularAlertas } from '../../src/alertas/registo';
import { analisarDocumento } from '../../src/analise/analisador';
import { abrirPdf, lerPaginas } from '../../src/analise/documento';
import { aplicarCorrecoes, SEM_CORRECOES } from '../../src/correcoes/aplicar';
import { descreverResumo } from '../../src/correcoes/descrever';
import { manterDaPagina } from '../../src/correcoes/limpeza';
import { ptParaMm } from '../../src/comum/unidades';
import { CFG_BASE } from '../fixtures/analisar';
import { gerarPdfRaw, mm, type PaginaRaw } from '../fixtures/gerar';

const MARCAS = { comprimentoMm: 9.5, afastamentoMm: 5, ampliar: true, refazer: { sangriaMm: 3 } };
const PEDIDO = { ...SEM_CORRECOES, marcas: MARCAS };

/**
 * Um ficheiro "com tudo": corte a 100 mm (de 30 a 130), 3 mm de sangria declarada, arte até à sangria, e fora dela
 * barras de cor, marcas de registo, marcas de corte antigas e texto de página numa fonte que não vem incorporada.
 */
const ARTE = `0.2 0.1 0 0 k ${mm(27)} ${mm(27)} ${mm(106)} ${mm(106)} re f 0 0.9 0.9 0 k ${mm(60)} ${mm(60)} ${mm(20)} ${mm(20)} re f`;
const BARRAS = [0, 1, 2, 3].map((k) => `${k === 0 ? '1 0 0 0' : k === 1 ? '0 1 0 0' : k === 2 ? '0 0 1 0' : '0 0 0 1'} k ${mm(40 + k * 12)} ${mm(6)} ${mm(10)} ${mm(6)} re f`).join('\n');
const REGISTO = `q 0.25 w 1 1 1 1 K ${mm(80)} ${mm(15)} m ${mm(80)} ${mm(25)} l S ${mm(75)} ${mm(20)} m ${mm(85)} ${mm(20)} l S Q`;
const MARCAS_ANTIGAS = `q 0.25 w 1 1 1 1 K ${mm(10)} ${mm(30)} m ${mm(24)} ${mm(30)} l S ${mm(30)} ${mm(10)} m ${mm(30)} ${mm(24)} l S Q`;
const SLUG = `BT /F1 8 Tf 0 0 0 1 k ${mm(35)} ${mm(2)} Td (Trabalho 1234 - Cliente) Tj ET`;
const CHEIO: PaginaRaw = {
  mediaMm: [160, 160],
  trimMm: [30, 30, 100, 100],
  bleedMm: [27, 27, 106, 106],
  conteudo: [ARTE, BARRAS, REGISTO, MARCAS_ANTIGAS, SLUG].join('\n'),
  fontes: { F1: { tipo: 'padrao' } },
};

async function alertasDe(bytes: Uint8Array) {
  return calcularAlertas(analisarDocumento(await abrirPdf(bytes)), CFG_BASE).map((a) => a.id);
}
async function eventosDe(bytes: Uint8Array) {
  const a = analisarDocumento(await abrirPdf(bytes));
  return a.paginas.flatMap((p) => p.ir.eventos);
}
async function limpar(paginas: PaginaRaw[], pedido: typeof PEDIDO = PEDIDO) {
  const bytes = await gerarPdfRaw(paginas);
  const original = bytes.slice();
  const r = await aplicarCorrecoes(bytes, pedido, CFG_BASE);
  return { r, original, depois: await alertasDe(r.bytes), antes: await alertasDe(original), doc: await PDFDocument.load(r.bytes) };
}

describe('manter: a área que fica', () => {
  const pg = (trim: [number, number, number, number], prod: [number, number, number, number], bleed: boolean) => {
    const c = (a: [number, number, number, number]) => ({ x0: mm(a[0]), y0: mm(a[1]), x1: mm(a[2]), y1: mm(a[3]) });
    return { trim: c(trim), producao: c(prod), origemSangria: bleed ? ('BleedBox' as const) : ('nenhuma' as const) };
  };

  it('sem BleedBox: o corte mais a sangria pedida', () => {
    const k = manterDaPagina(pg([30, 30, 130, 130], [0, 0, 160, 160], false), 1, 3);
    expect(ptParaMm(k.x0)).toBeCloseTo(27, 3);
    expect(ptParaMm(k.y1)).toBeCloseTo(133, 3);
  });

  it('com BleedBox maior do que o pedido, é a do ficheiro que manda (lado a lado)', () => {
    const k = manterDaPagina(pg([30, 30, 130, 130], [24, 27, 136, 133], true), 1, 3);
    expect(ptParaMm(k.x0)).toBeCloseTo(24, 3); // 6 mm à esquerda
    expect(ptParaMm(k.x1)).toBeCloseTo(136, 3);
    expect(ptParaMm(k.y0)).toBeCloseTo(27, 3); // em cima e em baixo a pedida
  });

  it('com BleedBox menor, sobe até à pedida', () => {
    const k = manterDaPagina(pg([30, 30, 130, 130], [29, 29, 131, 131], true), 1, 3);
    expect(ptParaMm(k.x0)).toBeCloseTo(27, 3);
  });

  it('o UserUnit encolhe a sangria em unidades de utilizador', () => {
    const k = manterDaPagina(pg([30, 30, 130, 130], [0, 0, 160, 160], false), 2, 4);
    expect(ptParaMm(k.x0)).toBeCloseTo(28, 3);
  });
});

describe('limpar o ficheiro: retirar o que está fora da sangria e refazer as marcas', () => {
  it('o ficheiro de partida tem mesmo o que se quer tirar (para o teste valer)', async () => {
    const { antes } = await limpar([CHEIO], SEM_CORRECOES as never);
    expect(antes).toContain('fonte-nao-incorporada');
    const ev = await eventosDe(await gerarPdfRaw([CHEIO]));
    expect(ev.length).toBeGreaterThan(10);
  });

  it('o texto da margem, a fonte que só ele usava e os objetos de fora deixam de existir', async () => {
    const { r, depois } = await limpar([CHEIO]);
    expect(depois).not.toContain('fonte-nao-incorporada');
    expect(r.resumo.limpeza?.removidos.textos).toBe(1);
    // 4 barras de cor + 2 linhas do registo + 2 das marcas antigas (cada um no seu caminho de traço)
    expect(r.resumo.limpeza?.removidos.caminhos).toBeGreaterThanOrEqual(6);
    expect(r.resumo.limpeza?.paginas).toEqual([0]);
  });

  it('a arte fica: o que está dentro da sangria continua lá (as duas formas)', async () => {
    const { r } = await limpar([CHEIO]);
    const ev = await eventosDe(r.bytes);
    const grandes = ev.filter((e) => e.preenche && e.bbox.x1 - e.bbox.x0 > mm(15));
    expect(grandes.length).toBeGreaterThanOrEqual(2);
    // e nenhum objeto desenhado (que não seja uma marca) cai fora da sangria
    const info = lerPaginas(await PDFDocument.load(r.bytes)).paginas[0];
    const fora = ev.filter((e) => e.preenche && (e.bbox.x1 < info.bleed.x0 || e.bbox.x0 > info.bleed.x1 || e.bbox.y1 < info.bleed.y0 || e.bbox.y0 > info.bleed.y1));
    expect(fora).toEqual([]);
  });

  it('as caixas ficam certas: corte igual, sangria mantida, página só com o que as marcas precisam', async () => {
    const { doc } = await limpar([CHEIO]);
    const i = lerPaginas(doc).paginas[0];
    expect(i.origemTrim).toBe('TrimBox');
    expect(i.larguraMm).toBeCloseTo(100, 2);
    expect(ptParaMm(i.trim.x0)).toBeCloseTo(30, 3);
    // sangria de 3 mm
    expect(ptParaMm(i.trim.x0 - i.bleed.x0)).toBeCloseTo(3, 2);
    // a folha: corte + 5 (afastamento) + 9,5 (marca) + 0,5 (folga) = 15 mm de cada lado
    expect(ptParaMm(i.media.x0)).toBeCloseTo(15, 2);
    expect(ptParaMm(i.media.x1)).toBeCloseTo(145, 2);
    expect(ptParaMm(i.crop.y1)).toBeCloseTo(145, 2);
  });

  it('só ficam as marcas de corte novas: nenhum alerta de marcas, e as velhas não contam', async () => {
    const { depois, antes } = await limpar([CHEIO]);
    expect(depois.some((id) => id.startsWith('marcas-corte'))).toBe(false);
    // antes, as marcas antigas estavam a 20 mm do corte (mal colocadas ou fora do sítio): o detetor reclamava
    expect(antes.some((id) => id.startsWith('marcas-corte'))).toBe(true);
  });

  it('não sobra nada para o separador de cor e a spot de registo só aparece nas marcas novas', async () => {
    const { r } = await limpar([CHEIO]);
    const ev = await eventosDe(r.bytes);
    // as barras eram C, M, Y e K a 100%: já não há nenhuma forma assim
    const barras = ev.filter((e) => e.preenche && e.bbox.y1 < mm(20) && e.bbox.y0 > mm(2));
    expect(barras).toEqual([]);
  });

  it('o original nunca se altera', async () => {
    const bytes = await gerarPdfRaw([CHEIO]);
    const copia = bytes.slice();
    await aplicarCorrecoes(bytes, PEDIDO, CFG_BASE);
    expect(bytes).toEqual(copia);
  });

  it('é idempotente: limpar um ficheiro já limpo dá o mesmo (sem acumular nada)', async () => {
    const { r } = await limpar([CHEIO]);
    const outra = await aplicarCorrecoes(r.bytes, PEDIDO, CFG_BASE);
    const a = lerPaginas(await PDFDocument.load(r.bytes)).paginas[0];
    const b = lerPaginas(await PDFDocument.load(outra.bytes)).paginas[0];
    expect(ptParaMm(b.media.x1 - b.media.x0)).toBeCloseTo(ptParaMm(a.media.x1 - a.media.x0), 2);
    // as marcas da primeira vez ficam fora da sangria: saem e voltam a fazer-se (é assim que se "substituem")
    expect(outra.resumo.limpeza?.removidos).toEqual({ caminhos: 8, textos: 0, imagens: 0, formas: 0 });
    expect((await alertasDe(outra.bytes)).some((id) => id.startsWith('marcas-corte'))).toBe(false);
  });

  it('mesmo que o ficheiro já tenha sangria e marcas bem postas, refaz-as (limpa o que for)', async () => {
    const certo: PaginaRaw = { ...CHEIO, mediaMm: [160, 160], conteudo: [ARTE, `q 0.25 w 1 1 1 1 K ${mm(15)} ${mm(30)} m ${mm(25)} ${mm(30)} l S Q`, SLUG].join('\n') };
    const { r, depois } = await limpar([certo]);
    expect(r.resumo.limpeza?.refeitas.geradas).toEqual([0]);
    expect(depois).not.toContain('fonte-nao-incorporada');
  });

  it('com sangria a gerar no mesmo pedido: limpa, gera a sangria e refaz as marcas por fora dela', async () => {
    const sem: PaginaRaw = { mediaMm: [160, 160], trimMm: [30, 30, 100, 100], conteudo: [`0.2 0.1 0 0 k ${mm(30)} ${mm(30)} ${mm(100)} ${mm(100)} re f`, BARRAS, SLUG].join('\n'), fontes: { F1: { tipo: 'padrao' } } };
    const { r, depois, doc } = await limpar([sem], { ...PEDIDO, sangria: { mm: 4 } } as never);
    expect(r.resumo.sangria?.geradas).toEqual([0]);
    expect(r.resumo.limpeza?.removidos.textos).toBe(1);
    expect(depois).not.toContain('fonte-nao-incorporada');
    expect(depois).not.toContain('sangria-ausente');
    const i = lerPaginas(doc).paginas[0];
    expect(ptParaMm(i.trim.x0 - i.bleed.x0)).toBeCloseTo(4, 2);
    // marcas fora da sangria de 4 mm: 4 (afastamento ≥ sangria) + 9,5 + 0,5 = 14 mm... com 5 pedidos de afastamento, 15
    expect(ptParaMm(i.trim.x0 - i.media.x0)).toBeCloseTo(15, 2);
  });

  it('sem TrimBox: não se sabe onde é o corte, a página fica como está e o resumo diz-o', async () => {
    const semTrim: PaginaRaw = { mediaMm: [160, 160], conteudo: [ARTE, SLUG].join('\n'), fontes: { F1: { tipo: 'padrao' } } };
    const { r, doc } = await limpar([semTrim]);
    expect(r.resumo.limpeza?.semTrimBox).toEqual([0]);
    expect(r.resumo.limpeza?.refeitas.geradas).toEqual([]);
    expect(r.resumo.avisos.join(' ')).toMatch(/TrimBox/);
    expect(lerPaginas(doc).paginas[0].media.x1).toBeCloseTo(mm(160), 1);
  });

  it('páginas misturadas: trata as que têm TrimBox e deixa as outras', async () => {
    const semTrim: PaginaRaw = { mediaMm: [160, 160], conteudo: ARTE };
    const { r } = await limpar([CHEIO, semTrim, CHEIO]);
    expect(r.resumo.limpeza?.refeitas.geradas).toEqual([0, 2]);
    expect(r.resumo.limpeza?.semTrimBox).toEqual([1]);
  });

  it('o resumo diz o que se fez, em português', async () => {
    const { r } = await limpar([CHEIO]);
    const frases = descreverResumo(r.resumo).join(' | ');
    expect(frases).toMatch(/limpeza: .*fora da sangria retirados em 1 página/);
    expect(frases).toMatch(/recortado à sangria e marcas de corte refeitas/);
  });
});

describe('limpar: o que não se pode tirar com segurança fica só escondido', () => {
  it('texto de um bloco que também mostra texto dentro da sangria não sai (não se parte o bloco)', async () => {
    const misto = `BT /F1 8 Tf ${mm(60)} ${mm(80)} Td (dentro) Tj ${mm(-30)} ${mm(-75)} Td (fora) Tj ET`;
    const pg: PaginaRaw = { mediaMm: [160, 160], trimMm: [30, 30, 100, 100], bleedMm: [27, 27, 106, 106], conteudo: [ARTE, misto].join('\n'), fontes: { F1: { tipo: 'padrao' } } };
    const { r } = await limpar([pg]);
    expect(r.resumo.limpeza?.removidos.textos).toBe(0);
    // mas o recorte à sangria esconde-o na mesma
    const ev = await eventosDe(r.bytes);
    expect(ev.filter((e) => e.texto).length).toBe(1);
  });

  it('um Form com arte e marcas misturadas não se edita: fica o recorte', async () => {
    const pg: PaginaRaw = {
      mediaMm: [160, 160],
      trimMm: [30, 30, 100, 100],
      bleedMm: [27, 27, 106, 106],
      conteudo: '/Fm0 Do',
      formularios: { Fm0: { conteudo: [ARTE, BARRAS].join('\n') } },
    };
    const { r } = await limpar([pg]);
    expect(r.resumo.limpeza?.removidos.caminhos).toBe(0);
    const ev = await eventosDe(r.bytes);
    // as barras estão recortadas: não há formas fora da sangria
    const info = lerPaginas(await PDFDocument.load(r.bytes)).paginas[0];
    const fora = ev.filter((e) => e.preenche && (e.bbox.y1 < info.bleed.y0 || e.bbox.y0 > info.bleed.y1));
    expect(fora).toEqual([]);
  });

  it('um Form que só tem coisas de fora (as barras de cor) é retirado inteiro', async () => {
    const pg: PaginaRaw = {
      mediaMm: [160, 160],
      trimMm: [30, 30, 100, 100],
      bleedMm: [27, 27, 106, 106],
      conteudo: [ARTE, '/FmBarras Do'].join('\n'),
      formularios: { FmBarras: { conteudo: BARRAS } },
    };
    const { r } = await limpar([pg]);
    expect(r.resumo.limpeza?.removidos.formas).toBe(1);
  });
});
