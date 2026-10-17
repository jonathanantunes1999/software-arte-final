/**
 * As expressões da mascote. Cada uma é só dados (olhos, sobrancelhas, boca, extras, movimento do corpo e
 * das bolas, tom que lava o corpo); quem desenha é Mascote.svelte. A lista serve também a galeria das
 * Definições, por isso o nome e a descrição estão aqui.
 */

export type Olhos =
  | 'normal'
  | 'arregalados'
  | 'feliz'
  | 'fechados'
  | 'piscadela'
  | 'coracoes'
  | 'espirais'
  | 'cima'
  | 'lado'
  | 'irritados'
  | 'tristes';

export type Sobrancelhas = 'nenhuma' | 'franzida' | 'triste' | 'subida' | 'uma' | 'foco';

export type Boca = 'sorriso' | 'cheia' | 'o' | 'grande' | 'triste' | 'reta' | 'ondulada' | 'bocejo' | 'lingua' | 'zangada' | 'u' | 'cantar' | 'dorme' | 'pensa' | 'convencida';

export type Extra =
  | 'visto'
  | 'exclamacao'
  | 'cruz'
  | 'suor'
  | 'lagrima'
  | 'brilhos'
  | 'zzz'
  | 'bolha'
  | 'coracoes'
  | 'balao'
  | 'lupa'
  | 'anel'
  | 'seta'
  | 'interrogacao'
  | 'notas'
  | 'estrelas'
  | 'vapor'
  | 'ola'
  | 'vento'
  | 'raios';

/** Como se mexe o corpo todo */
export type Movimento =
  | 'respira'
  | 'voa'
  | 'inclina'
  | 'procura'
  | 'trabalha'
  | 'sobe'
  | 'salta'
  | 'abana'
  | 'treme'
  | 'dorme'
  | 'boceja'
  | 'tonta'
  | 'cumprimenta'
  | 'pulsa'
  | 'surpresa'
  | 'orgulho'
  | 'danca'
  | 'pisca';

/** O que fazem as quatro bolas */
export type Bolas = 'pairam' | 'voam' | 'orbitam' | 'saltam' | 'caem' | 'dormem' | 'tremem' | 'afastam' | 'acena';

export interface Expressao {
  id: string;
  nome: string;
  descricao: string;
  olhos: Olhos;
  sobrancelhas: Sobrancelhas;
  boca: Boca;
  extras: Extra[];
  movimento: Movimento;
  bolas: Bolas;
  /** Cor que tinge o corpo (como nas referências), ou null; o segundo valor é a força (0 a 1) */
  lavado: [string, number] | null;
  /** Os olhos seguem o rato (só faz sentido com olhos que olham para a frente) */
  segue: boolean;
}

const E = (e: Expressao): Expressao => e;

export const EXPRESSOES = [
  E({ id: 'repouso', nome: 'Em repouso', descricao: 'À espera de um ficheiro', olhos: 'normal', sobrancelhas: 'nenhuma', boca: 'sorriso', extras: [], movimento: 'respira', bolas: 'pairam', lavado: null, segue: true }),
  E({ id: 'analisa', nome: 'A analisar', descricao: 'Voa com as bolas atrás enquanto lê o ficheiro', olhos: 'normal', sobrancelhas: 'foco', boca: 'sorriso', extras: ['vento'], movimento: 'voa', bolas: 'voam', lavado: ['#5ee0ff', 0.16], segue: false }),
  E({ id: 'pensa', nome: 'A pensar', descricao: 'A ver o que o ficheiro precisa', olhos: 'cima', sobrancelhas: 'nenhuma', boca: 'pensa', extras: ['balao'], movimento: 'inclina', bolas: 'pairam', lavado: ['#a58bff', 0.3], segue: false }),
  E({ id: 'procura', nome: 'A procurar', descricao: 'Com uma lupa, à caça de QR codes', olhos: 'lado', sobrancelhas: 'foco', boca: 'o', extras: ['lupa'], movimento: 'procura', bolas: 'pairam', lavado: ['#5ec8ff', 0.28], segue: false }),
  E({ id: 'trabalha', nome: 'A trabalhar', descricao: 'A aplicar correções', olhos: 'normal', sobrancelhas: 'foco', boca: 'reta', extras: ['anel'], movimento: 'trabalha', bolas: 'orbitam', lavado: ['#6f8bff', 0.26], segue: false }),
  E({ id: 'envia', nome: 'A enviar', descricao: 'A exportar a cópia ou o relatório', olhos: 'cima', sobrancelhas: 'nenhuma', boca: 'sorriso', extras: ['seta'], movimento: 'sobe', bolas: 'pairam', lavado: ['#5ee0ff', 0.2], segue: false }),
  E({ id: 'pergunta', nome: 'Dúvida', descricao: 'Precisa que lhe digas alguma coisa', olhos: 'normal', sobrancelhas: 'uma', boca: 'ondulada', extras: ['interrogacao'], movimento: 'inclina', bolas: 'pairam', lavado: ['#5ec8ff', 0.22], segue: true }),
  E({ id: 'ok', nome: 'Tudo em ordem', descricao: 'Ficheiro pronto para a gráfica', olhos: 'feliz', sobrancelhas: 'nenhuma', boca: 'cheia', extras: ['visto', 'brilhos'], movimento: 'salta', bolas: 'saltam', lavado: ['#3ddc97', 0.3], segue: false }),
  E({ id: 'aviso', nome: 'Aviso', descricao: 'Há coisas a rever', olhos: 'arregalados', sobrancelhas: 'subida', boca: 'o', extras: ['exclamacao', 'suor'], movimento: 'abana', bolas: 'tremem', lavado: ['#ffb547', 0.32], segue: false }),
  E({ id: 'erro', nome: 'Erro', descricao: 'O ficheiro tem problemas graves', olhos: 'tristes', sobrancelhas: 'triste', boca: 'triste', extras: ['cruz', 'lagrima'], movimento: 'treme', bolas: 'caem', lavado: ['#ff4d6d', 0.36], segue: false }),
  E({ id: 'dorme', nome: 'A dormir', descricao: 'Ninguém mexe há muito tempo', olhos: 'fechados', sobrancelhas: 'nenhuma', boca: 'dorme', extras: ['zzz', 'bolha'], movimento: 'dorme', bolas: 'dormem', lavado: ['#8b9bff', 0.24], segue: false }),
  E({ id: 'boceja', nome: 'A bocejar', descricao: 'Está a acordar', olhos: 'fechados', sobrancelhas: 'nenhuma', boca: 'bocejo', extras: [], movimento: 'boceja', bolas: 'pairam', lavado: ['#8b9bff', 0.12], segue: false }),
  E({ id: 'tonta', nome: 'Tonta', descricao: 'Com tudo a andar à roda', olhos: 'espirais', sobrancelhas: 'nenhuma', boca: 'ondulada', extras: ['estrelas'], movimento: 'tonta', bolas: 'orbitam', lavado: ['#c77dff', 0.26], segue: false }),
  E({ id: 'cumprimenta', nome: 'Olá!', descricao: 'Acena com a bola ciano', olhos: 'normal', sobrancelhas: 'subida', boca: 'cheia', extras: ['ola'], movimento: 'cumprimenta', bolas: 'acena', lavado: null, segue: true }),
  E({ id: 'ama', nome: 'Adoro', descricao: 'Apaixonada por um bom ficheiro', olhos: 'coracoes', sobrancelhas: 'nenhuma', boca: 'u', extras: ['coracoes'], movimento: 'pulsa', bolas: 'pairam', lavado: ['#ff7fb0', 0.3], segue: false }),
  E({ id: 'surpresa', nome: 'Surpresa', descricao: 'Não estava à espera', olhos: 'arregalados', sobrancelhas: 'subida', boca: 'grande', extras: ['raios'], movimento: 'surpresa', bolas: 'afastam', lavado: null, segue: true }),
  E({ id: 'orgulhosa', nome: 'Orgulhosa', descricao: 'Trabalho bem feito', olhos: 'feliz', sobrancelhas: 'nenhuma', boca: 'convencida', extras: ['brilhos'], movimento: 'orgulho', bolas: 'pairam', lavado: ['#ffd36b', 0.3], segue: false }),
  E({ id: 'pisca', nome: 'Piscadela', descricao: 'Cúmplice', olhos: 'piscadela', sobrancelhas: 'nenhuma', boca: 'lingua', extras: [], movimento: 'pisca', bolas: 'pairam', lavado: null, segue: false }),
  E({ id: 'irritada', nome: 'Irritada', descricao: 'Fartou-se de ficheiros em RGB', olhos: 'irritados', sobrancelhas: 'franzida', boca: 'zangada', extras: ['vapor'], movimento: 'treme', bolas: 'tremem', lavado: ['#ff7a59', 0.32], segue: false }),
  E({ id: 'danca', nome: 'A dançar', descricao: 'Em festa', olhos: 'feliz', sobrancelhas: 'nenhuma', boca: 'cantar', extras: ['notas'], movimento: 'danca', bolas: 'saltam', lavado: null, segue: false }),
  E({ id: 'feliz', nome: 'Contente', descricao: 'Só porque sim', olhos: 'feliz', sobrancelhas: 'nenhuma', boca: 'cheia', extras: ['brilhos'], movimento: 'salta', bolas: 'saltam', lavado: null, segue: false }),
] as const;

export type EstadoMascote = (typeof EXPRESSOES)[number]['id'];

const porId = new Map<string, Expressao>(EXPRESSOES.map((e) => [e.id, e]));

export function expressao(id: string): Expressao {
  return porId.get(id) ?? porId.get('repouso')!;
}

/** As que a mascote mostra por si quando se clica nela: as alegres, nunca erro nem aviso */
export const DE_FESTA: EstadoMascote[] = ['feliz', 'ama', 'pisca', 'danca', 'surpresa', 'orgulhosa', 'cumprimenta', 'tonta'];

/** Uma ao acaso das de festa, sem repetir a que já está (para clicar duas vezes dar coisas diferentes) */
export function escolherDeFesta(atual: string, sorte: () => number = Math.random): EstadoMascote {
  const outras = DE_FESTA.filter((e) => e !== atual);
  return outras[Math.min(outras.length - 1, Math.floor(sorte() * outras.length))];
}
