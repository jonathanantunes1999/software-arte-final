/**
 * A barra da sequência de entrada pela notch (a mascote leva-a a encher enquanto a análise corre). Só as contas,
 * para se poderem testar sem janela.
 */

/** O que a barra mostra, no máximo, antes de a análise acabar de vez: o resto enche-se ao concluir */
export const TETO = 0.92;
/** Mínimo de tempo (s) que a barra demora a chegar ao teto, para não saltar de 0 a 100% num ficheiro pequeno */
export const SUBIDA_MIN = 1.5;

export const grampear = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/**
 * O alvo da barra em cada instante: segue a análise real, mas nunca mais depressa do que a subida mínima nem acima do
 * teto; ao acabar vai a 100%. `real` é o progresso da análise (0…1) e `segundos` o tempo que a barra já está à vista.
 */
export function alvoDaBarra(real: number, segundos: number, acabou: boolean): number {
  if (acabou) return 1;
  const minimo = TETO * (1 - Math.pow(1 - grampear(segundos / SUBIDA_MIN), 2));
  // enquanto a análise ainda não deu números (a abrir o ficheiro) a barra avança devagar, para não parecer parada
  const folga = Math.min(0.12, Math.max(0, segundos) * 0.02);
  return Math.min(Math.max(grampear(real) * TETO, folga), minimo);
}

/**
 * O progresso de um lote de ficheiros: a média do de cada um (os que já acabaram valem 1). `lote` guarda o último valor
 * de cada ficheiro desde que o lote começou, para um que acaba não fazer a média recuar.
 */
export function progressoDoLote(lote: Map<number, number>, agora: { id: number; aCarregar: boolean; progresso: number }[]): number {
  for (const s of agora) {
    if (s.aCarregar) lote.set(s.id, Math.max(lote.get(s.id) ?? 0, grampear(s.progresso)));
    else if (lote.has(s.id)) lote.set(s.id, 1);
  }
  // ficheiros fechados a meio saem da conta
  for (const id of [...lote.keys()]) if (!agora.some((s) => s.id === id)) lote.delete(id);
  if (!lote.size) return 0;
  let soma = 0;
  for (const v of lote.values()) soma += v;
  return soma / lote.size;
}
