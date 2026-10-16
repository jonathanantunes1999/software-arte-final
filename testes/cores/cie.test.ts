import { describe, expect, it } from 'vitest';
import { cmykParaLab, deltaE2000, labParaRgb, rgbParaLab, type Lab } from '../../src/cores/cie';

// Pares de teste publicados por Sharma, Wu e Dalal (2005), tabela 1
const SHARMA: [Lab, Lab, number][] = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
  [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[50, 2.5, 0], [61, -5, 29], 22.8977],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];

describe('ΔE 2000', () => {
  it.each(SHARMA)('par de Sharma %j / %j', (a, b, esperado) => {
    expect(deltaE2000(a, b)).toBeCloseTo(esperado, 3);
    expect(deltaE2000(b, a)).toBeCloseTo(esperado, 3);
  });
  it('a mesma cor dá 0', () => expect(deltaE2000([40, 10, -20], [40, 10, -20])).toBe(0));
});

describe('conversões', () => {
  it('branco e preto de sRGB', () => {
    expect(rgbParaLab(1, 1, 1)[0]).toBeCloseTo(100, 0);
    expect(rgbParaLab(0, 0, 0)[0]).toBeCloseTo(0, 5);
  });
  it('vermelho sRGB em D50 ≈ Lab 54 81 70', () => {
    const [L, a, b] = rgbParaLab(1, 0, 0);
    expect(L).toBeCloseTo(54.3, 0);
    expect(a).toBeCloseTo(80.8, 0);
    expect(b).toBeCloseTo(69.9, 0);
  });
  it('Lab → RGB devolve o que entrou', () => {
    for (const rgb of [[0.2, 0.5, 0.8], [1, 1, 1], [0.9, 0.1, 0.3]] as [number, number, number][]) {
      const r = labParaRgb(rgbParaLab(...rgb));
      r.forEach((v, i) => expect(v).toBeCloseTo(rgb[i], 2));
    }
  });
  it('CMYK 0 0 0 0 é branco e 0 0 0 1 é preto', () => {
    expect(cmykParaLab(0, 0, 0, 0)[0]).toBeCloseTo(100, 0);
    expect(cmykParaLab(0, 0, 0, 1)[0]).toBeCloseTo(0, 5);
  });
});
