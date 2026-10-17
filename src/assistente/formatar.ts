/**
 * O texto das respostas usa só **negrito**, parágrafos (linha em branco) e quebras de linha. Em vez de
 * HTML, parte-se em pedaços que a interface desenha como elementos: nada do que vem no texto (nomes de
 * ficheiros, mensagens do utilizador) pode virar marcação.
 */
export interface Pedaco {
  texto: string;
  negrito: boolean;
}
export type Linha = Pedaco[];
export type Paragrafo = Linha[];

export function partirNegrito(linha: string): Pedaco[] {
  const r: Pedaco[] = [];
  const partes = linha.split('**');
  // um número ímpar de ** deixa o último pedaço como texto normal (o negrito não ficou fechado)
  partes.forEach((t, i) => {
    if (!t) return;
    r.push({ texto: t, negrito: i % 2 === 1 && i < partes.length - 1 });
  });
  return r;
}

export function formatar(texto: string): Paragrafo[] {
  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split('\n').map(partirNegrito));
}
