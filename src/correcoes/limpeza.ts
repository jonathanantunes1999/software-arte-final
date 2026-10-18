import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFStream } from 'pdf-lib';
import type { ConfigAlertas } from '../alertas/tipos';
import { prepararInspecao } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import type { PaginaIR } from '../analise/ir';
import { lerPaginas, NOME_FORM_SANGRIA, temSangriaGerada, type PaginaInfo } from '../analise/documento';
import { interpretarPagina, type Observacao } from '../analise/interpretador';
import { operacoes } from '../analise/lexer';
import { mmParaPt } from '../comum/unidades';
import { conteudoDeMarcas, NOME_COR_MARCAS, NOME_FORM_MARCAS, planearMarcas, type GeometriaPagina, type PedidoMarcas } from './marcas';
import { acrescentarAoConteudo, embrulharPagina, substituirConteudo, usosDosConteudos } from './pdf-util';

/**
 * "Limpar o ficheiro": tirar tudo o que está fora da sangria (barras de cor, marcas de registo, texto de página,
 * marcas de corte antigas...) e deixar só marcas de corte novas e limpas, como o Preflight do Acrobat.
 *
 * Faz-se em duas camadas, para não depender de uma só:
 *  1. **Retirar** os objetos que ficam inteiros fora da sangria, no conteúdo da própria página (caminhos, texto,
 *     imagens, Forms que só têm coisas lá fora). O que estiver fora e já não existe, por isso também não gera alertas
 *     (uma fonte não incorporada só usada no texto da margem deixa de contar, por exemplo).
 *  2. **Recortar** a página à sangria (BBox do Form onde a arte fica guardada), que apanha o resto: o que está dentro de
 *     Forms com arte misturada ou em padrões fica escondido, mesmo que não se tenha conseguido retirar.
 * Só mexe em páginas com TrimBox: sem ela não se sabe onde é o corte.
 */

export interface RemovidosDaPagina {
  caminhos: number;
  textos: number;
  imagens: number;
  formas: number;
}

export interface ResumoLimpeza {
  /** Páginas onde se retirou alguma coisa */
  paginas: number[];
  removidos: RemovidosDaPagina;
  /** Páginas sem TrimBox: não se sabe onde é o corte, ficaram como estavam */
  semTrimBox: number[];
}

export const removidosVazios = (): RemovidosDaPagina => ({ caminhos: 0, textos: 0, imagens: 0, formas: 0 });

/** A área a manter: o corte mais a sangria de cada lado (a maior entre a que o ficheiro já tem e a pedida) */
export function manterDaPagina(pg: Pick<PaginaInfo, 'trim' | 'producao' | 'origemSangria'>, unit: number, sangriaMm: number): Caixa {
  const { trim, producao } = pg;
  const s = mmParaPt(sangriaMm) / unit;
  const existente = pg.origemSangria === 'BleedBox';
  const lado = (ja: number) => Math.max(existente ? Math.max(0, ja) : 0, s);
  return {
    x0: trim.x0 - lado(trim.x0 - producao.x0),
    y0: trim.y0 - lado(trim.y0 - producao.y0),
    x1: trim.x1 + lado(producao.x1 - trim.x1),
    y1: trim.y1 + lado(producao.y1 - trim.y1),
  };
}

const unidadeDe = (pdf: PDFDocument, i: number) => pdf.getPages()[i].node.lookupMaybe(PDFName.of('UserUnit'), PDFNumber)?.asNumber() || 1;

const toca = (a: Caixa, b: Caixa) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
const alargar = (c: Caixa, d: number): Caixa => ({ x0: c.x0 - d, y0: c.y0 - d, x1: c.x1 + d, y1: c.y1 + d });

const paraBytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);

interface Troca {
  inicio: number;
  fim: number;
  texto: string;
}

interface Pintar {
  fluxo: string;
  inicio: number;
  fim: number;
  objeto: Extract<Observacao, { tipo: 'pintar' }>['objeto'];
  recurso?: string;
  oculto: boolean;
}

/** Operadores de um bloco de texto que se vão embora quando o bloco sai (os de estado, como Tf ou cor, ficam) */
const SAI_DO_BLOCO = new Set(['BT', 'ET', 'Td', 'TD', 'Tm', 'T*', 'Tj', 'TJ', "'", '"']);
const MOSTRAR = new Set(['Tj', 'TJ', "'", '"']);
const PINTAR_CAMINHO = new Set(['f', 'F', 'f*', 'S', 's', 'B', 'B*', 'b', 'b*']);

/**
 * Retira da página os objetos que ficam inteiros fora de `manter`. Só no conteúdo da própria página: as coisas que
 * estão dentro de Forms com arte misturada ficam para o recorte. Devolve o que se retirou.
 */
export function retirarForaDaSangria(pdf: PDFDocument, indice: number, manter: Caixa, usos: Map<string, number>, c = prepararInspecao(pdf)): RemovidosDaPagina {
  const removidos = removidosVazios();
  const no = c.nos[indice].node;
  const fluxos = new Map<string, { texto: string; recursos: PDFDict | undefined }>();
  const pinturas: Pintar[] = [];
  const mostrar = new Map<string, boolean>();
  const origem = new Map<string, number>();

  let ir: PaginaIR;
  try {
    ir = interpretarPagina(c.l, no, {
      indice,
      limites: c.info.paginas[indice].media,
      ocgOcultos: c.ocgPorOmissao,
      fontes: c.fontes,
      observador: {
        fluxo: (id, f) => {
          if (!fluxos.has(id)) fluxos.set(id, { texto: f.texto, recursos: f.recursos });
        },
        operador: (id, inicio, fim, o) => {
          if (o.tipo === 'pintar') pinturas.push({ fluxo: id, inicio, fim, objeto: o.objeto, recurso: o.recurso, oculto: o.oculto });
        },
        evento: (id, inicio, i) => origem.set(`${id}|${inicio}`, i),
        texto: (id, inicio) => mostrar.set(`${id}|${inicio}`, true),
      },
    });
  } catch {
    return removidos;
  }

  const zona = alargar(manter, 0.05);
  /** O objeto que começa em `inicio` ficou inteiro fora? (Sem evento: nada se via, não se mexe) */
  const foraDoEvento = (id: string, inicio: number): boolean | undefined => {
    const i = origem.get(`${id}|${inicio}`);
    return i === undefined ? undefined : !toca(ir.eventos[i].bbox, zona);
  };

  const pagina = fluxos.get('pagina');
  if (!pagina) return removidos;
  const texto = pagina.texto;
  const trocas: Troca[] = [];

  // quantos eventos cada Form tem dentro e fora (só os seus, não os dos Forms lá dentro)
  const dentroFora = new Map<string, { dentro: number; fora: number }>();
  for (const [chave, i] of origem) {
    const id = chave.slice(0, chave.lastIndexOf('|'));
    const q = dentroFora.get(id) ?? dentroFora.set(id, { dentro: 0, fora: 0 }).get(id)!;
    if (toca(ir.eventos[i].bbox, zona)) q.dentro++;
    else q.fora++;
  }
  const folha = (id: string) => {
    const f = fluxos.get(id);
    if (!f) return false;
    for (const op of operacoes(f.texto)) if (op.op === 'Do' || op.op === 'BI') return false;
    return true;
  };

  for (const p of pinturas) {
    if (p.fluxo !== 'pagina' || p.oculto) continue;
    const fora = foraDoEvento(p.fluxo, p.inicio);
    switch (p.objeto) {
      case 'caminho':
        if (fora === true && PINTAR_CAMINHO.has(texto.slice(p.inicio, p.fim).trim())) {
          trocas.push({ inicio: p.inicio, fim: p.fim, texto: 'n' });
          removidos.caminhos++;
        }
        break;
      case 'imagem':
      case 'imagem-inline':
        if (fora === true) {
          trocas.push({ inicio: p.inicio, fim: p.fim, texto: '' });
          removidos.imagens++;
        }
        break;
      case 'shading':
        if (fora === true) {
          trocas.push({ inicio: p.inicio, fim: p.fim, texto: '' });
          removidos.formas++;
        }
        break;
      case 'form': {
        // só se tudo o que o Form desenha está fora, e ele próprio não chama outros Forms
        const xo = pagina.recursos && c.l.dict(pagina.recursos.get(PDFName.of('XObject')));
        const ref = p.recurso && xo ? xo.get(PDFName.of(p.recurso)) : undefined;
        const id = ref instanceof PDFRef ? ref.tag : undefined;
        const q = id ? dentroFora.get(id) : undefined;
        if (id && q && q.dentro === 0 && q.fora > 0 && folha(id)) {
          trocas.push({ inicio: p.inicio, fim: p.fim, texto: '' });
          removidos.formas++;
        }
        break;
      }
      default:
        break;
    }
  }

  // texto: um bloco BT…ET só sai inteiro, se todo o texto que mostra está fora; os operadores de estado (fonte, cor…)
  // ficam, porque o que vem depois pode contar com eles
  let bloco: { inicio: number; mostra: { inicio: number }[]; resto: string[] } | null = null;
  for (const op of operacoes(texto)) {
    if (op.op === 'BT') bloco = { inicio: op.inicio, mostra: [], resto: [] };
    else if (op.op === 'ET' && bloco) {
      const b = bloco;
      bloco = null;
      if (!b.mostra.length) continue;
      const todosFora = b.mostra.every((m) => mostrar.has(`pagina|${m.inicio}`) && foraDoEvento('pagina', m.inicio) !== false);
      // um texto sem evento (cortado por completo, nada se via) conta como fora, desde que o interpretador o tenha visto
      if (!todosFora) continue;
      trocas.push({ inicio: b.inicio, fim: op.fim, texto: b.resto.join('\n') });
      removidos.textos += b.mostra.length;
    } else if (bloco) {
      if (MOSTRAR.has(op.op)) bloco.mostra.push({ inicio: op.inicio });
      if (!SAI_DO_BLOCO.has(op.op)) bloco.resto.push(texto.slice(op.inicio, op.fim));
    }
  }

  if (!trocas.length) return removidos;
  trocas.sort((a, b) => a.inicio - b.inicio || a.fim - b.fim);
  let saida = '';
  let pos = 0;
  for (const t of trocas) {
    if (t.inicio < pos) continue;
    saida += texto.slice(pos, t.inicio) + t.texto + (t.texto && !/\s$/.test(t.texto) ? ' ' : '');
    pos = t.fim;
  }
  saida += texto.slice(pos);
  substituirConteudo(pdf, no, paraBytes(saida), usos);
  return removidos;
}

/** Retira o que está fora da sangria em todas as páginas com TrimBox (as outras ficam em `semTrimBox`) */
export function retirarForaDaSangriaTodas(pdf: PDFDocument, sangriaMm: number): ResumoLimpeza {
  const info = lerPaginas(pdf);
  const c = prepararInspecao(pdf, info);
  const usos = usosDosConteudos(pdf);
  const resumo: ResumoLimpeza = { paginas: [], removidos: removidosVazios(), semTrimBox: [] };
  for (const pi of info.paginas) {
    if (pi.origemTrim !== 'TrimBox') {
      resumo.semTrimBox.push(pi.indice);
      continue;
    }
    const r = retirarForaDaSangria(pdf, pi.indice, manterDaPagina(pi, unidadeDe(pdf, pi.indice), sangriaMm), usos, c);
    const total = r.caminhos + r.textos + r.imagens + r.formas;
    if (total) resumo.paginas.push(pi.indice);
    resumo.removidos.caminhos += r.caminhos;
    resumo.removidos.textos += r.textos;
    resumo.removidos.imagens += r.imagens;
    resumo.removidos.formas += r.formas;
  }
  return resumo;
}

export interface ResumoRefeitas {
  /** Páginas onde se recortou à sangria e se refizeram as marcas */
  geradas: number[];
  comprimentoMm: number;
  afastamentoMm: number;
  /** Páginas sem TrimBox: ficaram como estavam */
  semTrimBox: number[];
}

/**
 * Deixa cada página só com a arte (até à sangria) e marcas de corte novas: recorta à sangria, desenha as oito marcas
 * e põe a página no tamanho certo, nem mais nem menos (MediaBox e CropBox = a área das marcas; TrimBox fica; BleedBox
 * passa a ser a sangria mantida). Corre depois de retirar o que está fora e, se também se pediu, de gerar sangria.
 */
export function refazerMarcas(pdf: PDFDocument, pedido: PedidoMarcas, sangriaMm: number, cfg: ConfigAlertas, usos: Map<string, number>): ResumoRefeitas {
  const resumo: ResumoRefeitas = { geradas: [], comprimentoMm: pedido.comprimentoMm, afastamentoMm: pedido.afastamentoMm, semTrimBox: [] };
  const info = lerPaginas(pdf);
  const ctx = pdf.context;
  const nos = pdf.getPages();
  const arr = (b: Caixa) => ctx.obj([b.x0, b.y0, b.x1, b.y1]);

  for (const pi of info.paginas) {
    if (pi.origemTrim !== 'TrimBox') {
      resumo.semTrimBox.push(pi.indice);
      continue;
    }
    const no = nos[pi.indice].node;
    const unit = unidadeDe(pdf, pi.indice);
    const manter = manterDaPagina(pi, unit, sangriaMm);
    // depois de limpa, o que se vê é a sangria; as marcas ficam fora dela
    const g: GeometriaPagina = { trim: pi.trim, media: manter, crop: manter, producao: manter, origemSangria: 'BleedBox' };
    const plano = planearMarcas(g, unit, { ...pedido, ampliar: true }, cfg);
    resumo.afastamentoMm = Math.max(resumo.afastamentoMm, plano.afastamentoMm);

    const marcas = conteudoDeMarcas(pi.trim, mmParaPt(plano.afastamentoMm) / unit, mmParaPt(plano.comprimentoMm) / unit, cfg.marcasCorteCor);
    let res: PDFDict;
    if (temSangriaGerada(no)) {
      // a página da sangria automática já é só um Form (a arte) desenhado várias vezes: recorta-se esse Form à sangria
      // e as marcas juntam-se ao fim, para a página continuar a ser reconhecida como de sangria gerada
      const xo = ctx.lookup(no.Resources()?.get(PDFName.of('XObject')));
      const form = xo instanceof PDFDict ? ctx.lookup(xo.get(PDFName.of(NOME_FORM_SANGRIA))) : undefined;
      if (form instanceof PDFStream) form.dict.set(PDFName.of('BBox'), arr(manter));
      res = acrescentarAoConteudo(pdf, no, marcas, usos);
    } else {
      res = embrulharPagina(pdf, no, manter, NOME_FORM_MARCAS, (nome) => `/${nome} Do\n${marcas}`, usos);
    }
    if (cfg.marcasCorteCor !== 'preto') {
      const funcao = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [1, 1, 1, 1], N: 1 }));
      const cs = ctx.obj({}) as PDFDict;
      cs.set(PDFName.of(NOME_COR_MARCAS), ctx.obj(['Separation', 'All', 'DeviceCMYK', funcao] as never));
      res.set(PDFName.of('ColorSpace'), cs);
    }
    no.set(PDFName.of('MediaBox'), arr(plano.visivelDepois));
    no.set(PDFName.of('CropBox'), arr(plano.visivelDepois));
    no.set(PDFName.of('TrimBox'), arr(pi.trim));
    no.set(PDFName.of('BleedBox'), arr(manter));
    resumo.geradas.push(pi.indice);
  }
  return resumo;
}
