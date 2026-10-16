import { describe, expect, it } from 'vitest';
import { alertaCadernos } from '../../src/alertas/cadernos';
import type { ConfigAlertas } from '../../src/alertas/tipos';
import { analisarRaw, BASE, CFG_BASE } from '../fixtures/analisar';

async function alertas(paginas: number, cfg: Partial<ConfigAlertas> = {}) {
  const a = await analisarRaw(...Array.from({ length: paginas }, () => ({ ...BASE, conteudo: '0 0 5 5 re f' })));
  return alertaCadernos(a, { ...CFG_BASE, ...cfg });
}

describe('cadernos', () => {
  it('múltiplos de 4 não dão alerta', async () => {
    for (const n of [8, 12, 16]) expect(await alertas(n)).toEqual([]);
  });

  it('30 páginas: faltam 2', async () => {
    const [a] = await alertas(30);
    expect(a.id).toBe('cadernos-multiplo');
    expect(a.gravidade).toBe('aviso');
    expect(a.titulo).toBe('Nº de páginas não é múltiplo de 4');
    expect(a.detalhe).toContain('30 páginas');
    expect(a.detalhe).toContain('faltam 2 páginas');
    expect(a.pagina).toBe(29);
  });

  it('faltam 1 (singular)', async () => {
    expect((await alertas(7))[0].detalhe).toContain('faltam 1 página ');
  });

  it('até 4 páginas não é um caderno', async () => {
    for (const n of [1, 2, 3, 4]) expect(await alertas(n)).toEqual([]);
  });

  it('o múltiplo é configurável (8) e 0 desliga', async () => {
    expect((await alertas(12, { multiploPaginas: 8 }))[0].detalhe).toContain('faltam 4');
    expect(await alertas(13, { multiploPaginas: 0 })).toEqual([]);
    expect(await alertas(13, { multiploPaginas: 1 })).toEqual([]);
    expect(await alertas(4, { multiploPaginas: 8 })).toEqual([]); // 4 páginas nunca é um caderno
  });
});
