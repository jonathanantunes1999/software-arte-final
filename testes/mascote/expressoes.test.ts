import { describe, expect, it } from 'vitest';
import { DE_FESTA, EXPRESSOES, escolherDeFesta, expressao } from '../../src/mascote/expressoes';

describe('mascote: expressões', () => {
  it('há pelo menos 20, com ids únicos e nomes preenchidos', () => {
    expect(EXPRESSOES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(EXPRESSOES.map((e) => e.id)).size).toBe(EXPRESSOES.length);
    expect(new Set(EXPRESSOES.map((e) => e.nome)).size).toBe(EXPRESSOES.length);
    for (const e of EXPRESSOES) {
      expect(e.nome.length).toBeGreaterThan(1);
      expect(e.descricao.length).toBeGreaterThan(5);
      expect(e.rubor).toBeGreaterThanOrEqual(0);
      expect(e.rubor).toBeLessThanOrEqual(1);
    }
  });

  it('os estados que a app usa existem', () => {
    for (const id of ['repouso', 'analisa', 'procura', 'trabalha', 'ok', 'aviso', 'erro', 'dorme', 'boceja', 'cumprimenta']) {
      expect(EXPRESSOES.some((e) => e.id === id)).toBe(true);
    }
  });

  it('o tom que lava o corpo é uma cor #rrggbb com força entre 0 e 1', () => {
    for (const e of EXPRESSOES) {
      if (!e.lavado) continue;
      expect(e.lavado[0]).toMatch(/^#[0-9a-f]{6}$/);
      expect(e.lavado[1]).toBeGreaterThan(0);
      expect(e.lavado[1]).toBeLessThanOrEqual(1);
    }
  });

  it('um id desconhecido cai no repouso', () => {
    expect(expressao('nao-existe').id).toBe('repouso');
    expect(expressao('ama').olhos).toBe('coracoes');
  });

  it('as de festa são todas alegres: nada de erro, aviso ou irritação', () => {
    for (const id of DE_FESTA) {
      expect(['erro', 'aviso', 'irritada', 'dorme', 'tonta'].includes(id) && id !== 'tonta').toBe(false);
      expect(expressao(id).id).toBe(id);
    }
  });

  it('escolherDeFesta nunca repete a atual e cobre todas as outras', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const e = escolherDeFesta('feliz', () => i / 100);
      expect(e).not.toBe('feliz');
      vistos.add(e);
    }
    expect(vistos.size).toBe(DE_FESTA.length - 1);
    // sorte no limite (1) não sai do intervalo
    expect(DE_FESTA).toContain(escolherDeFesta('x', () => 1));
  });
});
