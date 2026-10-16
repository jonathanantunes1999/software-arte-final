import type { Alerta, Gravidade, Local } from '../alertas/tipos';
import { formatarPaginas } from '../analise/resumo';

/**
 * Revisão do texto do PDF para português de Portugal, feita só com regras. Não é um corretor
 * ortográfico: não traz dicionário e não percebe frases. Apanha o que se repete nos trabalhos
 * de quem vem do português do Brasil (vocabulário, gerúndio, formatos) e deslizes tipográficos.
 */

export interface ItemTexto {
  str: string;
  /** Posição e tamanho no espaço de utilizador da página, em pt */
  x: number;
  y: number;
  w: number;
  h: number;
  /** O pdf.js diz que a linha acaba aqui */
  eol: boolean;
}

export interface PaginaTexto {
  /** 0-based */
  pagina: number;
  itens: ItemTexto[];
}

/** Uma ocorrência, já com o sítio onde está */
interface Ocorrencia {
  pagina: number;
  texto: string;
  local: Local;
}

const L = '\\p{L}';
/** \b não serve com acentos: um limite de palavra é "não ter letra ou dígito ao lado" */
const palavra = (alternativas: string) => new RegExp(`(?<![${L}\\d_])(?:${alternativas})(?![${L}\\d_])`, 'giu');

// --- vocabulário do português do Brasil → Portugal
// Só entram palavras que em Portugal quase nunca se usam com este sentido. Ficam de fora as que também existem cá
// ("fato", "time", "tela", "salvar", "arquivo", "garoto", "vocês"…): davam mais falsos alarmes do que ajuda.
const VOCABULARIO: Record<string, string> = {
  'você': 'tu / o senhor / a senhora',
  'ônibus': 'autocarro',
  'celular': 'telemóvel',
  'celulares': 'telemóveis',
  'geladeira': 'frigorífico',
  'equipe': 'equipa',
  'equipes': 'equipas',
  'usuário': 'utilizador',
  'usuários': 'utilizadores',
  'usuária': 'utilizadora',
  'cadastrar': 'registar',
  'gerenciar': 'gerir',
  'gerenciamento': 'gestão',
  'contato': 'contacto',
  'contatos': 'contactos',
  'café da manhã': 'pequeno-almoço',
  'sorvete': 'gelado',
  'sorvetes': 'gelados',
  'suco': 'sumo',
  'sucos': 'sumos',
  'xícara': 'chávena',
  'banheiro': 'casa de banho',
  'sacola': 'saco',
  'sacolas': 'sacos',
  'trem': 'comboio',
  'caminhão': 'camião',
  'cardápio': 'ementa',
  'açougue': 'talho',
  'pedágio': 'portagem',
  'deletar': 'eliminar / apagar',
  'pra': 'para',
  'tá': 'está',
  'bacana': 'giro / fixe',
};

const ER_VOCABULARIO = palavra(Object.keys(VOCABULARIO).map((p) => p.replace(/ /g, '\\s+')).join('|'));

// --- estar + gerúndio ("estou fazendo" → "estou a fazer")
const ER_GERUNDIO = new RegExp(`(?<![${L}\\d_])(?:estou|estás|está|estamos|estais|estão|estava|estavas|estávamos|estavam|estive|esteve|estiveram|estarei|estará|estaremos|estarão)\\s+(${L}{2,}(?:ando|endo|indo))(?![${L}\\d_])`, 'giu');
const NAO_E_GERUNDIO = new Set(['lindo', 'findo', 'infindo', 'brando', 'blando', 'grando', 'quando', 'comando', 'mando', 'cando', 'rendo']);

function infinitivo(g: string): string {
  const f = g.toLowerCase();
  if (f.endsWith('ando')) return `${f.slice(0, -4)}ar`;
  if (f.endsWith('endo')) return `${f.slice(0, -4)}er`;
  return `${f.slice(0, -4)}ir`;
}

// --- documentos e formatos do Brasil
const ER_DOCUMENTOS_BR = new RegExp(
  [
    'R\\$\\s?\\d[\\d.,]*', // R$ 19,90
    `(?<![${L}\\d_])(?:CEP|CPF|CNPJ)(?![${L}\\d_])`,
    '\\(\\d{2}\\)\\s?9?\\d{4}[- ]\\d{4}', // (21) 99999-9999
    '\\b\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}\\b', // CPF
  ].join('|'),
  'gu',
);
const SUGESTAO_DOCUMENTO: [RegExp, string][] = [
  [/^R\$/, 'euro (€)'],
  [/^CEP$/i, 'código postal'],
  [/^CPF$/i, 'NIF'],
  [/^CNPJ$/i, 'NIPC'],
  [/^\(/, 'número de telefone português (9 dígitos, sem parêntesis)'],
  [/^\d{3}\./, 'NIF (9 dígitos)'],
];

// --- expressões feitas
const EXPRESSOES: [RegExp, string][] = [
  [palavra('afim\\s+de'), '"a fim de"'],
  [palavra('a\\s+n[ií]vel\\s+de'), '"em termos de" ou "quanto a" ("a nível de" é muito criticado)'],
  [palavra('à\\s+n[ií]vel\\s+de'), '"em termos de" ou "quanto a"'],
  [palavra('haja\\s+visto'), '"haja em vista"'],
  [palavra('houveram'), '"houve" (o verbo haver, neste sentido, não vai para o plural)'],
  [palavra('a\\s+cerca\\s+de'), '"acerca de" (a propósito de) ou "cerca de" (aproximadamente)'],
  [palavra('em\\s+nível\\s+de'), '"ao nível de"'],
];

// --- tipografia
const ER_RETICENCIAS = /\.{3}/gu;
const ER_ESPACO_ANTES = new RegExp(`(?<=[${L}\\d])\\s+[,;.!?](?=\\s|$)`, 'gu');
const ER_FALTA_ESPACO = new RegExp(`(?<=[${L}]{2})[,;](?=[${L}])`, 'gu');
const ER_REPETIDA = new RegExp(`(?<![${L}\\d_])(${L}{2,})\\s+\\1(?![${L}\\d_])`, 'giu');
// palavras que se repetem de propósito
const REPETE_BEM = new Set(['bem', 'muito', 'tchau', 'não', 'já', 'pois', 'sim', 'mais', 'devagar', 'zzz', 'ha', 'há', 'lá', 'cá', 'ai', 'ah', 'oh', 'hey', 'blá', 'la', 'na', 'no', 'da', 'do']);

// --- grafia: antes e depois do Acordo Ortográfico de 1990
const PARES_ACORDO: [string, string][] = [
  ['ação', 'acção'],
  ['ações', 'acções'],
  ['projeto', 'projecto'],
  ['projetos', 'projectos'],
  ['objetivo', 'objectivo'],
  ['objetivos', 'objectivos'],
  ['direção', 'direcção'],
  ['atual', 'actual'],
  ['seleção', 'selecção'],
  ['coleção', 'colecção'],
  ['receção', 'recepção'],
  ['ótimo', 'óptimo'],
  ['espetáculo', 'espectáculo'],
  ['aspeto', 'aspecto'],
  ['adoção', 'adopção'],
  ['ativo', 'activo'],
  ['ativa', 'activa'],
  ['perspetiva', 'perspectiva'],
  ['setor', 'sector'],
  ['exceção', 'excepção'],
  ['elétrico', 'eléctrico'],
];

const MAX_EXEMPLOS = 6;
const MAX_LOCAIS = 40;

function construirTexto(itens: ItemTexto[]): { texto: string; inicio: number[] } {
  let texto = '';
  const inicio: number[] = [];
  let anterior: ItemTexto | null = null;
  for (const it of itens) {
    if (anterior) {
      const mesmaLinha = Math.abs(it.y - anterior.y) < Math.max(1, anterior.h * 0.5) && !anterior.eol;
      if (!mesmaLinha) texto += '\n';
      else if (!anterior.str.endsWith(' ') && !it.str.startsWith(' ') && it.x - (anterior.x + anterior.w) > anterior.h * 0.15) texto += ' ';
    }
    inicio.push(texto.length);
    texto += it.str;
    anterior = it;
  }
  return { texto, inicio };
}

function itemEm(inicio: number[], pos: number): number {
  let lo = 0;
  let hi = inicio.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (inicio[m] <= pos) lo = m;
    else hi = m - 1;
  }
  return lo;
}

const caixaDe = (it: ItemTexto) => ({ x0: it.x, y0: it.y, x1: it.x + Math.max(it.w, 1), y1: it.y + Math.max(it.h, 1) });

/** Corre uma expressão sobre o texto de cada página e devolve o que encontrou, com o sítio */
function procurar(paginas: { pagina: number; itens: ItemTexto[]; texto: string; inicio: number[] }[], re: RegExp, filtro?: (m: RegExpExecArray) => boolean): (Ocorrencia & { m: RegExpExecArray })[] {
  const r: (Ocorrencia & { m: RegExpExecArray })[] = [];
  for (const p of paginas) {
    re.lastIndex = 0;
    for (let m = re.exec(p.texto); m; m = re.exec(p.texto)) {
      if (m[0] === '') {
        re.lastIndex++;
        continue;
      }
      if (filtro && !filtro(m)) continue;
      const it = p.itens[itemEm(p.inicio, m.index)];
      r.push({ pagina: p.pagina, texto: m[0].replace(/\s+/g, ' '), local: { pagina: p.pagina, caixa: caixaDe(it) }, m });
    }
  }
  return r;
}

interface Grupo {
  chave: string;
  texto: string;
  /** O que se propõe no lugar */
  sugestao?: string;
  paginas: number[];
}

function agrupar(oc: Ocorrencia[], sugestao: (texto: string) => string | undefined): Grupo[] {
  const g = new Map<string, Grupo>();
  for (const o of oc) {
    const chave = o.texto.toLowerCase();
    const e = g.get(chave) ?? g.set(chave, { chave, texto: o.texto, sugestao: sugestao(o.texto), paginas: [] }).get(chave)!;
    e.paginas.push(o.pagina);
  }
  return [...g.values()].sort((a, b) => b.paginas.length - a.paginas.length);
}

function alerta(id: string, gravidade: Gravidade, titulo: string, explicacao: string, oc: Ocorrencia[], sugestao: (texto: string) => string | undefined): Alerta | null {
  if (oc.length === 0) return null;
  const grupos = agrupar(oc, sugestao);
  const linhas = grupos.slice(0, MAX_EXEMPLOS).map((g) => `«${g.texto}»${g.sugestao ? ` → ${g.sugestao}` : ''} (${formatarPaginas(g.paginas, 4)})`);
  if (grupos.length > MAX_EXEMPLOS) linhas.push(`e mais ${grupos.length - MAX_EXEMPLOS}`);
  return {
    id,
    gravidade,
    titulo,
    detalhe: [explicacao, ...linhas].join('\n'),
    pagina: oc[0].pagina,
    locais: oc.slice(0, MAX_LOCAIS).map((o) => o.local),
  };
}

/** Procura o que não parece português de Portugal e deslizes de escrita. Devolve alertas prontos para a lista. */
export function revisarTexto(paginasBrutas: PaginaTexto[]): Alerta[] {
  const paginas = paginasBrutas.map((p) => ({ ...p, ...construirTexto(p.itens) })).filter((p) => p.itens.length > 0);
  const r: (Alerta | null)[] = [];

  r.push(
    alerta(
      'texto-brasileirismo',
      'aviso',
      'Vocabulário do português do Brasil',
      'Palavras que em Portugal se dizem de outra maneira. Confirma se o texto é mesmo para Portugal.',
      procurar(paginas, ER_VOCABULARIO),
      (t) => VOCABULARIO[t.toLowerCase().replace(/\s+/g, ' ')],
    ),
  );

  r.push(
    alerta(
      'texto-gerundio',
      'aviso',
      'Gerúndio onde em Portugal se usa «a + infinitivo»',
      'Em Portugal diz-se «estou a fazer», não «estou fazendo».',
      procurar(paginas, ER_GERUNDIO, (m) => !NAO_E_GERUNDIO.has(m[1].toLowerCase())),
      (t) => {
        const m = /^(\p{L}+)\s+(\p{L}+)$/u.exec(t);
        return m ? `${m[1]} a ${infinitivo(m[2])}` : undefined;
      },
    ),
  );

  r.push(
    alerta(
      'texto-formatos-br',
      'aviso',
      'Formatos que não são portugueses',
      'Moeda, documentos ou telefones no formato do Brasil.',
      procurar(paginas, ER_DOCUMENTOS_BR),
      (t) => SUGESTAO_DOCUMENTO.find(([re]) => re.test(t))?.[1],
    ),
  );

  const expressoes = EXPRESSOES.flatMap(([re, sug]) => procurar(paginas, re).map((o) => ({ ...o, sug })));
  const sugPorTexto = new Map(expressoes.map((o) => [o.texto.toLowerCase(), o.sug]));
  r.push(alerta('texto-expressoes', 'aviso', 'Expressões a rever', 'Erros muito comuns na escrita.', expressoes, (t) => sugPorTexto.get(t.toLowerCase())));

  r.push(
    alerta(
      'texto-repetida',
      'info',
      'Palavra repetida seguida',
      'Pode ser gralha de edição.',
      procurar(paginas, ER_REPETIDA, (m) => !REPETE_BEM.has(m[1].toLowerCase())),
      () => undefined,
    ),
  );
  r.push(alerta('texto-espaco-antes', 'info', 'Espaço antes da pontuação', 'Em português não se deixa espaço antes de vírgula, ponto, ponto e vírgula, ! ou ?.', procurar(paginas, ER_ESPACO_ANTES), () => undefined));
  r.push(alerta('texto-falta-espaco', 'info', 'Falta espaço depois da vírgula', 'Escreve-se «olá, mundo», não «olá,mundo».', procurar(paginas, ER_FALTA_ESPACO), () => undefined));
  r.push(alerta('texto-reticencias', 'info', 'Três pontos em vez de reticências', 'Tipograficamente usa-se o caráter … (um só sinal).', procurar(paginas, ER_RETICENCIAS), () => '…'));

  // grafia: duas ortografias no mesmo ficheiro
  const mistos: string[] = [];
  const locaisMistos: Local[] = [];
  let primeira: number | undefined;
  for (const [nova, antiga] of PARES_ACORDO) {
    const a = procurar(paginas, palavra(nova));
    const b = procurar(paginas, palavra(antiga));
    if (a.length && b.length) {
      mistos.push(`«${nova}» (${formatarPaginas(a.map((o) => o.pagina), 3)}) e «${antiga}» (${formatarPaginas(b.map((o) => o.pagina), 3)})`);
      for (const o of b) locaisMistos.push(o.local);
      primeira ??= b[0].pagina;
    }
  }
  if (mistos.length) {
    r.push({
      id: 'texto-acordo-misto',
      gravidade: 'aviso',
      titulo: 'Duas grafias no mesmo ficheiro',
      detalhe: ['Há palavras escritas com e sem o Acordo Ortográfico de 1990. Escolhe uma e usa-a em todo o lado.', ...mistos.slice(0, MAX_EXEMPLOS)].join('\n'),
      pagina: primeira,
      locais: locaisMistos.slice(0, MAX_LOCAIS),
    });
  }

  return r.filter((x): x is Alerta => x !== null);
}
