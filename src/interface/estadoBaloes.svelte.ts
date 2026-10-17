/**
 * O balãozinho da mascote (null = nenhum). Vive enquanto a app está aberta; só diz coisas quando há algo útil a dizer
 * (ver ../ajuda/baloes.ts). Um balão fica pelo menos um bocado antes de outro lhe tomar o lugar.
 */
import type { ConteudoBalao } from '../ajuda/baloes';

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

/** Mostra um balão. Se há outro à vista há pouco tempo, espera que ele tenha sido lido antes de lhe tomar o lugar. */
export function mostrarBalao(c: ConteudoBalao, duracao = DURACAO_MS) {
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
