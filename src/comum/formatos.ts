export interface Formato {
  nome: string;
  /** Largura e altura na orientação "ao alto" (vertical) */
  larguraMm: number;
  alturaMm: number;
}

export const TOLERANCIA_FORMATO_MM = 0.5;

export const FORMATOS_PREDEFINIDOS: Formato[] = [
  { nome: 'A0', larguraMm: 841, alturaMm: 1189 },
  { nome: 'A1', larguraMm: 594, alturaMm: 841 },
  { nome: 'A2', larguraMm: 420, alturaMm: 594 },
  { nome: 'A3', larguraMm: 297, alturaMm: 420 },
  { nome: 'A4', larguraMm: 210, alturaMm: 297 },
  { nome: 'A5', larguraMm: 148, alturaMm: 210 },
  { nome: 'A6', larguraMm: 105, alturaMm: 148 },
  { nome: 'A7', larguraMm: 74, alturaMm: 105 },
  { nome: 'DL', larguraMm: 99, alturaMm: 210 },
  { nome: 'Cartão de visita', larguraMm: 55, alturaMm: 85 },
];

export interface FormatoIdentificado {
  formato: Formato;
  /** true quando a medida coincide com o formato deitado */
  horizontal: boolean;
}

/**
 * Procura o formato cuja medida coincide (±tolerância em cada lado), ao alto
 * ou deitado. Em caso de vários candidatos devolve o de menor desvio.
 */
export function identificarFormato(
  larguraMm: number,
  alturaMm: number,
  formatos: Formato[],
  toleranciaMm: number = TOLERANCIA_FORMATO_MM,
): FormatoIdentificado | null {
  let melhor: (FormatoIdentificado & { desvio: number }) | null = null;

  for (const formato of formatos) {
    const alto = desvioMaximo(larguraMm, alturaMm, formato.larguraMm, formato.alturaMm);
    const deitado = desvioMaximo(larguraMm, alturaMm, formato.alturaMm, formato.larguraMm);
    const quadrado = formato.larguraMm === formato.alturaMm;

    const candidatos: { desvio: number; horizontal: boolean }[] = [];
    if (alto <= toleranciaMm) candidatos.push({ desvio: alto, horizontal: false });
    if (!quadrado && deitado <= toleranciaMm) candidatos.push({ desvio: deitado, horizontal: true });

    for (const c of candidatos) {
      if (!melhor || c.desvio < melhor.desvio) {
        melhor = { formato, horizontal: c.horizontal, desvio: c.desvio };
      }
    }
  }

  return melhor ? { formato: melhor.formato, horizontal: melhor.horizontal } : null;
}

function desvioMaximo(l: number, a: number, fl: number, fa: number): number {
  return Math.max(Math.abs(l - fl), Math.abs(a - fa));
}

/** Valida e limpa uma lista vinda das definições guardadas. */
export function sanearFormatos(entrada: unknown): Formato[] | null {
  if (!Array.isArray(entrada)) return null;
  const limpos: Formato[] = [];
  for (const f of entrada) {
    if (
      f && typeof f === 'object' &&
      typeof f.nome === 'string' && f.nome.trim() !== '' &&
      Number.isFinite(f.larguraMm) && f.larguraMm > 0 &&
      Number.isFinite(f.alturaMm) && f.alturaMm > 0
    ) {
      limpos.push({ nome: f.nome.trim(), larguraMm: f.larguraMm, alturaMm: f.alturaMm });
    }
  }
  return limpos;
}
