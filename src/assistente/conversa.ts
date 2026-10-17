import type { EstadoMascote } from '../mascote/expressoes';
import type { Cerebro } from './cerebro';
import type { Acao, ContextoAssistente, Memoria } from './tipos';

/**
 * Orquestra uma troca de mensagens: pensa um instante (para parecer viva), pede a resposta ao cérebro,
 * mostra-a, executa as ações na app e diz como correram. Sem Svelte nem DOM, para se poder testar.
 */

/** O que uma ação devolve depois de executada (a correção diz o que fez) */
export type ResultadoAcao = void | { texto: string; expressao?: EstadoMascote; sugestoes?: string[] };

export interface Saida {
  mensagem(m: { texto: string; sugestoes?: string[] }): void;
  expressao(e: EstadoMascote): void;
  pensando(b: boolean): void;
  memoria(m: Memoria): void;
}

export interface Dependencias {
  cerebro: Cerebro;
  /** Lê o contexto no momento (o ficheiro pode ter mudado entre mensagens) */
  contexto(): ContextoAssistente;
  executar(a: Acao): Promise<ResultadoAcao>;
  saida: Saida;
  espera?(ms: number): Promise<void>;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Quanto tempo "pensa": um pouco mais para mensagens compridas, nunca mais de ~1 s */
export function tempoDePensar(texto: string): number {
  return Math.min(900, 280 + texto.length * 6);
}

export async function tratar(texto: string, mem: Memoria, d: Dependencias): Promise<void> {
  const espera = d.espera ?? dormir;
  d.saida.pensando(true);
  d.saida.expressao('pensa');
  await espera(tempoDePensar(texto));

  let r;
  try {
    r = d.cerebro.responder(texto, d.contexto(), mem);
  } catch (e) {
    console.error(e);
    d.saida.pensando(false);
    d.saida.expressao('erro');
    d.saida.mensagem({ texto: 'Fiquei baralhada com essa. Podes dizê-lo de outra maneira?' });
    return;
  }

  d.saida.memoria(r.memoria);
  d.saida.pensando(false);
  d.saida.expressao(r.resposta.expressao);
  d.saida.mensagem({ texto: r.resposta.texto, sugestoes: r.resposta.sugestoes });

  for (const acao of r.resposta.acoes) {
    try {
      const resultado = await d.executar(acao);
      if (resultado) {
        d.saida.expressao(resultado.expressao ?? 'ok');
        d.saida.mensagem({ texto: resultado.texto, sugestoes: resultado.sugestoes });
      }
    } catch (e) {
      console.error(e);
      d.saida.expressao('erro');
      d.saida.mensagem({ texto: 'Não consegui fazer isso. O ficheiro ficou como estava.' });
      return;
    }
  }
}
