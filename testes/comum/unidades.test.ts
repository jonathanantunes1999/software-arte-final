import { describe, expect, it } from 'vitest';
import { formatarMm, mmParaPt, ptParaMm } from '../../src/comum/unidades';

describe('unidades', () => {
  it('1 pt = 25,4/72 mm', () => {
    expect(ptParaMm(72)).toBeCloseTo(25.4, 10);
    expect(ptParaMm(595.2756)).toBeCloseTo(210, 2);
  });

  it('mm -> pt -> mm dá o mesmo valor', () => {
    expect(ptParaMm(mmParaPt(297))).toBeCloseTo(297, 10);
  });

  it('formata com uma casa decimal e vírgula', () => {
    expect(formatarMm(210)).toBe('210,0');
    expect(formatarMm(99.04)).toBe('99,0');
    expect(formatarMm(85.55)).toBe('85,6');
    expect(formatarMm(0)).toBe('0,0');
  });

  it('não mostra "-0,0"', () => {
    expect(formatarMm(-0.001)).toBe('0,0');
  });
});
