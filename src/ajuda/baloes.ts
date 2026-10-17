/**
 * O que a mascote diz num balãozinho, sem lhe perguntarem nada. Só quando há algo
 * útil a dizer: o "Olá!" aparece uma vez por sessão; o resto só quando a análise ou a correção acabam.
 */
export interface ConteudoBalao {
  texto: string;
  /** Para onde leva um clique no balão */
  destino: 'alertas' | 'ajuda';
}

export const SAUDACAO: ConteudoBalao = { texto: 'Olá!', destino: 'ajuda' };

const n = (x: number, um: string, varios: string) => `${x} ${x === 1 ? um : varios}`;

/** Depois de a análise acabar: o que se encontrou, e a oferta de explicar */
export function balaoDaAnalise(c: { erros: number; avisos: number; infos: number }): ConteudoBalao {
  const partes = [c.erros ? n(c.erros, 'erro', 'erros') : '', c.avisos ? n(c.avisos, 'aviso', 'avisos') : ''].filter(Boolean);
  if (partes.length) return { texto: `Encontrei ${partes.join(' e ')}. Queres ver?`, destino: 'alertas' };
  if (c.infos) return { texto: `Sem erros nem avisos, só ${n(c.infos, 'nota', 'notas')}.`, destino: 'alertas' };
  return { texto: 'Sem alertas: está tudo em ordem.', destino: 'alertas' };
}

/** Depois de uma correção: só vale a pena dizer se melhorou */
export function balaoDaCorrecao(antes: number, depois: number): ConteudoBalao | null {
  if (depois >= antes) return null;
  return depois === 0 ? { texto: 'Pronto: ficou sem alertas.', destino: 'alertas' } : { texto: `Pronto: ${antes} alertas passaram a ${depois}.`, destino: 'alertas' };
}
