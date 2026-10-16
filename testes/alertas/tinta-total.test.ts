import { describe, expect, it } from 'vitest';
import { alertasTintaTotal, tintaTotal } from '../../src/alertas/tinta-total';
import type { ConfigAlertas } from '../../src/alertas/tipos';
import { analisarRaw, BASE, CFG_BASE } from '../fixtures/analisar';
import type { PaginaRaw } from '../fixtures/gerar';

async function alertas(conteudo: string, cfg: Partial<ConfigAlertas> = {}, extra: Partial<PaginaRaw> = {}) {
  return alertasTintaTotal(await analisarRaw({ ...BASE, fontes: { F1: { tipo: 'incorporada' } }, conteudo, ...extra }), { ...CFG_BASE, ...cfg });
}

describe('tinta total', () => {
  it('soma C+M+Y+K em %', () => {
    expect(tintaTotal([1, 1, 1, 1])).toBe(400);
    expect(tintaTotal([0.6, 0.4, 0.4, 1])).toBe(240);
    expect(tintaTotal([0.123, 0, 0, 0])).toBe(12.3);
    expect(tintaTotal([1, 0, 0])).toBeNull();
  });

  it('acima do limite: aviso com a cor, a percentagem e o sítio', async () => {
    const [a] = await alertas('1 0.9 0.9 0.8 k 10 10 50 50 re f');
    expect(a.id).toBe('tinta-total');
    expect(a.gravidade).toBe('aviso');
    expect(a.detalhe).toContain('CMYK 100/90/90/80: 360% em 1 objeto');
    expect(a.locais).toHaveLength(1);
  });

  it('preto rico habitual (60/40/40/100 = 240%) não dá alerta', async () => {
    expect(await alertas('0.6 0.4 0.4 1 k 10 10 50 50 re f')).toEqual([]);
  });

  it('exatamente no limite não conta; um pouco acima conta', async () => {
    expect(await alertas('0.75 0.75 0.75 0.75 k 0 0 9 9 re f')).toEqual([]); // 300
    expect((await alertas('0.76 0.75 0.75 0.75 k 0 0 9 9 re f')).length).toBe(1);
  });

  it('400% (tudo a 100%) é erro', async () => {
    const [a] = await alertas('1 1 1 1 k 0 0 9 9 re f');
    expect(a.gravidade).toBe('erro');
  });

  it('o limite é configurável e 0 desliga', async () => {
    expect((await alertas('0.6 0.4 0.4 1 k 0 0 9 9 re f', { tintaTotalMaxPercent: 200 })).length).toBe(1);
    expect(await alertas('1 1 1 1 k 0 0 9 9 re f', { tintaTotalMaxPercent: 0 })).toEqual([]);
  });

  it('traços e texto também contam; cinzento, RGB e spots não', async () => {
    const c = '1 1 1 1 K 1 w 0 0 m 50 0 l S 1 1 1 1 k BT /F1 10 Tf 10 50 Td (A) Tj ET 0.5 g 0 0 5 5 re f 1 1 1 rg 0 0 5 5 re f';
    const [a] = await alertas(c);
    expect(a.detalhe).toContain('em 2 objetos');
  });

  it('texto invisível não conta', async () => {
    expect(await alertas('1 1 1 1 k BT /F1 10 Tf 3 Tr 10 50 Td (A) Tj ET')).toEqual([]);
  });

  it('agrupa por cor e conta as páginas', async () => {
    const [a] = await alertas('1 1 1 1 k 0 0 5 5 re f 1 1 1 1 k 9 9 5 5 re f 1 1 0.9 1 k 20 20 5 5 re f');
    expect(a.detalhe).toContain('CMYK 100/100/100/100: 400% em 2 objetos');
    expect(a.detalhe).toContain('CMYK 100/100/90/100: 390% em 1 objeto');
  });
});
