import { describe, expect, it } from 'vitest';
import type { Cor } from '../../src/analise/ir';
import { corInvisivel, idSpot, marcaPlaca, PLACAS_PROCESSO, placaDoNome, rgbParaCmyk, spotsDaCor, tintaNaPlaca, type Placa } from '../../src/separacoes/placas';

const [C, M, Y, K] = PLACAS_PROCESSO;
const spot = (nome: string): Placa => ({ id: idSpot(nome), tipo: 'spot', nome, rgb: [255, 0, 0] });
const cmyk = (c: number, m: number, y: number, k: number): Cor => ({ familia: 'CMYK', valores: [c, m, y, k] });
const sep = (nome: string, t = 1): Cor => ({ familia: 'Separation', valores: [t], nomes: [nome] });
const devn = (nomes: string[], valores: number[]): Cor => ({ familia: 'DeviceN', valores, nomes });
const tintas = (cor: Cor, placas: Placa[]) => placas.map((p) => tintaNaPlaca(cor, p));

describe('tinta por placa', () => {
  it('CMYK: cada componente na sua placa; spots a zero', () => {
    expect(tintas(cmyk(0.1, 0.2, 0.3, 0.4), [C, M, Y, K, spot('X')])).toEqual([0.1, 0.2, 0.3, 0.4, 0]);
  });

  it('cinzento: 0 é preto (K 100%), 1 é branco', () => {
    expect(tintas({ familia: 'Gray', valores: [0] }, [C, M, Y, K])).toEqual([0, 0, 0, 1]);
    expect(tintas({ familia: 'Gray', valores: [0.25] }, [C, K])).toEqual([0, 0.75]);
    expect(tintaNaPlaca({ familia: 'Gray', valores: [1] }, K)).toBe(0);
  });

  it('RGB: conversão ingénua; branco não leva tinta, preto leva K, vermelho leva M e Y', () => {
    expect(tintas({ familia: 'RGB', valores: [1, 1, 1] }, [C, M, Y, K])).toEqual([0, 0, 0, 0]);
    expect(tintas({ familia: 'RGB', valores: [0, 0, 0] }, [C, M, Y, K])).toEqual([0, 0, 0, 1]);
    expect(tintas({ familia: 'RGB', valores: [1, 0, 0] }, [C, M, Y, K])).toEqual([0, 1, 1, 0]);
    expect(rgbParaCmyk(0.5, 0.5, 0.5)).toEqual([0, 0, 0, 0.5]);
  });

  it('Lab: L 100 sem tinta, L 0 só K', () => {
    expect(tintas({ familia: 'Lab', valores: [100, 0, 0] }, [C, M, Y, K])).toEqual([0, 0, 0, 0]);
    expect(tintas({ familia: 'Lab', valores: [0, 0, 0] }, [C, M, Y, K])).toEqual([0, 0, 0, 1]);
  });

  it('Separation: só a placa da spot, com a percentagem', () => {
    expect(tintas(sep('PANTONE 485 C', 0.6), [C, K, spot('PANTONE 485 C'), spot('outra')])).toEqual([0, 0, 0.6, 0]);
  });

  it('o nome da spot compara-se tal e qual (maiúsculas contam), ignorando espaços nas pontas', () => {
    expect(tintaNaPlaca(sep(' Verniz ', 1), spot('Verniz'))).toBe(1);
    expect(tintaNaPlaca(sep('verniz', 1), spot('Verniz'))).toBe(0);
  });

  it('Separation chamada Black/Cyan/... é a placa de processo', () => {
    expect(tintaNaPlaca(sep('Black', 0.5), K)).toBe(0.5);
    expect(tintaNaPlaca(sep('cyan', 1), C)).toBe(1);
    expect(placaDoNome('Magenta')).toBe('M');
  });

  it('All (registo) leva tinta em todas as placas; None em nenhuma', () => {
    expect(tintas(sep('All', 1), [C, M, Y, K, spot('X')])).toEqual([1, 1, 1, 1, 1]);
    expect(tintas(sep('None', 1), [C, K, spot('X')])).toEqual([0, 0, 0]);
  });

  it('DeviceN: cada tinta na sua placa, misturando processo e spots', () => {
    const c = devn(['Cyan', 'PANTONE 485 C', 'Black'], [0.3, 0.7, 0.1]);
    expect(tintas(c, [C, M, K, spot('PANTONE 485 C')])).toEqual([0.3, 0, 0.1, 0.7]);
  });

  it('DeviceN com a mesma tinta repetida: vale a maior, não a soma', () => {
    expect(tintaNaPlaca(devn(['X', 'X'], [0.3, 0.4]), spot('X'))).toBe(0.4);
  });

  it('valores fora de 0–1 ou NaN são cortados', () => {
    expect(tintaNaPlaca(cmyk(1.5, -1, 0, 0), C)).toBe(1);
    expect(tintaNaPlaca(cmyk(1.5, -1, 0, 0), M)).toBe(0);
    expect(tintaNaPlaca(sep('X', NaN), spot('X'))).toBe(0);
  });

  it('cor com número errado de componentes (ex.: Indexed) não dá tinta', () => {
    expect(tintas({ familia: 'CMYK', valores: [3] }, [C, M, Y, K])).toEqual([0, 0, 0, 0]);
  });

  it('padrão e desconhecida: sem tinta', () => {
    expect(tintas({ familia: 'Pattern', valores: [] }, [C, K])).toEqual([0, 0]);
    expect(tintas({ familia: 'Desconhecido', valores: [] }, [C, K])).toEqual([0, 0]);
  });
});

describe('overprint: que placas a cor marca', () => {
  const todas = [C, M, Y, K, spot('X')];
  const marca = (cor: Cor, op: boolean, modo: 0 | 1 = 0) => todas.map((p) => marcaPlaca(cor, p, op, modo));

  it('sem overprint marca tudo, mesmo o que está a zero', () => {
    expect(marca(cmyk(0, 0, 0, 1), false)).toEqual([true, true, true, true, true]);
    expect(marca(sep('X'), false)).toEqual([true, true, true, true, true]);
  });

  it('CMYK com overprint em modo 0: as 4 de processo (zeros apagam), spots intactas', () => {
    expect(marca(cmyk(0, 0, 0, 1), true, 0)).toEqual([true, true, true, true, false]);
  });

  it('CMYK com overprint em modo 1: só as componentes não nulas', () => {
    expect(marca(cmyk(0, 0, 0, 1), true, 1)).toEqual([false, false, false, true, false]);
    expect(marca(cmyk(0.5, 0, 0.2, 0), true, 1)).toEqual([true, false, true, false, false]);
  });

  it('cinzento com overprint: só o K', () => {
    expect(marca({ familia: 'Gray', valores: [0] }, true, 1)).toEqual([false, false, false, true, false]);
    expect(marca({ familia: 'Gray', valores: [0] }, true, 0)).toEqual([true, true, true, true, false]);
  });

  it('spot com overprint: só a sua placa (e só se tiver tinta); o modo não conta', () => {
    expect(marca(sep('X', 0.5), true, 0)).toEqual([false, false, false, false, true]);
    expect(marca(sep('X', 0), true, 0)).toEqual([false, false, false, false, false]);
    expect(marca(sep('Outra'), true, 1)).toEqual([false, false, false, false, false]);
  });

  it('All com overprint marca todas; None não marca nenhuma', () => {
    expect(marca(sep('All'), true)).toEqual([true, true, true, true, true]);
    expect(marca(sep('None'), true)).toEqual([false, false, false, false, false]);
    expect(corInvisivel(sep('None'))).toBe(true);
    expect(corInvisivel(sep('X'))).toBe(false);
  });

  it('DeviceN com overprint: as placas com tinta', () => {
    expect(marca(devn(['Cyan', 'X'], [0.4, 0.2]), true)).toEqual([true, false, false, false, true]);
    expect(marca(devn(['Cyan', 'X'], [0, 0.2]), true)).toEqual([false, false, false, false, true]);
  });

  it('RGB, Lab e padrões ignoram o overprint', () => {
    expect(marca({ familia: 'RGB', valores: [1, 0, 0] }, true)).toEqual([true, true, true, true, true]);
    expect(marca({ familia: 'Lab', valores: [50, 0, 0] }, true)).toEqual([true, true, true, true, true]);
    expect(marca({ familia: 'Pattern', valores: [] }, true)).toEqual([true, true, true, true, true]);
  });
});

describe('spots de uma cor', () => {
  it('só as spots, sem processo, All nem None', () => {
    expect(spotsDaCor(sep('PANTONE 485 C'))).toEqual(['PANTONE 485 C']);
    expect(spotsDaCor(sep('Black'))).toEqual([]);
    expect(spotsDaCor(sep('All'))).toEqual([]);
    expect(spotsDaCor(devn(['Cyan', 'Verniz', 'None'], [1, 1, 1]))).toEqual(['Verniz']);
    expect(spotsDaCor(cmyk(1, 0, 0, 0))).toEqual([]);
    expect(spotsDaCor(undefined)).toEqual([]);
  });
});
