import { describe, expect, it } from 'vitest';
import { alvoDaBarra, progressoDoLote, SUBIDA_MIN, TETO } from '../src/interface/barra-notch';

describe('barra da notch: o alvo', () => {
  it('ao acabar vai a 100%, seja qual for o resto', () => {
    expect(alvoDaBarra(0, 0, true)).toBe(1);
    expect(alvoDaBarra(0.3, 5, true)).toBe(1);
  });

  it('um ficheiro pequeno (análise já feita) não salta: sobe a uma velocidade mínima até ao teto', () => {
    const valores = [0, 0.25, 0.5, 0.75, 1, 1.5, 3].map((t) => alvoDaBarra(1, t * SUBIDA_MIN * 0.667, false));
    for (let i = 1; i < valores.length; i++) expect(valores[i]).toBeGreaterThanOrEqual(valores[i - 1]);
    expect(alvoDaBarra(1, 0, false)).toBe(0);
    expect(alvoDaBarra(1, SUBIDA_MIN, false)).toBeCloseTo(TETO, 6);
    expect(alvoDaBarra(1, 60, false)).toBeCloseTo(TETO, 6);
  });

  it('nunca passa do teto antes de acabar, nem com a análise a 100%', () => {
    for (const t of [0, 0.5, 1, 2, 10]) expect(alvoDaBarra(1, t, false)).toBeLessThanOrEqual(TETO);
  });

  it('um ficheiro grande: segue o progresso real, que manda quando é mais lento', () => {
    expect(alvoDaBarra(0.5, 10, false)).toBeCloseTo(0.5 * TETO, 6);
    expect(alvoDaBarra(0.3, 10, false)).toBeCloseTo(0.3 * TETO, 6);
    // abaixo do chão do avanço lento (12%), é o chão que se vê
    expect(alvoDaBarra(0.05, 10, false)).toBeCloseTo(0.12, 6);
  });

  it('enquanto não há números, anda devagar para não parecer parada (e para no máximo em 12%)', () => {
    expect(alvoDaBarra(0, 1, false)).toBeCloseTo(0.02, 6);
    expect(alvoDaBarra(0, 100, false)).toBeCloseTo(0.12, 6);
  });

  it('valores fora de 0…1 ou tempos negativos não estragam a conta', () => {
    expect(alvoDaBarra(-1, -3, false)).toBe(0);
    expect(alvoDaBarra(7, 100, false)).toBeCloseTo(TETO, 6);
  });
});

describe('barra da notch: o lote de ficheiros', () => {
  const s = (id: number, aCarregar: boolean, progresso = 0) => ({ id, aCarregar, progresso });

  it('um ficheiro: o progresso dele', () => {
    const l = new Map<number, number>();
    expect(progressoDoLote(l, [s(1, true, 0.4)])).toBeCloseTo(0.4, 6);
  });

  it('vários: a média, e o que acabou vale 1 (a média não recua)', () => {
    const l = new Map<number, number>();
    expect(progressoDoLote(l, [s(1, true, 0.5), s(2, true, 0)])).toBeCloseTo(0.25, 6);
    // o 1.º acaba: passa a valer 1 em vez de sair da conta
    expect(progressoDoLote(l, [s(1, false), s(2, true, 0.2)])).toBeCloseTo(0.6, 6);
    expect(progressoDoLote(l, [s(1, false), s(2, false)])).toBe(1);
  });

  it('o progresso de um ficheiro não recua', () => {
    const l = new Map<number, number>();
    progressoDoLote(l, [s(1, true, 0.7)]);
    expect(progressoDoLote(l, [s(1, true, 0.1)])).toBeCloseTo(0.7, 6);
  });

  it('um ficheiro que entra a meio do lote puxa a média para baixo (é trabalho novo)', () => {
    const l = new Map<number, number>();
    progressoDoLote(l, [s(1, true, 0.9)]);
    expect(progressoDoLote(l, [s(1, true, 0.9), s(2, true, 0)])).toBeCloseTo(0.45, 6);
  });

  it('um separador fechado sai da conta; sem nada, 0', () => {
    const l = new Map<number, number>();
    progressoDoLote(l, [s(1, true, 0.5), s(2, true, 0.5)]);
    expect(progressoDoLote(l, [s(2, true, 0.5)])).toBeCloseTo(0.5, 6);
    expect(progressoDoLote(new Map(), [])).toBe(0);
  });

  it('separadores que nunca carregaram (ecrã inicial) não entram', () => {
    expect(progressoDoLote(new Map(), [s(1, false), s(2, false)])).toBe(0);
  });
});
