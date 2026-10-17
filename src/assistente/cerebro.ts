import type { TipoCorrecao } from '../alertas/correcao-sugerida';
import type { EstadoMascote } from '../mascote/expressoes';
import { construirPedido, TODAS_SEGURAS } from './correcoes';
import { topico, topicoDoAlerta, TOPICOS, type Topico } from './conhecimento';
import { interpretarMascote } from './personalizar';
import { combina, contemExpressao, normalizar, numeroNoTexto, palavras, tem, temExata } from './texto';
import type { Acao, AlertaResumo, ContextoAssistente, Memoria, Painel, Resposta, Resultado } from './tipos';

/**
 * O "cérebro" local da mascote: percebe o que o utilizador escreve em português (comandos e perguntas)
 * e responde com texto e com ações para a app executar. Não usa nenhum serviço externo: corre aqui, é
 * previsível e o ficheiro nunca sai do computador. A interface (`Cerebro`) permite trocar por outro mais
 * tarde (um modelo de linguagem, por exemplo) sem mexer no resto.
 */
export interface Cerebro {
  responder(mensagem: string, contexto: ContextoAssistente, memoria: Memoria): Resultado;
}

const n = (x: number, um: string, varios: string) => `${x} ${x === 1 ? um : varios}`;
const paginasTexto = (ps: number[]) => (ps.length === 0 ? '' : ps.length === 1 ? ` (pág. ${ps[0]})` : ` (págs. ${ps.slice(0, 4).join(', ')}${ps.length > 4 ? '…' : ''})`);

function resultado(texto: string, expressao: EstadoMascote, opcoes: { acoes?: Acao[]; sugestoes?: string[]; pendente?: Acao[] | null; tema?: string | null } = {}, memoria?: Memoria): Resultado {
  const resposta: Resposta = { texto, expressao, acoes: opcoes.acoes ?? [], sugestoes: opcoes.sugestoes ?? [] };
  return { resposta, memoria: { pendente: opcoes.pendente ?? null, ultimoTema: opcoes.tema ?? memoria?.ultimoTema ?? null } };
}

// ───────────────────────────── contexto → frases

function sugestoesDoContexto(c: ContextoAssistente): string[] {
  if (!c.ficheiro) return ['Abre um exemplo', 'O que sabes fazer?', 'O que é sangria?'];
  if (!c.inventario) return ['O que sabes fazer?', 'O que é sangria?'];
  const s: string[] = [];
  if (c.alertas.length) s.push('Resume o ficheiro');
  if (c.alertas.some((a) => a.correcao)) s.push('Corrige o que der');
  if (c.alertas.length) s.push('Explica o primeiro erro');
  if (c.corrigido) s.push('Compara com o original');
  if (s.length < 3) s.push('O que é overprint?');
  return s.slice(0, 4);
}

const ORDEM = { erro: 0, aviso: 1, info: 2 } as const;
const contar = (as: AlertaResumo[]) => ({ erros: as.filter((a) => a.gravidade === 'erro').length, avisos: as.filter((a) => a.gravidade === 'aviso').length, notas: as.filter((a) => a.gravidade === 'info').length });

function resumir(c: ContextoAssistente): Resultado {
  if (!c.ficheiro) return resultado('Ainda não tenho nenhum ficheiro aberto. Larga um PDF aqui na janela, ou diz «abre um exemplo» para eu te mostrar como funciona.', 'pergunta', { sugestoes: sugestoesDoContexto(c) });
  if (!c.inventario) return resultado(`Ainda estou a analisar **${c.ficheiro.nome}**. Dá-me um segundo.`, 'analisa');
  const k = contar(c.alertas);
  const cabecalho = `**${c.ficheiro.nome}** (${n(c.ficheiro.paginas, 'página', 'páginas')})`;
  if (!k.erros && !k.avisos) {
    const notas = k.notas ? ` Só ${n(k.notas, 'nota informativa', 'notas informativas')}.` : '';
    return resultado(`${cabecalho}: está tudo em ordem. Não encontrei erros nem avisos.${notas}${c.corrigido ? '' : ' Se quiseres, abro o relatório para entregares ao cliente.'}`, 'ok', { sugestoes: ['Abre o relatório', 'O que verificas?'] });
  }
  const graves = [...c.alertas].filter((a) => a.gravidade !== 'info').sort((a, b) => ORDEM[a.gravidade] - ORDEM[b.gravidade]);
  const top = graves.slice(0, 3).map((a, i) => `${i + 1}. ${a.titulo}${paginasTexto(a.paginas)}`).join('\n');
  const contagens = [k.erros ? n(k.erros, 'erro', 'erros') : '', k.avisos ? n(k.avisos, 'aviso', 'avisos') : '', k.notas ? n(k.notas, 'nota', 'notas') : ''].filter(Boolean).join(', ');
  const auto = construirPedido(TODAS_SEGURAS, c);
  let texto = `${cabecalho}: ${contagens}.\n\n${top}`;
  const opcoes: { acoes?: Acao[]; sugestoes: string[]; pendente?: Acao[] | null } = { sugestoes: ['Explica o primeiro erro', 'Mostra-me o primeiro erro'] };
  if (auto.pedido) {
    texto += `\n\nDestes, consigo corrigir sozinha: ${auto.descricao.join('; ')}. Queres que corrija? (Faço numa cópia, o original fica como está.)`;
    opcoes.pendente = [{ tipo: 'corrigir', pedido: auto.pedido, descricao: auto.descricao }];
    opcoes.sugestoes.unshift('Sim, corrige');
  }
  return resultado(texto, k.erros ? 'erro' : 'aviso', opcoes);
}

// ───────────────────────────── alertas

function indiceDoAlerta(ps: string[], c: ContextoAssistente): number | null {
  const num = numeroNoTexto(ps);
  if (num !== null && num >= 1 && num <= c.alertas.length) return num - 1;
  if (tem(ps, ['primeir'])) return c.alertas.length ? 0 : null;
  if (tem(ps, ['ultim'])) return c.alertas.length ? c.alertas.length - 1 : null;
  const i = c.alertas.findIndex((a) => a.gravidade === 'erro');
  return tem(ps, ['erro', 'grave', 'pior']) && i >= 0 ? i : null;
}

function explicarAlerta(i: number, c: ContextoAssistente): Resultado {
  const a = c.alertas[i];
  const t = topicoDoAlerta(a.id);
  const detalhe = a.detalhe.trim() ? `\n\n${a.detalhe.trim()}` : '';
  let texto = `**${a.titulo}**${paginasTexto(a.paginas)}${detalhe}`;
  if (t) texto += `\n\n${t.texto}`;
  const opcoes: { acoes?: Acao[]; sugestoes: string[]; pendente?: Acao[] | null } = { sugestoes: [`Mostra-me o alerta ${i + 1}`] };
  if (a.correcao) {
    const cons = construirPedido([a.correcao], c);
    if (cons.pedido) {
      texto += `\n\nPosso resolver isto: ${cons.descricao.join('; ')}. Queres?`;
      opcoes.pendente = [{ tipo: 'corrigir', pedido: cons.pedido, descricao: cons.descricao }];
      opcoes.sugestoes.unshift('Sim, corrige');
    } else if (cons.prepararPainel) {
      texto += '\n\nIsto só se resolve contigo a escolher qual é a cor. Abro-te o painel já preparado.';
      opcoes.acoes = [{ tipo: 'prepararCorrecao', correcao: cons.prepararPainel }];
    }
  }
  return resultado(texto, a.gravidade === 'erro' ? 'erro' : a.gravidade === 'aviso' ? 'aviso' : 'pensa', opcoes, undefined);
}

function mostrarAlerta(i: number, c: ContextoAssistente): Resultado {
  const a = c.alertas[i];
  return resultado(`Aqui está: **${a.titulo}**${paginasTexto(a.paginas)}. Marquei-o na página.`, 'procura', { acoes: [{ tipo: 'irParaAlerta', indice: i }], sugestoes: ['Explica-me este alerta'] });
}

// ───────────────────────────── correções

/** Que correções pede esta frase? */
function alvosDeCorrecao(ps: string[], norm: string): TipoCorrecao[] | 'tudo' {
  const alvos = new Set<TipoCorrecao>();
  if (tem(ps, ['sangri'])) alvos.add('sangria');
  if (tem(ps, ['marca']) || temExata(ps, ['crop'])) alvos.add('marcas');
  if (temExata(ps, ['rgb', 'cmyk', 'cmik', 'cmyc']) || tem(ps, ['quadricrom'])) alvos.add('rgb-cmyk');
  if (tem(ps, ['curva', 'vetoriz', 'outline']) || contemExpressao(norm, 'texto em curvas')) alvos.add('curvas');
  if (tem(ps, ['overprint', 'sobreimpress'])) {
    const branco = tem(ps, ['branc']);
    const preto = tem(ps, ['pret']);
    const spots = tem(ps, ['spot', 'tecnic', 'faca', 'vinco', 'verniz']);
    if (branco) alvos.add('overprint-branco');
    if (preto) alvos.add('overprint-preto');
    if (spots) alvos.add('overprint-spots');
    if (!branco && !preto && !spots) for (const t of ['overprint-branco', 'overprint-preto', 'overprint-spots'] as const) alvos.add(t);
  }
  if (tem(ps, ['junt', 'duplicad', 'agrup', 'fundi', 'unific']) && tem(ps, ['spot', 'pantone', 'cor', 'cores', 'tinta', 'tintas', 'duplicad'])) alvos.add('juntar-spots');
  if (tem(ps, ['faca', 'vinco', 'cortante'])) alvos.add('faca-em-spot');
  if (!alvos.size && (tem(ps, ['tud', 'automatic', 'arrum', 'resolv', 'limp', 'ajeit', 'prepar', 'otimiz']) || temExata(ps, ['todos', 'todas', 'tudo']))) return 'tudo';
  return [...alvos];
}

const VERBOS_ACAO = ['corrig', 'resolv', 'arranj', 'trat', 'conserta', 'aplic', 'gera', 'gerar', 'convert', 'passa', 'pass', 'muda', 'mudar', 'liga', 'ligar', 'deslig', 'poe', 'pon', 'junt', 'arrum', 'limp', 'ajust', 'prepar', 'transform', 'fix', 'otimiz', 'mete', 'coloca', 'ajeit', 'tenta'];
const eVerboDeAcao = (ps: string[]) => tem(ps, VERBOS_ACAO) || temExata(ps, ['faz', 'fazer', 'fixe', 'bora', 'cria', 'criar', 'crie', 'adiciona', 'acrescenta']);

/** "sangria de 5 mm" → 5 (entre 1 e 10 mm); null se não diz; NaN se diz um valor que não faz sentido */
function milimetrosPedidos(mensagem: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*mm/.exec(mensagem.toLowerCase());
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return v >= 1 && v <= 10 ? v : NaN;
}

function corrigir(alvos: TipoCorrecao[] | 'tudo', c: ContextoAssistente, mensagem = ''): Resultado {
  if (!c.ficheiro) return resultado('Primeiro preciso de um ficheiro. Larga um PDF aqui, ou diz «abre um exemplo».', 'pergunta', { sugestoes: ['Abre um exemplo'] });
  if (!c.inventario) return resultado('Ainda estou a analisar o ficheiro. Dá-me um segundo e pede outra vez.', 'analisa');
  const tipos = alvos === 'tudo' ? TODAS_SEGURAS : alvos;
  const mm = milimetrosPedidos(mensagem);
  if (mm !== null && Number.isNaN(mm) && tipos.includes('sangria')) return resultado('Uma sangria normal vai de 2 a 5 mm (3 mm é o habitual). Diz-me um valor entre 1 e 10 mm.', 'pergunta');
  const cons = construirPedido(tipos, c, { sangriaMm: mm ?? undefined });
  const partes: string[] = [];
  const acoes: Acao[] = [];
  if (cons.pedido) {
    partes.push(`Vou ${cons.descricao.join('; ')}. Faço numa cópia, o original fica intacto.`);
    acoes.push({ tipo: 'corrigir', pedido: cons.pedido, descricao: cons.descricao });
  }
  if (cons.prepararPainel) {
    partes.push(
      cons.prepararPainel === 'marcas'
        ? 'As marcas de corte podem obrigar a aumentar a página, e isso é uma escolha tua (tamanho e distância ao corte), por isso abro-te o painel já preparado.'
        : 'A faca precisa de uma escolha tua (qual das cores é a faca), por isso abro-te o painel já preparado.',
    );
    acoes.push({ tipo: 'prepararCorrecao', correcao: cons.prepararPainel });
  }
  const sem = cons.naoFeito.filter((x) => !(x.tipo === cons.prepararPainel));
  if (!cons.pedido && !cons.prepararPainel) {
    const razoes = sem.map((x) => x.motivo);
    partes.push(alvos === 'tudo' ? 'Não encontrei nada que eu consiga corrigir sozinha. Se há algo a rever, é contigo (por exemplo, texto em curvas ou a faca).' : `Não fiz nada: ${[...new Set(razoes)].join('; ')}.`);
  } else if (sem.length && alvos !== 'tudo') {
    partes.push(`O resto não fiz: ${[...new Set(sem.map((x) => x.motivo))].join('; ')}.`);
  }
  if (alvos === 'tudo') partes.push('Deixei de fora o texto em curvas, porque o texto deixa de ser editável. Diz-me se também o queres.');
  partes.push(...cons.notas);
  return resultado(partes.join('\n\n'), acoes.length ? 'trabalha' : 'pensa', { acoes, sugestoes: acoes.length ? [] : sugestoesDoContexto(c) });
}

// ───────────────────────────── explicações

function pontuar(t: Topico, ps: string[], norm: string): number {
  let pontos = 0;
  for (const ch of t.chaves) {
    if (ch.includes(' ')) {
      if (contemExpressao(norm, ch)) pontos += 3;
    } else if (ps.some((p) => combina(p, ch))) pontos += 1;
  }
  return pontos;
}

function melhorTopico(ps: string[], norm: string): Topico | null {
  let melhor: Topico | null = null;
  let pontos = 0;
  for (const t of TOPICOS) {
    const p = pontuar(t, ps, norm);
    if (p > pontos) {
      melhor = t;
      pontos = p;
    }
  }
  return melhor;
}

function explicar(t: Topico, c: ContextoAssistente): Resultado {
  let texto = t.texto;
  const extra = t.noFicheiro?.(c);
  if (extra) texto += `\n\n${extra}`;
  const opcoes: { acoes?: Acao[]; sugestoes: string[]; pendente?: Acao[] | null; tema: string } = { sugestoes: [], tema: t.id };
  if (t.correcao && c.inventario) {
    const cons = construirPedido([t.correcao], c);
    if (cons.pedido) {
      texto += ' Queres que trate disso?';
      opcoes.pendente = [{ tipo: 'corrigir', pedido: cons.pedido, descricao: cons.descricao }];
      opcoes.sugestoes.push('Sim, trata disso');
    }
  }
  const outras = ['O que é sangria?', 'RGB ou CMYK?', 'O que é overprint?', 'Para que serve o preto rico?'].filter((s) => !normalizar(s).includes(t.id));
  opcoes.sugestoes.push(...outras.slice(0, 2));
  return resultado(texto, 'pensa', opcoes);
}

const PERGUNTAS = ['porque', 'porqu', 'significa', 'explic', 'diferenc', 'serve', 'importa', 'funciona', 'quer dizer'];
function ePergunta(ps: string[], norm: string): boolean {
  return contemExpressao(norm, 'tenho de') || contemExpressao(norm, 'tenho que') || contemExpressao(norm, 'preciso de') || contemExpressao(norm, 'o que e') || contemExpressao(norm, 'que e') || contemExpressao(norm, 'o que sao') || contemExpressao(norm, 'o que significa') || tem(ps, PERGUNTAS) || temExata(ps, ['quando', 'devo', 'preciso', 'qual', 'quais', 'quanto', 'quantos']);
}

// ───────────────────────────── navegação e interface

const ABRIR = ['abr', 'mostr', 'ver', 'vai', 'leva', 'ir', 'quero', 'mostra', 'chama', 'desce', 'sobe', 'salta', 'passa', 'muda'];
const eAbrir = (ps: string[]) => tem(ps, ABRIR) || temExata(ps, ['ve', 'ver', 'ir']);

function navegar(ps: string[], norm: string, c: ContextoAssistente): Resultado | null {
  const abrir = eAbrir(ps);
  // painéis
  const paineis: [string[], Painel, string][] = [
    [['layer'], 'layers', 'as Layers'],
    [['separac', 'chapa', 'placas'], 'separacoes', 'as Separações'],
    [['correc'], 'correcoes', 'as Correções'],
    [['caixa', 'trimbox', 'bleedbox'], 'caixas', 'as Caixas'],
  ];
  if (abrir && !ePergunta(ps, norm)) {
    for (const [radicais, painel, nome] of paineis) if (tem(ps, radicais)) return resultado(`Pronto, aqui tens ${nome}.`, 'procura', { acoes: [{ tipo: 'painel', painel }], sugestoes: sugestoesDoContexto(c) });
  }
  // definições
  if (tem(ps, ['definic', 'configurac', 'preferenc', 'opcoes']) || (tem(ps, ['mascote']) && tem(ps, ['personaliz', 'edit', 'defin']))) {
    const mascote = tem(ps, ['mascote', 'personaliz']);
    const relatorio = tem(ps, ['relatorio', 'autor', 'agencia']);
    const separador = mascote ? 'mascote' : relatorio ? 'relatorio' : 'verificacoes';
    return resultado(mascote ? 'Aqui tens o separador da mascote: cor, acessórios, expressões e onde apareço.' : 'Abri as Definições.', mascote ? 'feliz' : 'procura', { acoes: [{ tipo: 'definicoes', separador }] });
  }
  // relatório, comparar, descarregar
  if (tem(ps, ['relatorio']) && abrir) {
    if (!c.ficheiro) return resultado('Para fazer o relatório preciso de um ficheiro aberto.', 'pergunta');
    return resultado('Abri o relatório num separador novo. De lá podes imprimir ou guardar em PDF.', 'orgulhosa', { acoes: [{ tipo: 'relatorio' }] });
  }
  if (tem(ps, ['compar'])) {
    if (!c.corrigido) return resultado('Ainda não há cópia corrigida para comparar. Diz-me o que queres corrigir e eu faço-a.', 'pergunta', { sugestoes: ['Corrige o que der'] });
    return resultado('Aqui tens o Comparar: o original contra a cópia corrigida.', 'procura', { acoes: [{ tipo: 'comparar' }] });
  }
  if (tem(ps, ['descarreg', 'guard', 'exporta', 'grava', 'download', 'save']) || (tem(ps, ['copia']) && abrir)) {
    if (!c.corrigido) return resultado('Ainda não há cópia corrigida para guardar. Primeiro diz-me o que queres corrigir.', 'pergunta', { sugestoes: ['Corrige o que der'] });
    return resultado(c.desktop ? 'Vou abrir o diálogo para guardares a cópia (nunca por cima do original).' : 'A descarregar a cópia corrigida.', 'envia', { acoes: [{ tipo: 'descarregar' }] });
  }
  // abrir ficheiros
  if (tem(ps, ['exemplo', 'demo', 'demonstrac'])) return resultado('Já abro um exemplo para veres como funciona.', 'feliz', { acoes: [{ tipo: 'abrirExemplo' }] });
  if (tem(ps, ['abr', 'carreg', 'import']) && tem(ps, ['pdf', 'ficheiro', 'outro', 'novo'])) return resultado('Escolhe o ficheiro na janela que abri.', 'cumprimenta', { acoes: [{ tipo: 'abrirFicheiro' }] });
  // tema
  if (tem(ps, ['tema', 'modo', 'escuro', 'claro', 'dark', 'noite', 'luz']) && !ePergunta(ps, norm)) {
    const escuro = tem(ps, ['escuro', 'dark', 'noite']);
    const claro = tem(ps, ['claro', 'dia', 'luz']);
    const auto = tem(ps, ['auto', 'sistema']);
    if (escuro || claro || auto) {
      const tema = auto ? 'auto' : escuro ? 'escuro' : 'claro';
      return resultado(tema === 'auto' ? 'Passei a seguir o tema do sistema.' : `Tema ${tema} ligado.`, 'feliz', { acoes: [{ tipo: 'tema', tema }] });
    }
  }
  // páginas
  if (c.ficheiro && tem(ps, ['pagin']) && !ePergunta(ps, norm)) {
    const num = numeroNoTexto(ps);
    const atual = c.ficheiro.pagina;
    const total = c.ficheiro.paginas;
    let destino: number | null = null;
    if (tem(ps, ['seguinte', 'proxim'])) destino = Math.min(total, atual + 1);
    else if (tem(ps, ['anterior', 'ant'])) destino = Math.max(1, atual - 1);
    else if (tem(ps, ['ultim'])) destino = total;
    else if (tem(ps, ['primeir']) && num === 1) destino = 1;
    else if (num !== null) destino = num;
    if (destino !== null) {
      if (destino < 1 || destino > total) return resultado(`O ficheiro só tem ${n(total, 'página', 'páginas')}.`, 'pergunta');
      return resultado(`Página ${destino}.`, 'procura', { acoes: [{ tipo: 'pagina', pagina: destino - 1 }] });
    }
  }
  // alertas
  if (c.ficheiro && c.alertas.length && eAbrir(ps) && tem(ps, ['erro', 'alert', 'avis', 'problem', 'aviso']) && !ePergunta(ps, norm)) {
    const i = indiceDoAlerta(ps, c) ?? (tem(ps, ['proxim', 'seguinte']) ? 0 : 0);
    return mostrarAlerta(i, c);
  }
  return null;
}

// ───────────────────────────── conversa

const SIM = ['sim', 'ok', 'claro', 'pode', 'avanca', 'bora', 'vai', 'faz', 'certo', 'confirmo', 'fixe', 'manda', 'perfeito', 'exato', 'isso', 'yes', 'sip', 'pois'];
const NAO = ['nao', 'deixa', 'cancela', 'esquece', 'nop', 'nem', 'agora', 'parar'];

function eSim(ps: string[]) {
  return ps.length <= 5 && (temExata(ps, SIM) || tem(ps, ['avanc', 'confirm', 'corrige', 'trata'])) && !temExata(ps, ['nao']);
}
function eNao(ps: string[]) {
  return ps.length <= 4 && temExata(ps, NAO);
}

function ajuda(c: ContextoAssistente): Resultado {
  return resultado(
    'Sou a tua assistente de arte final. Dentro desta janela posso:\n\n' +
      '**Corrigir**: «corrige tudo», «gera a sangria», «cria as marcas de corte», «converte para CMYK», «liga o overprint no preto», «junta as spots duplicadas», «passa o texto a curvas».\n\n' +
      '**Explicar**: «o que é sangria?», «porque é mau o RGB?», «explica o primeiro erro», «resume o ficheiro».\n\n' +
      '**Levar-te a sítios**: «mostra o primeiro erro», «página 3», «abre as separações», «abre o relatório», «compara com o original».\n\n' +
      '**Mudar-me**: «mete um chapéu de bruxa», «fica rosa», «dança».\n\n' +
      'Tudo corre aqui no teu computador e o original nunca é alterado.',
    'cumprimenta',
    { sugestoes: sugestoesDoContexto(c) },
  );
}

function saudar(c: ContextoAssistente): Resultado {
  const base = c.ficheiro ? (c.inventario ? `Olá! Estou a ver o **${c.ficheiro.nome}**. Queres que te resuma o que encontrei?` : `Olá! Estou a analisar o **${c.ficheiro.nome}**.`) : 'Olá! Larga aqui um PDF e eu digo-te o que a gráfica vai ver. Ou pergunta-me o que quiseres sobre arte final.';
  return resultado(base, 'cumprimenta', { sugestoes: sugestoesDoContexto(c) });
}

export const CerebroLocal: Cerebro = {
  responder(mensagem, c, memoria) {
    const norm = normalizar(mensagem);
    const ps = palavras(mensagem);
    if (!ps.length) return ajuda(c);

    // 1. resposta a uma proposta anterior
    if (memoria.pendente) {
      if (eSim(ps)) return resultado('Já trato disso.', 'trabalha', { acoes: memoria.pendente }, memoria);
      if (eNao(ps)) return resultado('Está bem, deixo como está. Diz-me se mudares de ideias.', 'repouso', { sugestoes: sugestoesDoContexto(c) });
    }

    // 2. conversa de circunstância
    if (ps.length <= 4 && (temExata(ps, ['ola', 'oi', 'hey', 'ei', 'viva', 'bom', 'boa']) || contemExpressao(norm, 'bom dia') || contemExpressao(norm, 'boa tarde') || contemExpressao(norm, 'boa noite'))) return saudar(c);
    if (tem(ps, ['obrigad', 'agradec', 'valeu', 'thanks', 'grato', 'grata'])) return resultado('De nada! Estou aqui para o que precisares.', 'feliz', { sugestoes: sugestoesDoContexto(c) });
    if (tem(ps, ['adeus', 'tchau', 'xau']) || contemExpressao(norm, 'ate logo') || contemExpressao(norm, 'ate amanha')) return resultado('Até já! Boas impressões.', 'cumprimenta');
    if (contemExpressao(norm, 'quem es') || contemExpressao(norm, 'quem es tu')) return ajuda(c);

    // 3. mudar a mascote
    const m = interpretarMascote(mensagem);
    if (m) return resultado(m.texto, m.expressao, { acoes: Object.keys(m.mudancas).length ? [{ tipo: 'mascote', mudancas: m.mudancas }] : [], sugestoes: [] });

    // 4. alertas: "explica o alerta 2", "o que significa o primeiro erro"
    const falaDeAlerta = tem(ps, ['alert', 'erro', 'avis', 'problem', 'nota']);
    if (c.alertas.length && falaDeAlerta && tem(ps, ['explic', 'significa', 'porque', 'porqu', 'quer dizer', 'que e']) && !tem(ps, ['rgb', 'cmyk', 'sangri', 'overprint'])) {
      const i = indiceDoAlerta(ps, c);
      if (i !== null) return explicarAlerta(i, c);
      if (tem(ps, ['este', 'esse', 'esta', 'essa'])) return explicarAlerta(0, c);
    }
    if (c.alertas.length && tem(ps, ['explic']) && temExata(ps, ['este', 'esse', 'isto', 'aquele']) && tem(ps, ['alert', 'erro'])) return explicarAlerta(0, c);

    // 5. explicações e perguntas sobre o assunto
    const t = melhorTopico(ps, norm);
    const pergunta = ePergunta(ps, norm) || (ps[0] === 'como' && ps[1] !== 'esta') || (ps[0] === 'posso' && !!t);
    if (pergunta && t) return explicar(t, c);

    // 6. correções ("corrige o RGB", "gera a sangria")
    if (eVerboDeAcao(ps)) {
      const alvos = alvosDeCorrecao(ps, norm);
      if (alvos === 'tudo' || alvos.length) return corrigir(alvos, c, mensagem);
    }

    // 7. navegação, painéis, relatório…
    const nav = navegar(ps, norm, c);
    if (nav) return nav;

    // 8. resumo do estado
    if (tem(ps, ['resum', 'estado', 'pronto', 'pronta', 'analise', 'verifica', 'lista']) || temExata(ps, ['quantos', 'quantas', 'quais']) || (tem(ps, ['problem', 'erro', 'avis']) && !t) || contemExpressao(norm, 'esta bem') || contemExpressao(norm, 'como esta') || contemExpressao(norm, 'o que tem') || contemExpressao(norm, 'tudo bem') || contemExpressao(norm, 'o que tenho') || contemExpressao(norm, 'o que falta') || contemExpressao(norm, 'esta mal') || contemExpressao(norm, 'o que esta mal') || contemExpressao(norm, 'o que encontraste') || contemExpressao(norm, 'o que ha')) {
      if (!tem(ps, ['o que verific']) && !contemExpressao(norm, 'o que verificas')) return resumir(c);
    }

    // 9. ajuda
    if (tem(ps, ['ajud', 'sabes', 'podes', 'consegues', 'comando', 'funcoes', 'funcionalidade']) || contemExpressao(norm, 'o que verificas') || contemExpressao(norm, 'o que fazes')) return ajuda(c);

    // 10. um tópico mencionado sem pergunta explícita ("sangria", "overprint?")
    if (t) return explicar(t, c);

    // 11. não percebi
    return resultado('Não percebi bem. Posso corrigir o ficheiro, explicar termos de arte final (sangria, overprint, RGB…), levar-te aos alertas ou mexer nas Definições. Experimenta uma destas:', 'pergunta', { sugestoes: sugestoesDoContexto(c) });
  },
};

export { topico };
