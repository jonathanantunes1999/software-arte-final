import { describe, expect, it } from 'vitest';
import { canalCinzento, compor, temTinta, tintaDoPixel, type PlacaPixels } from '../../src/separacoes/compor';

const placa = (grises: number[], cor: [number, number, number]): PlacaPixels => ({
  dados: Uint8ClampedArray.from(grises),
  cor,
});
const px = (d: Uint8ClampedArray, i: number) => [d[4 * i], d[4 * i + 1], d[4 * i + 2], d[4 * i + 3]];

describe('compor placas', () => {
  it('sem placas, ou placas sem tinta: papel branco', () => {
    expect(px(compor([], 1, 1), 0)).toEqual([255, 255, 255, 255]);
    expect(px(compor([placa([255], [0, 174, 239])], 1, 1), 0)).toEqual([255, 255, 255, 255]);
  });

  it('uma placa a 100%: a própria cor da tinta', () => {
    expect(px(compor([placa([0], [0, 174, 239])], 1, 1), 0)).toEqual([0, 174, 239, 255]);
  });

  it('50% de tinta: a meio caminho entre o papel e a tinta', () => {
    const [r, g, b] = px(compor([placa([127.5], [0, 0, 0])], 1, 1), 0);
    expect([r, g, b].every((v) => Math.abs(v - 127) <= 1)).toBe(true);
  });

  it('duas tintas multiplicam-se (ciano + amarelo dá verde)', () => {
    const c = placa([0], [0, 174, 239]);
    const y = placa([0], [255, 242, 0]);
    const [r, g, b] = px(compor([c, y], 1, 1), 0);
    expect(r).toBe(0);
    expect(g).toBe(Math.round((174 * 242) / 255));
    expect(b).toBe(0);
  });

  it('a ordem das placas não importa', () => {
    const a = placa([40, 200], [0, 174, 239]);
    const b = placa([90, 10], [236, 0, 140]);
    expect(Array.from(compor([a, b], 2, 1))).toEqual(Array.from(compor([b, a], 2, 1)));
  });

  it('cada pixel é independente', () => {
    const d = compor([placa([0, 255, 0], [10, 20, 30])], 3, 1);
    expect(px(d, 0)).toEqual([10, 20, 30, 255]);
    expect(px(d, 1)).toEqual([255, 255, 255, 255]);
    expect(px(d, 2)).toEqual([10, 20, 30, 255]);
  });

  it('papel de outra cor (para papéis não brancos)', () => {
    expect(px(compor([], 1, 1, [250, 240, 200]), 0)).toEqual([250, 240, 200, 255]);
  });

  it('placa com menos pixels que o ecrã é ignorada, sem rebentar', () => {
    expect(px(compor([placa([0], [0, 0, 0])], 2, 1), 0)).toEqual([255, 255, 255, 255]);
  });

  it('tinta de um pixel e deteção de placa vazia', () => {
    expect(tintaDoPixel(255)).toBe(0);
    expect(tintaDoPixel(0)).toBe(1);
    expect(tintaDoPixel(51)).toBeCloseTo(0.8);
    expect(temTinta(placa([255, 255, 255], [0, 0, 0]).dados)).toBe(false);
    expect(temTinta(placa([255, 200, 255], [0, 0, 0]).dados)).toBe(true);
    expect(temTinta(placa([251], [0, 0, 0]).dados)).toBe(false); // ruído de anti-aliasing
  });

  it('canal cinzento de um RGBA', () => {
    expect(Array.from(canalCinzento(Uint8ClampedArray.from([10, 1, 2, 255, 20, 3, 4, 255])))).toEqual([10, 20]);
  });
});
