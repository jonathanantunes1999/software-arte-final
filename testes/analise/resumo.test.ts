import { describe, expect, it } from 'vitest';
import { agruparTamanhos, resumirSangria } from '../../src/analise/resumo';

const lados = (e: number, c: number, d: number, b: number) => ({ esquerda: e, cima: c, direita: d, baixo: b });

describe('resumirSangria', () => {
  it('3 mm em todos os lados com referência 3 mm: ok e uniforme', () => {
    const r = resumirSangria(lados(3, 3, 3, 3), 'BleedBox', 3);
    expect(r).toMatchObject({ estado: 'ok', uniforme: true, minimoMm: 3 });
  });

  it('um só lado abaixo da referência: abaixo, e o mínimo é esse lado', () => {
    const r = resumirSangria(lados(3, 3, 3, 1.5), 'BleedBox', 3);
    expect(r).toMatchObject({ estado: 'abaixo', uniforme: false, minimoMm: 1.5 });
  });

  it('compara ao valor mostrado: 2,96 conta como 3,0', () => {
    expect(resumirSangria(lados(2.96, 3, 3, 3), 'BleedBox', 3).estado).toBe('ok');
    expect(resumirSangria(lados(2.9, 3, 3, 3), 'BleedBox', 3).estado).toBe('abaixo');
  });

  it('referência configurável', () => {
    expect(resumirSangria(lados(3, 3, 3, 3), 'BleedBox', 5).estado).toBe('abaixo');
    expect(resumirSangria(lados(5, 5, 5, 5), 'BleedBox', 5).estado).toBe('ok');
  });

  it('sem BleedBox: estado próprio, não "abaixo"', () => {
    expect(resumirSangria(lados(0, 0, 0, 0), 'nenhuma', 3).estado).toBe('sem-bleedbox');
  });
});

describe('agruparTamanhos', () => {
  it('junta páginas iguais e separa as diferentes, por ordem', () => {
    const g = agruparTamanhos(
      [
        { larguraMm: 210, alturaMm: 297 },
        { larguraMm: 148, alturaMm: 210 },
        { larguraMm: 210.2, alturaMm: 297 },
        { larguraMm: 148, alturaMm: 210 },
      ],
      0.5,
    );
    expect(g).toHaveLength(2);
    expect(g[0].paginas).toEqual([0, 2]);
    expect(g[1].paginas).toEqual([1, 3]);
  });

  it('tudo igual dá um só grupo', () => {
    expect(agruparTamanhos([{ larguraMm: 1, alturaMm: 2 }, { larguraMm: 1, alturaMm: 2 }], 0.5)).toHaveLength(1);
  });
});
