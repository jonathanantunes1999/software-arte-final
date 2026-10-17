/**
 * Estado da conversa com a mascote. Vive enquanto a app está aberta (não se guarda em disco: as conversas
 * podem falar de ficheiros de clientes). A lógica da troca de mensagens está em ../assistente/conversa.ts.
 */
import { CerebroLocal } from '../assistente/cerebro';
import { tratar, type ResultadoAcao } from '../assistente/conversa';
import { MEMORIA_VAZIA, type Acao, type ContextoAssistente, type Memoria } from '../assistente/tipos';
import type { EstadoMascote } from '../mascote/expressoes';

export interface Mensagem {
  id: number;
  de: 'eu' | 'mascote';
  texto: string;
  sugestoes?: string[];
}

export const assistente = $state({
  aberto: false,
  mensagens: [] as Mensagem[],
  pensando: false,
  /** A cara da mascote no chat */
  expressao: 'repouso' as EstadoMascote,
});

let memoria: Memoria = MEMORIA_VAZIA;
let seq = 0;
let relaxar: ReturnType<typeof setTimeout> | undefined;

function acrescentar(de: Mensagem['de'], texto: string, sugestoes?: string[]) {
  assistente.mensagens.push({ id: ++seq, de, texto, sugestoes });
}

/** Passado um bocado sem novidades, a mascote volta ao repouso */
function relaxarDepois() {
  clearTimeout(relaxar);
  relaxar = setTimeout(() => {
    if (!assistente.pensando) assistente.expressao = 'repouso';
  }, 5500);
}

export function abrirAssistente(contexto?: () => ContextoAssistente) {
  assistente.aberto = true;
  if (!assistente.mensagens.length && contexto) {
    const r = CerebroLocal.responder('olá', contexto(), MEMORIA_VAZIA);
    memoria = r.memoria;
    acrescentar('mascote', r.resposta.texto, r.resposta.sugestoes);
    assistente.expressao = 'cumprimenta';
    relaxarDepois();
  }
}
export function fecharAssistente() {
  assistente.aberto = false;
}
export function alternarAssistente(contexto?: () => ContextoAssistente) {
  if (assistente.aberto) fecharAssistente();
  else abrirAssistente(contexto);
}
export function limparConversa() {
  assistente.mensagens.length = 0;
  memoria = MEMORIA_VAZIA;
  assistente.expressao = 'repouso';
}

export async function enviarMensagem(texto: string, contexto: () => ContextoAssistente, executar: (a: Acao) => Promise<ResultadoAcao>) {
  const t = texto.trim();
  if (!t || assistente.pensando) return;
  acrescentar('eu', t);
  await tratar(t, memoria, {
    cerebro: CerebroLocal,
    contexto,
    executar,
    saida: {
      mensagem: (m) => acrescentar('mascote', m.texto, m.sugestoes),
      expressao: (e) => (assistente.expressao = e),
      pensando: (b) => (assistente.pensando = b),
      memoria: (m) => (memoria = m),
    },
  });
  relaxarDepois();
}
