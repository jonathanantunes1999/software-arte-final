import { describe, expect, it } from 'vitest';
import { agruparCaixas, uniaoDeCaixas } from '../../src/alertas/geometria';

const c = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

describe('agruparCaixas', () => {
  it('sem caixas, sem grupos', () => {
    expect(agruparCaixas([], 5)).toEqual([]);
  });

  it('caixas que se tocam ou sobrepõem juntam-se', () => {
    expect(agruparCaixas([c(0, 0, 10, 10), c(5, 5, 20, 20)], 0)).toEqual([c(0, 0, 20, 20)]);
  });

  it('caixas distantes ficam separadas', () => {
    const g = agruparCaixas([c(0, 0, 10, 10), c(100, 100, 110, 110)], 5);
    expect(g).toHaveLength(2);
  });

  it('a folga junta caixas quase a tocar-se', () => {
    expect(agruparCaixas([c(0, 0, 10, 10), c(13, 0, 20, 10)], 5)).toHaveLength(1);
    expect(agruparCaixas([c(0, 0, 10, 10), c(13, 0, 20, 10)], 2)).toHaveLength(2);
  });

  it('a ligação é transitiva: A toca B, B toca C', () => {
    const g = agruparCaixas([c(0, 0, 10, 10), c(30, 0, 40, 10), c(9, 0, 31, 10)], 0);
    expect(g).toEqual([c(0, 0, 40, 10)]);
  });

  it('proximidade só em x não chega: tem de haver também em y', () => {
    expect(agruparCaixas([c(0, 0, 10, 10), c(12, 100, 20, 110)], 5)).toHaveLength(2);
  });

  it('independente da ordem de entrada', () => {
    const a = [c(0, 0, 10, 10), c(8, 0, 20, 10), c(200, 200, 210, 210)];
    const r1 = agruparCaixas(a, 0).sort((p, q) => p.x0 - q.x0);
    const r2 = agruparCaixas([...a].reverse(), 0).sort((p, q) => p.x0 - q.x0);
    expect(r1).toEqual(r2);
    expect(r1).toHaveLength(2);
  });

  it('uniaoDeCaixas', () => {
    expect(uniaoDeCaixas([c(0, 5, 10, 10), c(-3, 0, 4, 20)])).toEqual(c(-3, 0, 10, 20));
  });
});
