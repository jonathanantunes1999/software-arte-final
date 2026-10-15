import type { Lados, MedidaPagina, OrigemSangria } from './caixas';

export type EstadoSangria = 'ok' | 'abaixo' | 'sem-bleedbox';

const arred1 = (v: number) => Math.round(v * 10) / 10;

export interface ResumoSangria {
  estado: EstadoSangria;
  /** Menor dos quatro lados, em mm */
  minimoMm: number;
  /** true quando os quatro lados medem o mesmo (à casa decimal mostrada) */
  uniforme: boolean;
}

/**
 * Compara a sangria com o valor de referência. Compara ao que o utilizador vê
 * (uma casa decimal): 2,96 mm mostra-se "3,0" e conta como 3 mm.
 */
export function resumirSangria(lados: Lados, origem: OrigemSangria, referenciaMm: number): ResumoSangria {
  const v = [lados.esquerda, lados.cima, lados.direita, lados.baixo].map(arred1);
  const minimoMm = Math.min(...v);
  const uniforme = v.every((x) => x === v[0]);
  if (origem === 'nenhuma') return { estado: 'sem-bleedbox', minimoMm, uniforme };
  return { estado: minimoMm >= arred1(referenciaMm) ? 'ok' : 'abaixo', minimoMm, uniforme };
}

export interface GrupoTamanho {
  larguraMm: number;
  alturaMm: number;
  /** Índices (0-based) das páginas deste tamanho */
  paginas: number[];
}

/** Agrupa páginas pela medida final (dentro da tolerância), pela ordem em que aparecem. */
export function agruparTamanhos(
  paginas: Pick<MedidaPagina, 'larguraMm' | 'alturaMm'>[],
  toleranciaMm: number,
): GrupoTamanho[] {
  const grupos: GrupoTamanho[] = [];
  paginas.forEach((p, i) => {
    const g = grupos.find(
      (g) => Math.abs(g.larguraMm - p.larguraMm) <= toleranciaMm && Math.abs(g.alturaMm - p.alturaMm) <= toleranciaMm,
    );
    if (g) g.paginas.push(i);
    else grupos.push({ larguraMm: p.larguraMm, alturaMm: p.alturaMm, paginas: [i] });
  });
  return grupos;
}

/** [0,2,3,4,6] -> "pág. 1" / "págs. 1, 3–5, 7" (índices 0-based, mostra 1-based) */
export function formatarPaginas(indices: number[]): string {
  const ordenados = [...new Set(indices)].sort((a, b) => a - b);
  const partes: string[] = [];
  for (let i = 0; i < ordenados.length; ) {
    let j = i;
    while (j + 1 < ordenados.length && ordenados[j + 1] === ordenados[j] + 1) j++;
    partes.push(j - i >= 2 ? `${ordenados[i] + 1}–${ordenados[j] + 1}` : ordenados.slice(i, j + 1).map((n) => n + 1).join(', '));
    i = j + 1;
  }
  return `${ordenados.length === 1 ? 'pág.' : 'págs.'} ${partes.join(', ')}`;
}
