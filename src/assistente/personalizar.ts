import type { EstadoMascote } from '../mascote/expressoes';
import type { Acessorio, PerfilMascote } from '../mascote/personalizacao';
import { contemExpressao, normalizar, palavras, tem, temExata } from './texto';

/**
 * Pedidos para mudar a própria mascote ("mete um chapéu de bruxa", "fica rosa", "dança", "dorme").
 * Só mexe no aspeto; nunca no ficheiro.
 */

const ACESSORIOS: { acessorio: Acessorio; nome: string; quando: (n: string, ps: string[]) => boolean }[] = [
  { acessorio: 'bruxa', nome: 'um chapéu de bruxa', quando: (_n, ps) => tem(ps, ['brux']) },
  { acessorio: 'festa', nome: 'um chapéu de festa', quando: (n, ps) => tem(ps, ['chapeu']) && (tem(ps, ['festa', 'aniversari']) || contemExpressao(n, 'de festa')) },
  { acessorio: 'coroa', nome: 'uma coroa', quando: (_n, ps) => tem(ps, ['coroa']) },
  { acessorio: 'gorro', nome: 'um gorro', quando: (_n, ps) => tem(ps, ['gorro', 'beanie', 'touca']) },
  { acessorio: 'cachecol', nome: 'um cachecol', quando: (_n, ps) => tem(ps, ['cachecol']) },
  { acessorio: 'sol', nome: 'uns óculos de sol', quando: (n, ps) => tem(ps, ['oculo']) && (contemExpressao(n, 'de sol') || tem(ps, ['escuro', 'sol'])) },
  { acessorio: 'oculos', nome: 'uns óculos', quando: (_n, ps) => tem(ps, ['oculo']) },
  { acessorio: 'boina', nome: 'uma boina', quando: (_n, ps) => tem(ps, ['boina']) },
  { acessorio: 'laco', nome: 'um laço', quando: (_n, ps) => tem(ps, ['laco']) },
];

const CORES: { radicais: string[]; cor: string; nome: string }[] = [
  { radicais: ['perola', 'branc'], cor: '#f1eee8', nome: 'pérola' },
  { radicais: ['ciano'], cor: '#7fd6fb', nome: 'ciano' },
  { radicais: ['magenta'], cor: '#ff80c2', nome: 'magenta' },
  { radicais: ['amarel'], cor: '#ffe27a', nome: 'amarela' },
  { radicais: ['grafite', 'cinz', 'pret'], cor: '#4a4f62', nome: 'grafite' },
  { radicais: ['rosa'], cor: '#ffc4d9', nome: 'rosa' },
  { radicais: ['verde', 'menta'], cor: '#b9ecda', nome: 'verde menta' },
  { radicais: ['azul'], cor: '#bcdcff', nome: 'azul' },
  { radicais: ['roxo', 'roxa', 'lilas', 'lavanda', 'violeta'], cor: '#d6cbff', nome: 'lavanda' },
  { radicais: ['laranja', 'pessego'], cor: '#ffd2ad', nome: 'pêssego' },
  { radicais: ['vermelh'], cor: '#ff9a9a', nome: 'vermelha' },
];

const EXPRESSOES: { radicais: string[]; expressao: EstadoMascote; fala: string }[] = [
  { radicais: ['danc', 'bail'], expressao: 'danca', fala: 'Bora lá! 🎵' },
  { radicais: ['dorm', 'sono', 'ressonar'], expressao: 'dorme', fala: 'Zzz… (diz-me alguma coisa para eu acordar)' },
  { radicais: ['bocej'], expressao: 'boceja', fala: 'Aaaah… desculpa.' },
  { radicais: ['pisca'], expressao: 'pisca', fala: 'Cúmplices. 😉' },
  { radicais: ['apaixon', 'amor', 'adora', 'coracao'], expressao: 'ama', fala: 'Adoro ficheiros bem feitos. 💗' },
  { radicais: ['surpres', 'susto', 'assust'], expressao: 'surpresa', fala: 'Oh!' },
  { radicais: ['orgulh'], expressao: 'orgulhosa', fala: 'Com orgulho.' },
  { radicais: ['irrit', 'zanga', 'furios', 'chatead', 'bravo'], expressao: 'irritada', fala: 'Grrr. Quem mandou isto em RGB?' },
  { radicais: ['tont', 'zonz'], expressao: 'tonta', fala: 'Tudo à roda…' },
  { radicais: ['triste', 'chora', 'choro'], expressao: 'erro', fala: 'Snif… mas passa.' },
  { radicais: ['feliz', 'contente', 'alegre', 'sorri', 'sorrir', 'festa'], expressao: 'feliz', fala: 'Estou contente!' },
  { radicais: ['cumprimenta', 'acena', 'saud'], expressao: 'cumprimenta', fala: 'Olá!' },
  { radicais: ['acord', 'desperta'], expressao: 'cumprimenta', fala: 'Bom dia! Já acordei.' },
  { radicais: ['pensa'], expressao: 'pensa', fala: 'Hmmm…' },
];

export interface PedidoMascote {
  mudancas: Partial<PerfilMascote>;
  texto: string;
  expressao: EstadoMascote;
}

/** Percebe um pedido para mudar o aspeto ou a expressão da mascote; null se a mensagem é sobre outra coisa */
export function interpretarMascote(mensagem: string): PedidoMascote | null {
  const n = normalizar(mensagem);
  const ps = palavras(mensagem);
  const falaDela = tem(ps, ['mascote']) || temExata(ps, ['te', 'tu', 'ti', 'fica', 'ficas']) || ps.some((p) => p.endsWith('-te'));

  // acessórios
  const tira = tem(ps, ['tira', 'tire', 'remov', 'sem']) || contemExpressao(n, 'sem acessorio') || contemExpressao(n, 'sem nada');
  if (falaDela && tira && (tem(ps, ['acessori', 'chapeu', 'oculo', 'gorro', 'coroa', 'laco', 'boina', 'cachecol']) || contemExpressao(n, 'sem nada'))) {
    return { mudancas: { acessorio: 'nenhum' }, texto: 'Pronto, sem acessórios.', expressao: 'repouso' };
  }
  const pedeAcessorio = tem(ps, ['mete', 'poe', 'pon', 'coloca', 'veste', 'usa', 'quero', 'da-te', 'poem', 'bota', 'experimenta']) || falaDela;
  if (pedeAcessorio) {
    const a = ACESSORIOS.find((x) => x.quando(n, ps));
    if (a) return { mudancas: { acessorio: a.acessorio }, texto: `Fiquei com ${a.nome}. Que tal?`, expressao: 'orgulhosa' };
  }

  // cor do corpo
  const pedeCor = falaDela && (tem(ps, ['fica', 'ficas', 'muda', 'mud', 'pinta', 'cor', 'poe', 'pon', 'mete', 'quero']) || tem(ps, ['mascote']));
  if (pedeCor) {
    const c = CORES.find((x) => tem(ps, x.radicais));
    if (c) return { mudancas: { cor: c.cor }, texto: `Agora sou ${c.nome}.`, expressao: 'feliz' };
  }

  // bolas
  if (falaDela && tem(ps, ['bola', 'bolas'])) {
    if (tem(ps, ['tira', 'remov', 'esconde', 'sem', 'desliga'])) return { mudancas: { bolas: false }, texto: 'Ok, sem bolas.', expressao: 'repouso' };
    return { mudancas: { bolas: true }, texto: 'Aqui estão as minhas bolas CMYK.', expressao: 'feliz' };
  }

  // esconder / mostrar a própria mascote
  if (falaDela && tem(ps, ['esconde', 'desaparece', 'some', 'vai-te'])) return { mudancas: { visivel: false }, texto: 'Ok, escondo-me. Se me quiseres de volta, é nas Definições → Mascote.', expressao: 'repouso' };

  // expressões
  const dirigida = falaDela || ps.length <= 4;
  if (dirigida) {
    const e = EXPRESSOES.find((x) => tem(ps, x.radicais));
    if (e && !tem(ps, ['alert', 'erro', 'ficheiro', 'pdf'])) return { mudancas: {}, texto: e.fala, expressao: e.expressao };
  }
  return null;
}
