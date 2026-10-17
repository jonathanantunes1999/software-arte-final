/**
 * O que a mascote diz num balãozinho junto ao botão do chat, sem lhe perguntarem nada. Só quando há algo
 * útil a dizer: o "Olá!" aparece uma vez por sessão; o resto só quando a análise ou a correção acabam.
 */
export interface ConteudoBalao {
  texto: string;
  /** O que se pergunta ao assistente se se clicar no balão (sem isto, o clique só abre a conversa) */
  pergunta?: string;
}

export const SAUDACAO: ConteudoBalao = { texto: 'Olá!' };

const n = (x: number, um: string, varios: string) => `${x} ${x === 1 ? um : varios}`;

/** Depois de a análise acabar: o que se encontrou, e a oferta de explicar */
export function balaoDaAnalise(c: { erros: number; avisos: number; infos: number }): ConteudoBalao {
  const partes = [c.erros ? n(c.erros, 'erro', 'erros') : '', c.avisos ? n(c.avisos, 'aviso', 'avisos') : ''].filter(Boolean);
  if (partes.length) return { texto: `Encontrei ${partes.join(' e ')}. Queres que explique?`, pergunta: 'Resume o ficheiro' };
  if (c.infos) return { texto: `Sem erros nem avisos, só ${n(c.infos, 'nota', 'notas')}.` };
  return { texto: 'Sem alertas: está tudo em ordem.' };
}

/** Depois de uma correção: só vale a pena dizer se melhorou */
export function balaoDaCorrecao(antes: number, depois: number): ConteudoBalao | null {
  if (depois >= antes) return null;
  return depois === 0 ? { texto: 'Pronto: ficou sem alertas.' } : { texto: `Pronto: ${antes} alertas passaram a ${depois}.` };
}
