import type { MedidaPagina } from '../analise/caixas';
import type { Caixa } from '../analise/caixas';
import { mmParaPt } from '../comum/unidades';
import { faixasDeSangria, type FaixaSangria } from '../correcoes/sangria';

/**
 * Preview da sangria: o que o visualizador desenha antes de se gerar nada. A geometria vem de `faixasDeSangria`
 * (a mesma que a correção usa); aqui está só o que é preciso para a pôr num canvas: o plano da página e as contas
 * de matrizes que levam cada faixa da página desenhada para o sítio dela.
 */

/** Matriz afim como o canvas a usa: x' = a·x + c·y + e, y' = b·x + d·y + f */
export type Matriz = [number, number, number, number, number, number];

export const IDENTIDADE: Matriz = [1, 0, 0, 1, 0, 0];

/** m∘n: aplica primeiro n e depois m */
export function multiplicar(m: Matriz, n: Matriz): Matriz {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function inverter(m: Matriz): Matriz {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return IDENTIDADE;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

export function aplicar(m: Matriz, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export interface PlanoSangriaPrevia {
  /** Sangria em pt de utilizador */
  s: number;
  /** Até onde vai a arte com a sangria: o corte mais a sangria de cada lado */
  alvo: Caixa;
  /** A folha que se vê no fim: a área visível de agora e a sangria, juntas */
  folha: Caixa;
  /** O quanto a folha cresce para cada lado em relação à área visível de agora (pt) */
  extensaoPt: number;
  faixas: FaixaSangria[];
}

const juntar = (a: Caixa, b: Caixa): Caixa => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

/** O que se vê hoje: a CropBox dentro da MediaBox */
function visivelDe(g: Pick<MedidaPagina, 'crop' | 'media'>): Caixa {
  const x0 = Math.max(g.crop.x0, g.media.x0);
  const y0 = Math.max(g.crop.y0, g.media.y0);
  const x1 = Math.min(g.crop.x1, g.media.x1);
  const y1 = Math.min(g.crop.y1, g.media.y1);
  return x0 < x1 && y0 < y1 ? { x0, y0, x1, y1 } : g.media;
}

/** `unit` é o UserUnit da página (1 quase sempre); `mm` a sangria pedida */
export function planearSangriaPrevia(g: Pick<MedidaPagina, 'trim' | 'crop' | 'media'>, unit: number, mm: number): PlanoSangriaPrevia {
  const s = mmParaPt(mm) / unit;
  const { trim } = g;
  const alvo: Caixa = { x0: trim.x0 - s, y0: trim.y0 - s, x1: trim.x1 + s, y1: trim.y1 + s };
  const visivel = visivelDe(g);
  const folha = juntar(visivel, alvo);
  const extensaoPt = Math.max(visivel.x0 - folha.x0, folha.x1 - visivel.x1, visivel.y0 - folha.y0, folha.y1 - visivel.y1, 0);
  return { s, alvo, folha, extensaoPt, faixas: faixasDeSangria(trim, s) };
}

/**
 * Matriz que leva a página desenhada (pixeis do canvas auxiliar) para o sítio da faixa no canvas do preview:
 * desfaz o desenho (→ pt), espelha (→ pt da faixa) e volta a desenhar (→ pixeis do preview).
 * `faixa` nula é a página tal como está (sem espelho).
 */
export function matrizDaFaixa(faixa: FaixaSangria | null, ptParaTela: Matriz, ptParaPrevia: Matriz): Matriz {
  const espelho: Matriz = faixa ? [faixa.ex, 0, 0, faixa.ey, faixa.tx, faixa.ty] : IDENTIDADE;
  return multiplicar(ptParaPrevia, multiplicar(espelho, inverter(ptParaTela)));
}

/**
 * O retângulo de uma faixa em pixeis inteiros. Cortar a fracções de pixel deixa uma risca clara entre faixas vizinhas
 * (cada lado só cobre parte do pixel); com as arestas arredondadas todas as faixas partilham os mesmos pixeis de fronteira.
 */
export function retanguloEmPixeis(m: Matriz, clip: FaixaSangria['clip']): { x: number; y: number; w: number; h: number } {
  const [ax, ay] = aplicar(m, clip.x, clip.y);
  const [bx, by] = aplicar(m, clip.x + clip.w, clip.y + clip.h);
  const x0 = Math.round(Math.min(ax, bx));
  const y0 = Math.round(Math.min(ay, by));
  return { x: x0, y: y0, w: Math.round(Math.max(ax, bx)) - x0, h: Math.round(Math.max(ay, by)) - y0 };
}
