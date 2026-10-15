import { ehBranco, ehRegisto, ehSpotTecnica } from '../analise/cores';
import type { Cor, EventoDesenho } from '../analise/ir';

/** As cores com que um objeto pinta (preenchimento e/ou traço). */
export function pinturas(e: EventoDesenho): Cor[] {
  const c: Cor[] = [];
  if (e.preenche && e.cor) c.push(e.cor);
  if (e.traca && e.corTraco) c.push(e.corTraco);
  return c;
}

/**
 * Objetos que não são "arte" para efeitos de margens: branco (o papel já é branco), faca, vincos,
 * verniz e outras spots técnicas, e a tinta de registo. Imagens e degradés não têm cor e contam.
 */
export function eBrancoOuTecnico(e: EventoDesenho, tecnicas: string[]): boolean {
  const p = pinturas(e);
  if (p.length === 0) return false;
  if (p.every((c) => ehBranco(c))) return true;
  return p.some((c) => ehRegisto(c) || ehSpotTecnica(c, tecnicas));
}
