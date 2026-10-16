import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarHumor, TEMPOS_OMISSAO } from '../../src/mascote/humor';

const T = TEMPOS_OMISSAO;

describe('mascote: humor quando ninguém mexe', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function seguir() {
    const vistos: string[] = [];
    const h = criarHumor((e) => vistos.push(e));
    return { vistos, h };
  }

  it('cumprimenta ao chegar e depois fica em repouso', () => {
    const { vistos } = seguir();
    expect(vistos).toEqual(['cumprimenta']);
    vi.advanceTimersByTime(T.cumprimentoMs);
    expect(vistos).toEqual(['cumprimenta', 'repouso']);
  });

  it('sem ninguém mexer: boceja e depois adormece', () => {
    const { vistos } = seguir();
    vi.advanceTimersByTime(T.cumprimentoMs + T.ateBocejarMs);
    expect(vistos.at(-1)).toBe('boceja');
    vi.advanceTimersByTime(T.bocejoMs);
    expect(vistos.at(-1)).toBe('dorme');
    expect(vistos).toEqual(['cumprimenta', 'repouso', 'boceja', 'dorme']);
  });

  it('cada gesto em repouso recomeça a contagem: nunca adormece se se for mexendo', () => {
    const { vistos, h } = seguir();
    vi.advanceTimersByTime(T.cumprimentoMs);
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(T.ateBocejarMs - 1000);
      h.atividade();
    }
    expect(vistos).toEqual(['cumprimenta', 'repouso']);
  });

  it('a dormir, um gesto acorda-a: cumprimenta e volta ao repouso', () => {
    const { vistos, h } = seguir();
    vi.advanceTimersByTime(T.cumprimentoMs + T.ateBocejarMs + T.bocejoMs);
    expect(vistos.at(-1)).toBe('dorme');
    h.atividade();
    expect(vistos.at(-1)).toBe('cumprimenta');
    vi.advanceTimersByTime(T.cumprimentoMs);
    expect(vistos.at(-1)).toBe('repouso');
  });

  it('a meio do bocejo, um gesto também a faz cumprimentar (e o bocejo não adormece-a depois)', () => {
    const { vistos, h } = seguir();
    vi.advanceTimersByTime(T.cumprimentoMs + T.ateBocejarMs);
    expect(vistos.at(-1)).toBe('boceja');
    h.atividade();
    vi.advanceTimersByTime(T.bocejoMs);
    expect(vistos).not.toContain('dorme');
    expect(vistos.at(-1)).toBe('repouso');
  });

  it('durante o cumprimento os gestos não o interrompem', () => {
    const { vistos, h } = seguir();
    h.atividade();
    h.atividade();
    expect(vistos).toEqual(['cumprimenta']);
  });

  it('parar cancela tudo', () => {
    const { vistos, h } = seguir();
    h.parar();
    vi.advanceTimersByTime(10 * 60_000);
    expect(vistos).toEqual(['cumprimenta']);
  });
});
