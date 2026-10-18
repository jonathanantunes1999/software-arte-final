import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { analisarDocumento, prepararInspecao } from '../../src/analise/analisador';
import { abrirPdf } from '../../src/analise/documento';
import { aplicarEdicoes, listarObjetos } from '../../src/edicao/objetos';
import { escalaEm, matrizParaCaixa, translacao, transformarCaixa } from '../../src/edicao/matriz';
import type { Edicao } from '../../src/edicao/tipos';
import { gerarPdfRaw, mm, type PaginaRaw } from '../fixtures/gerar';

const A = {
  fundo: `0.1 0.1 0.1 0 k 0 0 ${mm(100)} ${mm(100)} re f`,
  vermelho: `0 1 1 0 k ${mm(20)} ${mm(20)} ${mm(20)} ${mm(20)} re f`,
  triangulo: `1 0.5 0 0 k ${mm(60)} ${mm(10)} m ${mm(80)} ${mm(10)} l ${mm(70)} ${mm(30)} l h f`,
  linha: `q 2 w 0 0 0 1 K ${mm(10)} ${mm(90)} m ${mm(50)} ${mm(90)} l S Q`,
  texto: `BT /F1 12 Tf 0 0 0 1 k ${mm(15)} ${mm(60)} Td (Ola mundo) Tj ET`,
};
const PAGINA: PaginaRaw = {
  mediaMm: [100, 100],
  conteudo: [A.fundo, A.vermelho, A.triangulo, A.linha, A.texto, '/Fm0 Do'].join('\n'),
  fontes: { F1: { tipo: 'padrao' } },
  formularios: { Fm0: { conteudo: `0 0 1 0 k ${mm(60)} ${mm(60)} ${mm(20)} ${mm(20)} re f 1 0 0 0 k ${mm(65)} ${mm(65)} ${mm(5)} ${mm(5)} re f`, bbox: [0, 0, mm(100), mm(100)] } },
};

async function abrir(pag: PaginaRaw = PAGINA) {
  const bytes = await gerarPdfRaw([pag]);
  return { bytes, pdf: await abrirPdf(bytes) };
}
async function editar(edicoes: Edicao[], pag: PaginaRaw = PAGINA) {
  const bytes = await gerarPdfRaw([pag]);
  const pdf = await PDFDocument.load(bytes);
  const resumo = aplicarEdicoes(pdf, edicoes);
  const saida = await pdf.save({ useObjectStreams: false });
  return { resumo, saida, original: bytes };
}
async function eventos(bytes: Uint8Array) {
  return analisarDocumento(await abrirPdf(bytes)).paginas[0].ir.eventos;
}
const corK = (e: { cor?: { valores: number[] } }) => e.cor?.valores.map((v) => Math.round(v * 100) / 100).join(',');
const perto = (a: number, b: number, tol = 0.02) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('objetos editáveis: o que há na página', () => {
  it('lista cada forma, o bloco de texto e o grupo, por ordem de pintura', async () => {
    const { pdf } = await abrir();
    const o = listarObjetos(prepararInspecao(pdf), 0);
    expect(o.map((x) => x.tipo)).toEqual(['forma', 'forma', 'forma', 'forma', 'texto', 'grupo']);
    expect(o.map((x) => x.id)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('cada um traz a caixa certa, a cor e (nas formas) os contornos', async () => {
    const { pdf } = await abrir();
    const o = listarObjetos(prepararInspecao(pdf), 0);
    perto(o[1].bbox.x0, mm(20));
    perto(o[1].bbox.x1, mm(40));
    expect(corK(o[1])).toBe('0,1,1,0');
    expect(o[1].geometria?.contornos.length).toBeGreaterThan(0);
    // o triângulo: caixa 60..80 × 10..30
    perto(o[2].bbox.x1, mm(80));
    perto(o[2].bbox.y1, mm(30));
    // a linha só traça
    expect(o[3].traca).toBe(true);
    expect(o[3].preenche).toBe(false);
    // o grupo: a união do que o Form desenha (60..80)
    perto(o[5].bbox.x0, mm(60));
    perto(o[5].bbox.x1, mm(80));
  });

  it('os ids não dependem de se listar outra vez (são os mesmos)', async () => {
    const { pdf } = await abrir();
    const a = listarObjetos(prepararInspecao(pdf), 0);
    const b = listarObjetos(prepararInspecao(pdf), 0);
    expect(b.map((x) => x.bbox)).toEqual(a.map((x) => x.bbox));
  });
});

describe('editar: apagar', () => {
  it('apaga uma forma e deixa o resto como estava', async () => {
    const { saida, original } = await editar([{ tipo: 'apagar', pagina: 0, objeto: 1 }]);
    const antes = await eventos(original);
    const depois = await eventos(saida);
    expect(depois.length).toBe(antes.length - 1);
    expect(depois.some((e) => corK(e) === '0,1,1,0')).toBe(false);
    expect(depois.some((e) => corK(e) === '1,0.5,0,0')).toBe(true);
  });

  it('apaga um bloco de texto, uma linha e um grupo', async () => {
    const { saida, resumo } = await editar([
      { tipo: 'apagar', pagina: 0, objeto: 3 },
      { tipo: 'apagar', pagina: 0, objeto: 4 },
      { tipo: 'apagar', pagina: 0, objeto: 5 },
    ]);
    const depois = await eventos(saida);
    expect(depois.some((e) => e.tipo === 'texto')).toBe(false);
    expect(depois.some((e) => e.traca && !e.preenche)).toBe(false);
    expect(depois.some((e) => corK(e) === '0,0,1,0')).toBe(false); // o grupo
    expect(resumo.apagados).toBe(3);
  });

  it('um recorte antes da forma continua a valer depois de a apagar', async () => {
    const pag: PaginaRaw = { mediaMm: [100, 100], conteudo: `q ${mm(10)} ${mm(10)} ${mm(30)} ${mm(30)} re W n 1 0 0 0 k 0 0 ${mm(100)} ${mm(100)} re f Q 0 1 0 0 k ${mm(50)} ${mm(50)} ${mm(10)} ${mm(10)} re f` };
    const { saida } = await editar([{ tipo: 'apagar', pagina: 0, objeto: 0 }], pag);
    const depois = await eventos(saida);
    expect(depois).toHaveLength(1);
    expect(corK(depois[0])).toBe('0,1,0,0');
  });
});

describe('editar: mover e mudar o tamanho', () => {
  it('mover desloca só aquele objeto, no espaço da página', async () => {
    const { saida } = await editar([{ tipo: 'transformar', pagina: 0, objeto: 1, matriz: translacao(mm(10), mm(-5)) }]);
    const v = (await eventos(saida)).find((e) => corK(e) === '0,1,1,0')!;
    perto(v.bbox.x0, mm(30));
    perto(v.bbox.y0, mm(15));
    perto(v.bbox.x1, mm(50));
    // o triângulo não se mexeu
    const t = (await eventos(saida)).find((e) => corK(e) === '1,0.5,0,0')!;
    perto(t.bbox.x0, mm(60));
  });

  it('com a página dentro de uma matriz (escala e deslocamento), o deslocamento continua a ser o que se pediu na página', async () => {
    const pag: PaginaRaw = { mediaMm: [100, 100], conteudo: `q 0.5 0 0 0.5 ${mm(10)} ${mm(10)} cm 0 1 1 0 k ${mm(40)} ${mm(40)} ${mm(40)} ${mm(40)} re f Q` };
    const { pdf } = await abrir(pag);
    const o = listarObjetos(prepararInspecao(pdf), 0)[0];
    perto(o.bbox.x0, mm(30)); // 40 × 0,5 + 10
    const { saida } = await editar([{ tipo: 'transformar', pagina: 0, objeto: 0, matriz: translacao(mm(7), mm(3)) }], pag);
    const e = (await eventos(saida))[0];
    perto(e.bbox.x0, mm(37));
    perto(e.bbox.y0, mm(33));
    perto(e.bbox.x1 - e.bbox.x0, mm(20)); // o tamanho não muda
  });

  it('com a página rodada (CTM com rotação), mover continua a ser mover na página', async () => {
    // roda 90°: (x, y) → (−y + 100 mm, x)
    const pag: PaginaRaw = { mediaMm: [100, 100], conteudo: `q 0 1 -1 0 ${mm(100)} 0 cm 0 1 1 0 k ${mm(20)} ${mm(20)} ${mm(20)} ${mm(10)} re f Q` };
    const { pdf } = await abrir(pag);
    const o = listarObjetos(prepararInspecao(pdf), 0)[0];
    const { saida } = await editar([{ tipo: 'transformar', pagina: 0, objeto: 0, matriz: translacao(mm(5), mm(-8)) }], pag);
    const e = (await eventos(saida))[0];
    perto(e.bbox.x0, o.bbox.x0 + mm(5));
    perto(e.bbox.y0, o.bbox.y0 - mm(8));
    perto(e.bbox.x1 - e.bbox.x0, o.bbox.x1 - o.bbox.x0);
  });

  it('mudar o tamanho em torno de um canto: o canto fica e o resto estica', async () => {
    const { pdf } = await abrir();
    const o = listarObjetos(prepararInspecao(pdf), 0)[1];
    const m = escalaEm(2, 0.5, o.bbox.x0, o.bbox.y0);
    const { saida, resumo } = await editar([{ tipo: 'transformar', pagina: 0, objeto: 1, matriz: m }]);
    const e = (await eventos(saida)).find((x) => corK(x) === '0,1,1,0')!;
    perto(e.bbox.x0, mm(20));
    perto(e.bbox.y0, mm(20));
    perto(e.bbox.x1 - e.bbox.x0, mm(40));
    perto(e.bbox.y1 - e.bbox.y0, mm(10));
    expect(resumo.redimensionados).toBe(1);
    expect(resumo.movidos).toBe(0);
  });

  it('levar a caixa para outra caixa (o que a interface faz com os campos X, Y, L, A)', async () => {
    const { pdf } = await abrir();
    const o = listarObjetos(prepararInspecao(pdf), 0)[1];
    const para = { x0: mm(10), y0: mm(50), x1: mm(30), y1: mm(80) };
    const { saida } = await editar([{ tipo: 'transformar', pagina: 0, objeto: 1, matriz: matrizParaCaixa(o.bbox, para) }]);
    const e = (await eventos(saida)).find((x) => corK(x) === '0,1,1,0')!;
    perto(e.bbox.x0, mm(10));
    perto(e.bbox.y0, mm(50));
    perto(e.bbox.x1, mm(30));
    perto(e.bbox.y1, mm(80));
  });

  it('mover um texto, um grupo, uma linha', async () => {
    const { pdf } = await abrir();
    const o = listarObjetos(prepararInspecao(pdf), 0);
    const d = translacao(mm(4), mm(6));
    const { saida } = await editar([3, 4, 5].map((id) => ({ tipo: 'transformar' as const, pagina: 0, objeto: id, matriz: d })));
    const ev = await eventos(saida);
    const texto = ev.find((e) => e.tipo === 'texto')!;
    perto(texto.bbox.x0, o[4].bbox.x0 + mm(4));
    const grupo = ev.find((e) => corK(e) === '0,0,1,0')!;
    perto(grupo.bbox.x0, mm(64));
    perto(grupo.bbox.y0, mm(66));
    const linha = ev.find((e) => e.traca && !e.preenche)!;
    perto(linha.bbox.y0, o[3].bbox.y0 + mm(6));
  });

  it('duas edições seguidas ao mesmo objeto compõem-se', async () => {
    const { saida } = await editar([
      { tipo: 'transformar', pagina: 0, objeto: 1, matriz: translacao(mm(5), 0) },
      { tipo: 'transformar', pagina: 0, objeto: 1, matriz: translacao(mm(5), mm(2)) },
    ]);
    const e = (await eventos(saida)).find((x) => corK(x) === '0,1,1,0')!;
    perto(e.bbox.x0, mm(30));
    perto(e.bbox.y0, mm(22));
  });

  it('apagar depois de mover: o objeto desaparece', async () => {
    const { saida } = await editar([
      { tipo: 'transformar', pagina: 0, objeto: 1, matriz: translacao(mm(5), 0) },
      { tipo: 'apagar', pagina: 0, objeto: 1 },
    ]);
    expect((await eventos(saida)).some((e) => corK(e) === '0,1,1,0')).toBe(false);
  });

  it('o que não se tocou fica igual (mesma caixa e mesma cor em todos os outros)', async () => {
    const { saida, original } = await editar([{ tipo: 'transformar', pagina: 0, objeto: 2, matriz: translacao(mm(3), 0) }]);
    const antes = await eventos(original);
    const depois = await eventos(saida);
    expect(depois).toHaveLength(antes.length);
    antes.forEach((a, i) => {
      if (corK(a) === '1,0.5,0,0') return;
      expect(depois[i].bbox).toEqual(a.bbox);
      expect(corK(depois[i])).toBe(corK(a));
    });
  });
});

describe('editar: mudar a cor', () => {
  it('o preenchimento de uma forma passa à cor nova (e só dela)', async () => {
    const { saida, resumo } = await editar([{ tipo: 'cor', pagina: 0, objeto: 1, preenchimento: [1, 0, 0, 0.2] }]);
    const ev = await eventos(saida);
    expect(ev.some((e) => corK(e) === '1,0,0,0.2')).toBe(true);
    expect(ev.some((e) => corK(e) === '0,1,1,0')).toBe(false);
    // o triângulo, que vem a seguir, não herda a cor
    expect(ev.some((e) => corK(e) === '1,0.5,0,0')).toBe(true);
    expect(resumo.recoloridos).toBe(1);
  });

  it('o traço de uma linha', async () => {
    const { saida } = await editar([{ tipo: 'cor', pagina: 0, objeto: 3, traco: [0, 1, 0, 0] }]);
    const l = (await eventos(saida)).find((e) => e.traca && !e.preenche)!;
    expect(l.corTraco?.valores.map((v) => Math.round(v * 100) / 100).join(',')).toBe('0,1,0,0');
  });

  it('o texto, mesmo quando o bloco traz a sua cor lá dentro', async () => {
    const pag: PaginaRaw = { ...PAGINA, conteudo: `BT /F1 12 Tf 0 0 0 1 k ${mm(15)} ${mm(60)} Td (Ola) Tj 1 0 0 0 k (mundo) Tj ET 0 1 0 0 k ${mm(50)} ${mm(50)} ${mm(10)} ${mm(10)} re f` };
    const { saida } = await editar([{ tipo: 'cor', pagina: 0, objeto: 0, preenchimento: [0, 0, 1, 0] }], pag);
    const ev = await eventos(saida);
    const textos = ev.filter((e) => e.tipo === 'texto');
    expect(textos).toHaveLength(2);
    for (const t of textos) expect(corK(t)).toBe('0,0,1,0');
    // a forma a seguir ficou como era
    expect(ev.some((e) => corK(e) === '0,1,0,0')).toBe(true);
  });

  it('cor e movimento no mesmo objeto', async () => {
    const { saida } = await editar([
      { tipo: 'transformar', pagina: 0, objeto: 1, matriz: translacao(mm(5), 0) },
      { tipo: 'cor', pagina: 0, objeto: 1, preenchimento: [0, 0, 0, 1] },
    ]);
    const e = (await eventos(saida)).find((x) => corK(x) === '0,0,0,1' && x.bbox.x1 - x.bbox.x0 < mm(30))!;
    perto(e.bbox.x0, mm(25));
  });
});

describe('editar: segurança', () => {
  it('o original nunca se altera (trabalha numa cópia carregada)', async () => {
    const { original } = await editar([{ tipo: 'apagar', pagina: 0, objeto: 1 }]);
    const copia = original.slice();
    await editar([{ tipo: 'apagar', pagina: 0, objeto: 1 }]);
    expect(original).toEqual(copia);
  });

  it('um objeto que não existe é ignorado e conta-se', async () => {
    const { resumo, saida } = await editar([{ tipo: 'apagar', pagina: 0, objeto: 99 }]);
    expect(resumo.ignoradas).toBe(1);
    expect((await eventos(saida)).length).toBe((await eventos(await gerarPdfRaw([PAGINA]))).length);
  });

  it('sem edições não muda nada', async () => {
    const { resumo } = await editar([]);
    expect(resumo.paginas).toEqual([]);
  });

  it('várias páginas: cada edição vai para a sua', async () => {
    const bytes = await gerarPdfRaw([PAGINA, PAGINA]);
    const pdf = await PDFDocument.load(bytes);
    const r = aplicarEdicoes(pdf, [{ tipo: 'apagar', pagina: 1, objeto: 1 }]);
    expect(r.paginas).toEqual([1]);
    const a = analisarDocumento(await abrirPdf(await pdf.save()));
    expect(a.paginas[0].ir.eventos.some((e) => corK(e) === '0,1,1,0')).toBe(true);
    expect(a.paginas[1].ir.eventos.some((e) => corK(e) === '0,1,1,0')).toBe(false);
  });

  it('a caixa transformada de uma matriz de escala e deslocamento', () => {
    const c = transformarCaixa({ x0: 0, y0: 0, x1: 10, y1: 20 }, [2, 0, 0, 3, 5, 7]);
    expect(c).toEqual({ x0: 5, y0: 7, x1: 25, y1: 67 });
  });
});
