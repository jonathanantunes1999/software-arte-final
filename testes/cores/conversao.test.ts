import { describe, expect, it } from 'vitest';
import { converterPixeisRgb, rgbParaCmykBytes, rgbParaCmykPrensa } from '../../src/cores/conversao';

const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);

describe('RGB → CMYK (sem perfis)', () => {
  it('preto RGB é só K 100%, não um preto de quatro cores', () => {
    expect(rgbParaCmykPrensa(0, 0, 0)).toEqual([0, 0, 0, 1]);
  });

  it('branco é papel (sem tinta)', () => {
    expect(rgbParaCmykPrensa(1, 1, 1)).toEqual([0, 0, 0, 0]);
  });

  it('cinzentos ficam só em K, de 0 a 100%', () => {
    for (const v of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const [c, m, y, k] = rgbParaCmykPrensa(v, v, v);
      expect([c, m, y]).toEqual([0, 0, 0]);
      expect(k).toBeCloseTo(1 - v, 10);
    }
  });

  it('primárias saturadas não levam K: vermelho = M+Y, verde = C+Y, azul = C+M', () => {
    expect(rgbParaCmykPrensa(1, 0, 0)).toEqual([0, 1, 1, 0]);
    expect(rgbParaCmykPrensa(0, 1, 0)).toEqual([1, 0, 1, 0]);
    expect(rgbParaCmykPrensa(0, 0, 1)).toEqual([1, 1, 0, 0]);
    expect(rgbParaCmykPrensa(0, 1, 1)).toEqual([1, 0, 0, 0]);
  });

  it('a soma das tintas respeita o limite (cores escuras e saturadas)', () => {
    let pior = 0;
    for (let r = 0; r <= 255; r += 15) for (let g = 0; g <= 255; g += 15) for (let b = 0; b <= 255; b += 15) {
      const v = rgbParaCmykPrensa(r / 255, g / 255, b / 255);
      pior = Math.max(pior, soma(v));
      v.forEach((x) => {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
      });
    }
    expect(pior).toBeLessThanOrEqual(3 + 1e-9);
  });

  it('o limite de tinta também se aplica quando é mais baixo (jornal: 240%)', () => {
    // azul quase preto: sem limite dava C100 M100 Y50 K96 (346%)
    const livre = rgbParaCmykPrensa(0, 0, 5 / 255, 10);
    expect(soma(livre)).toBeGreaterThan(3.4);
    expect(soma(rgbParaCmykPrensa(0, 0, 5 / 255))).toBeLessThanOrEqual(3 + 1e-9);
    const limitado = rgbParaCmykPrensa(0, 0, 5 / 255, 2.4);
    expect(soma(limitado)).toBeLessThanOrEqual(2.4 + 1e-9);
    // o K não muda: só se reduz C, M e Y, na mesma proporção
    expect(limitado[3]).toBeCloseTo(livre[3], 10);
    expect(limitado[0] / limitado[1]).toBeCloseTo(livre[0] / livre[1], 6);
  });

  it('é contínua: um passo pequeno em RGB não dá um salto em CMYK', () => {
    let maior = 0;
    for (let t = 0; t < 255; t++) {
      // do cinzento para o vermelho
      const a = rgbParaCmykPrensa(0.5 + t / 510, 0.5 - t / 510, 0.5 - t / 510);
      const b = rgbParaCmykPrensa(0.5 + (t + 1) / 510, 0.5 - (t + 1) / 510, 0.5 - (t + 1) / 510);
      maior = Math.max(maior, ...a.map((x, i) => Math.abs(x - b[i])));
    }
    expect(maior).toBeLessThan(0.02);
  });

  it('valores fora de 0–1 são cortados', () => {
    expect(rgbParaCmykPrensa(-1, 2, 0.5)).toEqual(rgbParaCmykPrensa(0, 1, 0.5));
  });
});

describe('pixeis', () => {
  it('converte 3 bytes por pixel em 4 e dá o mesmo que a conversão de uma cor', () => {
    const rgb = Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 0, 0, 255, 0, 0, 128, 128, 128]);
    const r = converterPixeisRgb(rgb, 5);
    expect(r).toHaveLength(20);
    expect([...r.subarray(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...r.subarray(4, 8)]).toEqual([0, 0, 0, 0]);
    expect([...r.subarray(8, 12)]).toEqual([0, 255, 255, 0]);
    expect([...r.subarray(12, 16)]).toEqual([0, 255, 255, 0]); // igual ao anterior (reaproveita)
    expect([...r.subarray(16, 20)]).toEqual([0, 0, 0, 127]);
  });
});

describe('em bytes', () => {
  it('a soma nunca passa o limite depois de arredondar (300,4% era possível)', () => {
    for (const limite of [3, 2.4]) {
      let pior = 0;
      for (let r = 0; r < 256; r += 3) for (let g = 0; g < 256; g += 3) for (let b = 0; b < 256; b += 3) {
        const v = rgbParaCmykBytes(r / 255, g / 255, b / 255, limite);
        pior = Math.max(pior, v[0] + v[1] + v[2] + v[3]);
      }
      expect(pior).toBeLessThanOrEqual(Math.floor(limite * 255));
    }
  });
  it('preto e branco continuam exatos', () => {
    expect(rgbParaCmykBytes(0, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(rgbParaCmykBytes(1, 1, 1)).toEqual([0, 0, 0, 0]);
  });
});
