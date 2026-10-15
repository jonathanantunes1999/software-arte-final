import type { Cor, EventoDesenho } from '../analise/ir';

/** As cores com que um objeto pinta (preenchimento e/ou traço). */
export function pinturas(e: EventoDesenho): Cor[] {
  const c: Cor[] = [];
  if (e.preenche && e.cor) c.push(e.cor);
  if (e.traca && e.corTraco) c.push(e.corTraco);
  return c;
}
