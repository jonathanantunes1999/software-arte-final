/**
 * Estado da conversa com a mascote. Vive enquanto a app está aberta (não se guarda em disco: as conversas
 * podem falar de ficheiros de clientes). A lógica da troca de mensagens está em ../assistente/conversa.ts.
 */
import { CerebroLocal } from '../assistente/cerebro';
import type { ConteudoBalao } from '../assistente/baloes';
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

/** O balãozinho junto ao botão do chat (null = nenhum) */
export const balao = $state({ atual: null as (ConteudoBalao & { id: number }) | null });
/** Um balão fica pelo menos isto, antes de outro lhe tomar o lugar */
const MINIMO_MS = 2800;
const DURACAO_MS = 7000;
let seqBalao = 0;
let desdeBalao = 0;
let temporizadorBalao: ReturnType<typeof setTimeout> | undefined;
let adiado: ReturnType<typeof setTimeout> | undefined;

export function fecharBalao() {
  clearTimeout(temporizadorBalao);
  clearTimeout(adiado);
  balao.atual = null;
}

/**
 * Mostra um balão. Com a conversa aberta não há balões (ela já está a falar contigo). Se há outro à vista há
 * pouco tempo, espera que ele tenha sido lido antes de lhe tomar o lugar.
 */
export function mostrarBalao(c: ConteudoBalao, duracao = DURACAO_MS) {
  if (assistente.aberto) return;
  clearTimeout(adiado);
  const lido = Date.now() - desdeBalao;
  if (balao.atual && lido < MINIMO_MS) {
    adiado = setTimeout(() => mostrarBalao(c, duracao), MINIMO_MS - lido);
    return;
  }
  clearTimeout(temporizadorBalao);
  const id = ++seqBalao;
  balao.atual = { ...c, id };
  desdeBalao = Date.now();
  temporizadorBalao = setTimeout(() => {
    if (balao.atual?.id === id) balao.atual = null;
  }, duracao);
}

let saudou = false;
/** O "Olá!" é uma vez por sessão, seja qual for o separador: devolve true só da primeira vez */
export function saudarUmaVez(): boolean {
  if (saudou) return false;
  saudou = true;
  return true;
}

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
  fecharBalao();
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

/** O utilizador mudou de PDF com a conversa aberta: a mascote avisa de que o assunto é outro */
export function mudouDeFicheiro(nome: string) {
  if (assistente.aberto && assistente.mensagens.length && nome) acrescentar('mascote', `Agora estou a ver o **${nome}**.`);
}
