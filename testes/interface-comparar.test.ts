import { describe, expect, it } from 'vitest';
import { COR_DIFERENCA, diferenca, type Pixeis } from '../src/interface/comparar';

const img = (largura: number, altura: number, f: (i: number) => [number, number, number]): Pixeis => {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) [dados[i * 4], dados[i * 4 + 1], dados[i * 4 + 2], dados[i * 4 + 3]] = [...f(i), 255];
  return { largura, altura, dados };
};
const px = (p: Pixeis, i: number) => Array.from(p.dados.slice(i * 4, i * 4 + 4));

describe('mapa de diferenças', () => {
  it('imagens iguais: nada mudou e o resultado é o antes esbatido', () => {
    const a = img(2, 1, () => [0, 0, 0]);
    const r = diferenca(a, a);
    expect(r.mudados).toBe(0);
    expect(r.total).toBe(2);
    expect(px(r.pixeis, 0)).toEqual([166, 166, 166, 255]); // preto a 35%
  });

  it('pixeis diferentes ficam a magenta e contam-se', () => {
    const a = img(3, 1, () => [255, 255, 255]);
    const b = img(3, 1, (i) => (i === 1 ? [0, 0, 0] : [255, 255, 255]));
    const r = diferenca(a, b);
    expect(r.mudados).toBe(1);
    expect(px(r.pixeis, 1)).toEqual([...COR_DIFERENCA, 255]);
    expect(px(r.pixeis, 0)).toEqual([255, 255, 255, 255]);
  });

  it('diferenças abaixo do limiar (ruído de anti-aliasing) não contam', () => {
    const a = img(1, 1, () => [100, 100, 100]);
    expect(diferenca(a, img(1, 1, () => [110, 110, 110])).mudados).toBe(0); // 30 < 40
    expect(diferenca(a, img(1, 1, () => [115, 115, 115])).mudados).toBe(1); // 45 > 40
    expect(diferenca(a, img(1, 1, () => [115, 115, 115]), 100).mudados).toBe(0);
  });

  it('a diferença soma os três canais', () => {
    const a = img(1, 1, () => [0, 0, 0]);
    expect(diferenca(a, img(1, 1, () => [15, 15, 15])).mudados).toBe(1); // 45
    expect(diferenca(a, img(1, 1, () => [41, 0, 0])).mudados).toBe(1);
    expect(diferenca(a, img(1, 1, () => [39, 0, 0])).mudados).toBe(0);
  });

  it('tamanhos diferentes: tudo conta como mudado', () => {
    const r = diferenca(img(2, 1, () => [0, 0, 0]), img(1, 1, () => [0, 0, 0]));
    expect(r.mudados).toBe(2);
  });
});
