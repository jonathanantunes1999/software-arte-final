import { describe, expect, it } from 'vitest';
import { FORMATOS_PREDEFINIDOS, identificarFormato, sanearFormatos } from '../../src/comum/formatos';

const id = (l: number, a: number, formatos = FORMATOS_PREDEFINIDOS) => identificarFormato(l, a, formatos);

describe('identificarFormato', () => {
  it('reconhece A4 ao alto', () => {
    const r = id(210, 297);
    expect(r?.formato.nome).toBe('A4');
    expect(r?.horizontal).toBe(false);
  });

  it('reconhece A4 deitado e marca horizontal', () => {
    const r = id(297, 210);
    expect(r?.formato.nome).toBe('A4');
    expect(r?.horizontal).toBe(true);
  });

  it('reconhece todos os A0 a A7', () => {
    const medidas: [number, number, string][] = [
      [841, 1189, 'A0'], [594, 841, 'A1'], [420, 594, 'A2'], [297, 420, 'A3'],
      [210, 297, 'A4'], [148, 210, 'A5'], [105, 148, 'A6'], [74, 105, 'A7'],
    ];
    for (const [l, a, nome] of medidas) expect(id(l, a)?.formato.nome).toBe(nome);
  });

  it('reconhece DL e cartão de visita, ao alto e deitado', () => {
    expect(id(99, 210)?.formato.nome).toBe('DL');
    expect(id(210, 99)?.horizontal).toBe(true);
    expect(id(85, 55)?.formato.nome).toBe('Cartão de visita');
    expect(id(85, 55)?.horizontal).toBe(true);
    expect(id(55, 85)?.horizontal).toBe(false);
  });

  it('aceita ±0,5 mm e rejeita acima', () => {
    expect(id(210.5, 296.5)?.formato.nome).toBe('A4');
    expect(id(210.6, 297)).toBeNull();
    expect(id(210, 297.6)).toBeNull();
  });

  it('medida sem formato devolve null (aparece só a medida)', () => {
    expect(id(200, 200)).toBeNull();
    expect(id(213, 303)).toBeNull(); // A4 com 3 mm de sangria não é A4
  });

  it('usa formatos do utilizador', () => {
    const meus = [...FORMATOS_PREDEFINIDOS, { nome: 'Flyer 15x21 + aba', larguraMm: 150, alturaMm: 210 }];
    expect(id(150, 210, meus)?.formato.nome).toBe('Flyer 15x21 + aba');
  });

  it('com dois candidatos escolhe o de menor desvio', () => {
    const f = [
      { nome: 'X', larguraMm: 100, alturaMm: 200 },
      { nome: 'Y', larguraMm: 100.3, alturaMm: 200.3 },
    ];
    expect(id(100.3, 200.3, f)?.formato.nome).toBe('Y');
  });

  it('formato quadrado nunca é "horizontal"', () => {
    const f = [{ nome: 'Quadrado', larguraMm: 100, alturaMm: 100 }];
    expect(id(100, 100, f)?.horizontal).toBe(false);
  });
});

describe('sanearFormatos', () => {
  it('descarta entradas inválidas e limpa nomes', () => {
    const r = sanearFormatos([
      { nome: ' Meu ', larguraMm: 100, alturaMm: 50 },
      { nome: '', larguraMm: 1, alturaMm: 1 },
      { nome: 'Mau', larguraMm: -1, alturaMm: 1 },
      { nome: 'Texto', larguraMm: 'x', alturaMm: 1 },
      null,
    ]);
    expect(r).toEqual([{ nome: 'Meu', larguraMm: 100, alturaMm: 50 }]);
  });

  it('devolve null se não for lista', () => {
    expect(sanearFormatos('lixo')).toBeNull();
  });
});
