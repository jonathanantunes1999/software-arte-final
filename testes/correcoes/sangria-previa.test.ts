import { describe, expect, it } from 'vitest';
import { aplicar, IDENTIDADE, inverter, matrizDaFaixa, multiplicar, planearSangriaPrevia, retanguloEmPixeis, type Matriz } from '../../src/interface/sangria-previa';
import { conteudoDeSangria, faixasDeSangria } from '../../src/correcoes/sangria';
import { mmParaPt } from '../../src/comum/unidades';

const caixa = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });
const perto = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
};

describe('sangria: as faixas', () => {
  const trim = caixa(10, 20, 110, 220);
  const faixas = faixasDeSangria(trim, 8);

  it('são oito, à volta do corte, sem a do meio', () => {
    expect(faixas).toHaveLength(8);
    expect(faixas.some((f) => f.ex === 1 && f.ey === 1)).toBe(false); // a do meio é a própria página
    expect(faixas.filter((f) => f.ex === -1 && f.ey === -1)).toHaveLength(4); // cantos
    expect(faixas.filter((f) => f.ex === 1 || f.ey === 1)).toHaveLength(4); // lados
  });

  it('cada faixa cai fora do corte e tem a largura da sangria no eixo que se espelha', () => {
    for (const f of faixas) {
      const dentro = f.clip.x >= trim.x0 && f.clip.x + f.clip.w <= trim.x1 && f.clip.y >= trim.y0 && f.clip.y + f.clip.h <= trim.y1;
      expect(dentro).toBe(false);
      if (f.ex === -1) expect(f.clip.w).toBe(8);
      if (f.ey === -1) expect(f.clip.h).toBe(8);
    }
  });

  it('o espelho põe o conteúdo junto ao corte do lado de lá: o ponto no corte fica onde está', () => {
    const esquerda = faixas.find((f) => f.ex === -1 && f.ey === 1)!;
    // x = 10 (o corte) → 10; x = 14 (4 mm para dentro) → 6 (4 para fora)
    expect(esquerda.ex * 10 + esquerda.tx).toBe(10);
    expect(esquerda.ex * 14 + esquerda.tx).toBe(6);
  });

  it('o conteúdo gerado continua a ser o que sai destas faixas', () => {
    const c = conteudoDeSangria(trim, 8, 'F');
    expect(c.match(/ re W n /g)).toHaveLength(8);
    expect(c).toContain('q 2 20 8 200 re W n -1 0 0 1 20 0 cm /F Do Q');
  });
});

describe('sangria: preview, matrizes', () => {
  const m: Matriz = [2, 0, 0, -2, 5, 100];

  it('a inversa desfaz a matriz', () => {
    perto(aplicar(multiplicar(inverter(m), m), 7, 9), [7, 9]);
    perto(aplicar(inverter(m), ...aplicar(m, 3, 4)), [3, 4]);
  });

  it('multiplicar aplica primeiro a da direita', () => {
    const t: Matriz = [1, 0, 0, 1, 10, 0];
    const e: Matriz = [2, 0, 0, 2, 0, 0];
    perto(aplicar(multiplicar(t, e), 1, 1), [12, 2]); // escala e depois desloca
    perto(aplicar(multiplicar(e, t), 1, 1), [22, 2]);
  });

  it('a inversa de uma matriz sem área é a identidade (não rebenta)', () => {
    expect(inverter([0, 0, 0, 0, 1, 1])).toEqual(IDENTIDADE);
  });

  it('a faixa leva um pixel da página para o ponto espelhado, no sítio certo do canvas do preview', () => {
    // a página desenhada a 2 px/pt com o y para baixo e origem em (0, 200 pt); o preview é a mesma coisa deslocada
    const ptParaTela: Matriz = [2, 0, 0, -2, 0, 400];
    const ptParaPrevia: Matriz = [2, 0, 0, -2, 30, 430];
    const trim = caixa(20, 20, 120, 180);
    const faixa = faixasDeSangria(trim, 10).find((f) => f.ex === -1 && f.ey === 1)!; // lado esquerdo
    const mt = matrizDaFaixa(faixa, ptParaTela, ptParaPrevia);
    // o pixel da página que mostra o ponto (26, 100) pt, 6 pt para dentro do corte...
    const pixel = aplicar(ptParaTela, 26, 100);
    // ...tem de acabar no preview onde está o ponto (14, 100) pt, 6 pt para fora
    perto(aplicar(mt, ...pixel), aplicar(ptParaPrevia, 14, 100));
  });

  it('sem faixa, a página fica no sítio dela (só muda de canvas)', () => {
    const ptParaTela: Matriz = [2, 0, 0, -2, 0, 400];
    const ptParaPrevia: Matriz = [2, 0, 0, -2, 30, 430];
    const mt = matrizDaFaixa(null, ptParaTela, ptParaPrevia);
    perto(aplicar(mt, ...aplicar(ptParaTela, 50, 60)), aplicar(ptParaPrevia, 50, 60));
  });
});

describe('sangria: faixas em pixeis inteiros', () => {
  const ptParaPrevia: Matriz = [2.37, 0, 0, -2.37, 13.4, 700.6];
  const trim = caixa(20.3, 20.7, 120.1, 180.9);
  const faixas = faixasDeSangria(trim, 8.4);

  it('as arestas são inteiras', () => {
    for (const f of faixas) {
      const r = retanguloEmPixeis(ptParaPrevia, f.clip);
      for (const v of [r.x, r.y, r.w, r.h]) expect(Number.isInteger(v)).toBe(true);
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
  });

  it('faixas vizinhas partilham a fronteira (sem riscas nem sobreposição)', () => {
    const r = (ex: number, ey: number, lado: 'e' | 'd' | 'c' | 'b') => {
      const f = faixas.find((q) => q.ex === ex && q.ey === ey && (lado === 'e' ? q.clip.x < trim.x0 && q.clip.y >= trim.y0 && q.clip.y < trim.y1 : lado === 'd' ? q.clip.x >= trim.x1 && q.clip.y >= trim.y0 && q.clip.y < trim.y1 : lado === 'c' ? q.clip.y >= trim.y1 && q.clip.x >= trim.x0 && q.clip.x < trim.x1 : q.clip.y < trim.y0 && q.clip.x >= trim.x0 && q.clip.x < trim.x1))!;
      return retanguloEmPixeis(ptParaPrevia, f.clip);
    };
    const esquerda = r(-1, 1, 'e');
    const cima = r(1, -1, 'c');
    const cantoTL = faixas.find((q) => q.clip.x < trim.x0 && q.clip.y >= trim.y1)!;
    const rc = retanguloEmPixeis(ptParaPrevia, cantoTL.clip);
    // o canto fica por cima da esquerda... e ao lado da de cima: encostam-se
    expect(rc.x + rc.w).toBe(cima.x);
    expect(rc.y + rc.h).toBe(esquerda.y);
  });
});

describe('sangria: plano do preview', () => {
  const trim = caixa(28.35, 28.35, 328.35, 228.35);

  it('sem margem: a folha cresce a sangria toda para cada lado', () => {
    const p = planearSangriaPrevia({ trim, crop: trim, media: caixa(0, 0, 356.7, 256.7) }, 1, 3);
    expect(p.s).toBeCloseTo(mmParaPt(3), 6);
    expect(p.alvo.x0).toBeCloseTo(trim.x0 - mmParaPt(3), 6);
    expect(p.extensaoPt).toBeCloseTo(mmParaPt(3), 6);
    expect(p.folha).toEqual(p.alvo);
  });

  it('com margem a sobrar (marcas): a folha não cresce', () => {
    const p = planearSangriaPrevia({ trim, crop: caixa(0, 0, 356.7, 256.7), media: caixa(0, 0, 356.7, 256.7) }, 1, 3);
    expect(p.extensaoPt).toBe(0);
    expect(p.folha).toEqual(caixa(0, 0, 356.7, 256.7));
  });

  it('margem só de um lado: cresce o que falta nos outros', () => {
    const crop = caixa(trim.x0 - mmParaPt(10), trim.y0, trim.x1, trim.y1);
    const p = planearSangriaPrevia({ trim, crop, media: caixa(0, 0, 400, 400) }, 1, 5);
    expect(p.folha.x0).toBeCloseTo(crop.x0, 6); // já tinha mais de 5 mm à esquerda
    expect(p.folha.x1).toBeCloseTo(trim.x1 + mmParaPt(5), 6);
    expect(p.extensaoPt).toBeCloseTo(mmParaPt(5), 6);
  });

  it('a CropBox fora da MediaBox conta só o que está dentro dela', () => {
    const p = planearSangriaPrevia({ trim, crop: caixa(-50, -50, 500, 500), media: caixa(0, 0, 356.7, 256.7) }, 1, 3);
    expect(p.extensaoPt).toBe(0);
    expect(p.folha).toEqual(caixa(0, 0, 356.7, 256.7));
  });

  it('o UserUnit encolhe a sangria em unidades de utilizador', () => {
    const p = planearSangriaPrevia({ trim, crop: trim, media: trim }, 2, 3);
    expect(p.s).toBeCloseTo(mmParaPt(3) / 2, 6);
  });
});
