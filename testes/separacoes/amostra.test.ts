import { PDFContext } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { amostraSeparacao, cmykParaRgb, labParaRgb } from '../../src/analise/amostra';
import { Leitor } from '../../src/analise/leitor';

describe('amostras de cor', () => {
  it('CMYK: papel, preto e primárias', () => {
    expect(cmykParaRgb(0, 0, 0, 0)).toEqual([255, 255, 255]);
    const k = cmykParaRgb(0, 0, 0, 1);
    expect(Math.max(...k)).toBeLessThan(70);
    const c = cmykParaRgb(1, 0, 0, 0);
    expect(c[0]).toBeLessThan(40);
    expect(c[2]).toBeGreaterThan(200);
    const m = cmykParaRgb(0, 1, 0, 0);
    expect(m[0]).toBeGreaterThan(200);
    expect(m[1]).toBeLessThan(80);
    const y = cmykParaRgb(0, 0, 1, 0);
    expect(y[0]).toBeGreaterThan(240);
    expect(y[1]).toBeGreaterThan(200);
    expect(y[2]).toBeLessThan(80);
  });

  it('Lab: branco, preto e um vermelho', () => {
    expect(labParaRgb(100, 0, 0)).toEqual([255, 255, 255]);
    expect(labParaRgb(0, 0, 0)).toEqual([0, 0, 0]);
    const [r, g, b] = labParaRgb(50, 70, 50);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(80);
  });

  function separacao(alt: unknown, tint: unknown) {
    const ctx = PDFContext.create();
    const l = new Leitor(ctx);
    const f = ctx.register(ctx.obj(tint as never));
    const arr = ctx.obj(['Separation', 'Teste', alt, f] as never);
    return amostraSeparacao(l, arr as never);
  }

  it('Separation com alternativa CMYK: avalia a tinta a 100%', () => {
    const rgb = separacao('DeviceCMYK', { FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [0, 1, 1, 0], N: 1 })!;
    expect(rgb[0]).toBeGreaterThan(200);
    expect(rgb[1]).toBeLessThan(80);
  });

  it('Separation com alternativa Gray e RGB', () => {
    expect(separacao('DeviceGray', { FunctionType: 2, Domain: [0, 1], C0: [1], C1: [0], N: 1 })).toEqual([0, 0, 0]);
    expect(separacao('DeviceRGB', { FunctionType: 2, Domain: [0, 1], C0: [1, 1, 1], C1: [0, 0.5, 1], N: 1 })).toEqual([0, 128, 255]);
  });

  it('função que não se consegue ler: sem amostra, sem rebentar', () => {
    expect(separacao('DeviceCMYK', { FunctionType: 9 })).toBeUndefined();
    expect(separacao('Qualquer', { FunctionType: 2, Domain: [0, 1], N: 1 })).toBeUndefined();
  });
});
