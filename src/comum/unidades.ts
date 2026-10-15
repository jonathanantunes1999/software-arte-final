/** 1 pt = 1/72 polegada = 25,4/72 mm */
export const MM_POR_PT = 25.4 / 72;

export function ptParaMm(pt: number): number {
  return pt * MM_POR_PT;
}

export function mmParaPt(mm: number): number {
  return mm / MM_POR_PT;
}

/** Uma casa decimal, vírgula decimal (pt-PT). Ex.: 210 -> "210,0" */
export function formatarMm(mm: number): string {
  // evita "-0,0"
  const arredondado = Math.round(mm * 10) / 10;
  return (Object.is(arredondado, -0) ? 0 : arredondado).toFixed(1).replace('.', ',');
}
