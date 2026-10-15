import type { Caixa } from '../analise/caixas';

export function uniaoDeCaixas(caixas: Caixa[]): Caixa {
  return {
    x0: Math.min(...caixas.map((c) => c.x0)),
    y0: Math.min(...caixas.map((c) => c.y0)),
    x1: Math.max(...caixas.map((c) => c.x1)),
    y1: Math.max(...caixas.map((c) => c.y1)),
  };
}

/** Acima disto não vale a pena agrupar por proximidade: devolve-se uma só caixa */
const LIMITE_AGRUPAR = 5000;

/**
 * Junta caixas que se tocam ou ficam a menos de `folga` uma da outra (componentes ligados),
 * e devolve a caixa que cobre cada grupo. Serve para destacar "a mancha de objetos RGB"
 * em vez da página inteira.
 */
export function agruparCaixas(caixas: Caixa[], folga: number): Caixa[] {
  const n = caixas.length;
  if (n === 0) return [];
  if (n > LIMITE_AGRUPAR) return [uniaoDeCaixas(caixas)];

  const ordem = caixas.map((_, i) => i).sort((a, b) => caixas[a].x0 - caixas[b].x0);
  const pai = caixas.map((_, i) => i);
  const raiz = (i: number): number => {
    while (pai[i] !== i) {
      pai[i] = pai[pai[i]];
      i = pai[i];
    }
    return i;
  };

  for (let i = 0; i < n; i++) {
    const a = caixas[ordem[i]];
    for (let j = i + 1; j < n; j++) {
      const b = caixas[ordem[j]];
      if (b.x0 > a.x1 + folga) break; // ordenado por x0: os seguintes ainda estão mais longe
      if (b.y0 <= a.y1 + folga && b.y1 >= a.y0 - folga) pai[raiz(ordem[j])] = raiz(ordem[i]);
    }
  }

  const grupos = new Map<number, Caixa[]>();
  caixas.forEach((c, i) => {
    const r = raiz(i);
    (grupos.get(r) ?? grupos.set(r, []).get(r)!).push(c);
  });
  return [...grupos.values()].map(uniaoDeCaixas);
}
