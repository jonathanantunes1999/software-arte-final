import { describe, expect, it } from 'vitest';
import { inventariar } from '../../src/correcoes/inventario';
import { analisarRaw, BASE, CFG_BASE } from '../fixtures/analisar';
import type { PaginaRaw } from '../fixtures/gerar';

const ESPACOS = {
  CS0: { tipo: 'separation' as const, nome: 'cortante' },
  CS1: { tipo: 'separation' as const, nome: 'PANTONE 485 C' },
  CS2: { tipo: 'separation' as const, nome: 'PANTONE 485 CV' },
};
const ESTADOS = { GS0: { OP: false, op: false }, GS1: { OP: true, op: true, OPM: 1 } };
const inv = async (conteudo: string, extra: Partial<PaginaRaw> = {}) =>
  inventariar(await analisarRaw({ ...BASE, espacos: ESPACOS, estados: ESTADOS, fontes: { F1: { tipo: 'incorporada' } }, conteudo, ...extra }), CFG_BASE);

describe('inventário de correções', () => {
  it('spots usadas, por ordem de uso, e as páginas', async () => {
    const i = await inv('/CS1 cs 1 scn 0 0 5 5 re f /CS1 cs 1 scn 0 0 6 6 re f /CS0 CS 1 SCN 1 w 0 0 9 9 re S');
    expect(i.spots).toEqual([
      { nome: 'PANTONE 485 C', objetos: 2, paginas: [0] },
      { nome: 'cortante', objetos: 1, paginas: [0] },
    ]);
  });

  it('um objeto que usa a mesma spot em preenchimento e traço conta uma vez', async () => {
    const i = await inv('/CS1 cs 1 scn /CS1 CS 1 SCN 1 w 0 0 5 5 re B');
    expect(i.spots[0].objetos).toBe(1);
  });

  it('sugere juntar duplicadas: o menos usado passa ao mais usado', async () => {
    const i = await inv('/CS1 cs 1 scn 0 0 5 5 re f /CS1 cs 1 scn 0 0 6 6 re f /CS2 cs 1 scn 0 0 9 9 re f');
    expect(i.juncoesSugeridas).toEqual([{ de: 'PANTONE 485 CV', para: 'PANTONE 485 C' }]);
  });

  it('sem duplicadas não sugere nada; tintas de processo não são spots', async () => {
    const i = await inv('/CS1 cs 1 scn 0 0 5 5 re f /CS0 cs 1 scn 0 0 5 5 re f');
    expect(i.juncoesSugeridas).toEqual([]);
    const j = await inv('0 0 0 1 k 0 0 5 5 re f', { espacos: { CS9: { tipo: 'devicen', nomes: ['Cyan', 'Black'] } } });
    expect(j.spots).toEqual([]);
  });

  it('cores de processo em traços: as mais usadas, com a espessura média', async () => {
    const i = await inv('0 1 0 0 K 1 w 0 0 m 50 0 l S 0 1 0 0 K 3 w 0 5 m 50 5 l S 1 0 0 0 K 1 w 0 9 m 50 9 l S 0 0 0 1 k 0 0 5 5 re f');
    expect(i.coresDeTraco).toEqual([
      { valores: [0, 1, 0, 0], objetos: 2, espessuraMediaPt: 2 },
      { valores: [1, 0, 0, 0], objetos: 1, espessuraMediaPt: 1 },
    ]);
  });

  it('só traços CMYK entram nas cores de traço (preenchimentos e spots não)', async () => {
    const i = await inv('0 0 0 1 k 0 0 5 5 re f /CS0 CS 1 SCN 1 w 0 0 9 9 re S');
    expect(i.coresDeTraco).toEqual([]);
  });

  it('contagens de overprint por tipo', async () => {
    const fundo = '0.8 0 0 0 k 0 0 300 300 re f';
    const i = await inv(`${fundo} /GS1 gs 0 0 0 0 k 20 20 50 50 re f /GS0 gs 0 0 0 1 k BT /F1 10 Tf 20 50 Td (A) Tj ET 0 0 0 1 K 0.5 w 0 0 m 99 0 l S /CS0 CS 1 SCN 1 w 5 5 100 100 re S`);
    expect(i.overprint).toEqual({ branco: 1, pretoTexto: 1, pretoLinha: 1, spotsTecnicas: 1 });
  });
});
