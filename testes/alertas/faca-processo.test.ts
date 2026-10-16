import { describe, expect, it } from 'vitest';
import { alertasFacaEmProcesso } from '../../src/alertas/faca-processo';
import { analisarRaw, BASE, CFG_BASE } from '../fixtures/analisar';
import type { PaginaRaw } from '../fixtures/gerar';

const ESPACOS = { CS0: { tipo: 'separation' as const, nome: 'Faca' } };
async function alertas(conteudo: string, extra: Partial<PaginaRaw> = {}) {
  return alertasFacaEmProcesso(await analisarRaw({ ...BASE, espacos: ESPACOS, conteudo, ...extra }), CFG_BASE);
}
/** Quatro traços a desenhar um retângulo a toda a página (100 mm = 283 pt) */
const CONTORNO = (cor: string, w = 0.5) => `${cor} ${w} w 10 10 m 270 10 l S 270 10 m 270 270 l S 270 270 m 10 270 l S 10 270 m 10 10 l S`;

describe('faca em cor de processo', () => {
  it('magenta 100% a desenhar um contorno grande: informação', async () => {
    const [a] = await alertas(CONTORNO('0 1 0 0 K'));
    expect(a.id).toBe('faca-em-processo');
    expect(a.gravidade).toBe('info');
    expect(a.detalhe).toContain('4 traços finos em magenta 100%');
    expect(a.locais).toHaveLength(1);
  });

  it('ciano e amarelo também', async () => {
    expect((await alertas(CONTORNO('1 0 0 0 K')))[0].detalhe).toContain('ciano');
    expect((await alertas(CONTORNO('0 0 1 0 K')))[0].detalhe).toContain('amarelo');
  });

  it('se o ficheiro já tem uma spot técnica, não há alerta', async () => {
    expect(await alertas(`${CONTORNO('0 1 0 0 K')} /CS0 CS 1 SCN 1 w 0 0 5 5 re S`)).toEqual([]);
  });

  it('preto, cores misturadas e K ligado não são faca', async () => {
    expect(await alertas(CONTORNO('0 0 0 1 K'))).toEqual([]);
    expect(await alertas(CONTORNO('0 0.5 0 0 K'))).toEqual([]);
    expect(await alertas(CONTORNO('0 1 1 0 K'))).toEqual([]);
    expect(await alertas(CONTORNO('0 1 0 0.2 K'))).toEqual([]);
  });

  it('traços grossos não são faca', async () => {
    expect(await alertas(CONTORNO('0 1 0 0 K', 3))).toEqual([]);
  });

  it('poucos traços (menos de 3) ou um contorno pequeno não chegam', async () => {
    expect(await alertas('0 1 0 0 K 0.5 w 10 10 m 270 10 l S 270 10 m 270 270 l S')).toEqual([]);
    expect(await alertas('0 1 0 0 K 0.5 w 10 10 m 40 10 l S 40 10 m 40 40 l S 40 40 m 10 40 l S 10 40 m 10 10 l S')).toEqual([]);
  });

  it('preenchimentos não contam', async () => {
    expect(await alertas('0 1 0 0 k 0 0 280 280 re f')).toEqual([]);
  });
});
