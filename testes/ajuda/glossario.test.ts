import { describe, expect, it } from 'vitest';
import { procurarTopicos, TOPICOS, topicoDoAlerta } from '../../src/ajuda/conhecimento';

describe('glossário: pesquisa', () => {
  it('sem pesquisa mostra tudo, pela ordem original', () => {
    expect(procurarTopicos('')).toEqual(TOPICOS);
    expect(procurarTopicos('   ')).toEqual(TOPICOS);
  });

  it('encontra pelo título, sem acentos nem maiúsculas, e por início de palavra', () => {
    expect(procurarTopicos('sangria')[0].id).toBe('sangria');
    expect(procurarTopicos('SANGRIA')[0].id).toBe('sangria');
    expect(procurarTopicos('sangr')[0].id).toBe('sangria');
    expect(procurarTopicos('separacoes')[0].id).toBe('separacoes');
  });

  it('encontra pelas palavras-chave (bleed é sangria)', () => {
    expect(procurarTopicos('bleed').map((t) => t.id)).toContain('sangria');
  });

  it('com várias palavras, todas têm de casar', () => {
    expect(procurarTopicos('marcas corte').map((t) => t.id)).toContain('marcas');
    expect(procurarTopicos('sangria zzzzzz')).toEqual([]);
  });

  it('o título pesa mais do que uma menção no texto', () => {
    const r = procurarTopicos('overprint');
    expect(r[0].id).toBe('overprint');
  });

  it('um termo que não existe não devolve nada', () => {
    expect(procurarTopicos('xyzabc')).toEqual([]);
  });

  it('os alertas apontam para tópicos que existem', () => {
    for (const id of ['sangria-ausente', 'marcas-corte-ausentes', 'rgb', 'overprint-branco', 'spots-duplicadas', 'texto-em-fonte']) {
      const t = topicoDoAlerta(id);
      expect(t, id).toBeDefined();
      expect(TOPICOS).toContain(t);
    }
  });
});
