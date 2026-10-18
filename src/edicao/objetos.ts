import type { PDFDocument } from 'pdf-lib';
import { prepararInspecao, type ContextoInspecao } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import { interpretarPagina } from '../analise/interpretador';
import type { EventoDesenho } from '../analise/ir';
import { operacoes } from '../analise/lexer';
import { substituirConteudo, usosDosConteudos } from '../correcoes/pdf-util';
import { ehIdentidade, matrizLocal, numero, produto, soDesloca, IDENTIDADE, type Matriz } from './matriz';
import type { Cmyk, Edicao, ObjetoEditavel, ResumoEdicao } from './tipos';
import { resumoEdicaoVazio } from './tipos';

/**
 * Edição de objetos: que objetos há numa página, e aplicar apagar / mover / mudar o tamanho / mudar a cor sobre o conteúdo.
 * Só se edita o que está no conteúdo da própria página: cada forma, bloco de texto, imagem e degradé é um objeto; um Form
 * inteiro (um grupo) conta como um objeto só, sem se poder mexer no que tem lá dentro.
 *
 * O conteúdo reescreve-se por texto, como as outras correções: o objeto fica entre `q <cm> …` e `Q`, ou o operador que o
 * pinta passa a `n` (apagar). A arte que não se toca fica byte a byte como estava.
 */

interface Unidade {
  tipo: ObjetoEditavel['tipo'];
  /** O segmento do conteúdo que forma o objeto: de onde começa o caminho (ou o BT) até ao fim */
  inicio: number;
  fim: number;
  /** Formas: o operador que pinta (apagar põe aqui um `n`, para não se perder um recorte `W`) */
  pintInicio: number;
  pintFim: number;
  ctm: Matriz;
  eventos: number[];
  /** Texto: onde começa cada operador que mostra texto (a cor muda-se aí, porque o bloco pode ter a sua) */
  mostras: number[];
}

export interface PlanoObjeto {
  id: number;
  tipo: ObjetoEditavel['tipo'];
  inicio: number;
  fim: number;
  pintInicio: number;
  pintFim: number;
  ctm: Matriz;
  mostras: number[];
}

export interface PaginaEditavel {
  objetos: ObjetoEditavel[];
  planos: PlanoObjeto[];
  /** O conteúdo da página (todos os streams, juntos), que é o que os planos medem */
  texto: string;
}

const MOSTRAR = new Set(['Tj', 'TJ', "'", '"']);

const uniao = (caixas: Caixa[]): Caixa => ({
  x0: Math.min(...caixas.map((c) => c.x0)),
  y0: Math.min(...caixas.map((c) => c.y0)),
  x1: Math.max(...caixas.map((c) => c.x1)),
  y1: Math.max(...caixas.map((c) => c.y1)),
});

/** Interpreta a página e diz que objetos tem e onde está cada um no conteúdo. Sempre com as layers como o ficheiro as traz. */
export function planearObjetos(c: ContextoInspecao, indice: number): PaginaEditavel | null {
  const no = c.nos[indice]?.node;
  if (!no) return null;

  const fluxos = new Map<string, string>();
  const pintados: { inicio: number; fim: number; objeto: string; ctm: Matriz; inicioCaminho?: number; oculto: boolean }[] = [];
  const origem = new Map<string, number>();
  const grupos = new Map<number, number[]>();
  let formAtual: number | null = null;
  let ir;
  try {
    ir = interpretarPagina(c.l, no, {
      indice,
      limites: c.info.paginas[indice].media,
      ocgOcultos: c.ocgPorOmissao,
      fontes: c.fontes,
      geometria: true,
      observador: {
        fluxo: (id, f) => {
          if (!fluxos.has(id)) fluxos.set(id, f.texto);
        },
        operador: (id, inicio, fim, o) => {
          if (o.tipo !== 'pintar' || id !== 'pagina') return;
          pintados.push({ inicio, fim, objeto: o.objeto, ctm: o.ctm, inicioCaminho: o.inicioCaminho, oculto: o.oculto });
          // o que um Form desenha vem a seguir, nos fluxos dele: é do grupo até ao próximo objeto da página
          formAtual = o.objeto === 'form' ? inicio : null;
        },
        evento: (id, inicio, i) => {
          origem.set(`${id}|${inicio}`, i);
          if (id !== 'pagina' && formAtual !== null) (grupos.get(formAtual) ?? grupos.set(formAtual, []).get(formAtual)!).push(i);
        },
      },
    });
  } catch {
    return null;
  }
  const texto = fluxos.get('pagina');
  if (texto === undefined) return { objetos: [], planos: [], texto: '' };

  const unidades: Unidade[] = [];
  const porInicio = new Map(pintados.map((p) => [p.inicio, p]));
  for (const p of pintados) {
    if (p.oculto) continue;
    const base = { inicio: p.inicioCaminho ?? p.inicio, fim: p.fim, pintInicio: p.inicio, pintFim: p.fim, ctm: p.ctm, mostras: [] as number[] };
    if (p.objeto === 'caminho') {
      const i = origem.get(`pagina|${p.inicio}`);
      if (i !== undefined) unidades.push({ ...base, tipo: 'forma', eventos: [i] });
    } else if (p.objeto === 'imagem' || p.objeto === 'imagem-inline') {
      const i = origem.get(`pagina|${p.inicio}`);
      if (i !== undefined) unidades.push({ ...base, inicio: p.inicio, tipo: 'imagem', eventos: [i] });
    } else if (p.objeto === 'shading') {
      const i = origem.get(`pagina|${p.inicio}`);
      if (i !== undefined) unidades.push({ ...base, inicio: p.inicio, tipo: 'degrade', eventos: [i] });
    } else if (p.objeto === 'form') {
      const evs = grupos.get(p.inicio);
      if (evs?.length) unidades.push({ ...base, inicio: p.inicio, tipo: 'grupo', eventos: evs });
    }
  }

  // o texto: cada bloco BT…ET é um objeto
  let bloco: { inicio: number; mostras: number[] } | null = null;
  for (const op of operacoes(texto)) {
    if (op.op === 'BT') bloco = { inicio: op.inicio, mostras: [] };
    else if (op.op === 'ET' && bloco) {
      const b = bloco;
      bloco = null;
      const vistas = b.mostras.filter((m) => origem.has(`pagina|${m}`) && !porInicio.get(m)?.oculto);
      if (!vistas.length) continue;
      const ctm = porInicio.get(vistas[0])?.ctm ?? IDENTIDADE;
      unidades.push({ tipo: 'texto', inicio: b.inicio, fim: op.fim, pintInicio: b.inicio, pintFim: op.fim, ctm, eventos: vistas.map((m) => origem.get(`pagina|${m}`)!), mostras: vistas });
    } else if (bloco && MOSTRAR.has(op.op)) bloco.mostras.push(op.inicio);
  }

  unidades.sort((a, b) => a.inicio - b.inicio);
  const objetos: ObjetoEditavel[] = [];
  const planos: PlanoObjeto[] = [];
  unidades.forEach((u, id) => {
    const evs: EventoDesenho[] = u.eventos.map((i) => ir.eventos[i]);
    const primeiro = evs[0];
    objetos.push({
      id,
      tipo: u.tipo,
      bbox: uniao(evs.map((e) => e.bbox)),
      preenche: evs.some((e) => e.preenche),
      traca: evs.some((e) => e.traca),
      cor: primeiro.cor,
      corTraco: primeiro.corTraco,
      espessuraTraco: primeiro.espessuraTraco,
      geometria: u.tipo === 'forma' ? primeiro.geometria : undefined,
      segmentos: u.tipo === 'forma' ? primeiro.segmentos : undefined,
    });
    planos.push({ id, tipo: u.tipo, inicio: u.inicio, fim: u.fim, pintInicio: u.pintInicio, pintFim: u.pintFim, ctm: u.ctm, mostras: u.mostras });
  });
  return { objetos, planos, texto };
}

/** Os objetos editáveis de uma página (para a interface) */
export function listarObjetos(c: ContextoInspecao, indice: number): ObjetoEditavel[] {
  return planearObjetos(c, indice)?.objetos ?? [];
}

interface Estado {
  apagar: boolean;
  matriz: Matriz;
  preenchimento?: Cmyk;
  traco?: Cmyk;
}

/** Junta as edições de um objeto numa só, pela ordem em que se fizeram: apagar manda, as matrizes compõem-se, a última cor ganha */
function juntarEdicoes(edicoes: Edicao[]): Map<number, Map<number, Estado>> {
  const r = new Map<number, Map<number, Estado>>();
  for (const e of edicoes) {
    const pagina = r.get(e.pagina) ?? r.set(e.pagina, new Map()).get(e.pagina)!;
    const s = pagina.get(e.objeto) ?? pagina.set(e.objeto, { apagar: false, matriz: IDENTIDADE }).get(e.objeto)!;
    if (e.tipo === 'apagar') s.apagar = true;
    else if (e.tipo === 'transformar') s.matriz = produto(s.matriz, e.matriz);
    else {
      if (e.preenchimento) s.preenchimento = e.preenchimento;
      if (e.traco) s.traco = e.traco;
    }
  }
  return r;
}

const op = (c: Cmyk, estrela: 'k' | 'K') => `${c.map((v) => numero(Math.min(1, Math.max(0, v)))).join(' ')} ${estrela}`;

interface Troca {
  inicio: number;
  fim: number;
  texto: string;
  /** Inserções no mesmo sítio: o que fecha (0) vem antes do que abre (1) */
  ordem: number;
}

/**
 * Aplica as edições ao PDF (uma cópia que se carregou do original). Cada edição diz a página e o id do objeto, tal como
 * `listarObjetos` os dá. Devolve o que se fez, para o resumo.
 */
export function aplicarEdicoes(pdf: PDFDocument, edicoes: Edicao[]): ResumoEdicao {
  const resumo = resumoEdicaoVazio();
  if (!edicoes.length) return resumo;
  const c = prepararInspecao(pdf);
  const usos = usosDosConteudos(pdf);

  for (const [indice, porObjeto] of juntarEdicoes(edicoes)) {
    const pg = planearObjetos(c, indice);
    if (!pg) {
      resumo.ignoradas += porObjeto.size;
      continue;
    }
    const trocas: Troca[] = [];
    let mexeu = false;
    for (const [id, st] of porObjeto) {
      const p = pg.planos[id];
      if (!p) {
        resumo.ignoradas++;
        continue;
      }
      if (st.apagar) {
        // forma: o caminho fica e a pintura passa a `n` (um recorte `W` antes dela continua a valer)
        if (p.tipo === 'forma') trocas.push({ inicio: p.pintInicio, fim: p.pintFim, texto: 'n', ordem: 1 });
        else trocas.push({ inicio: p.inicio, fim: p.fim, texto: '', ordem: 1 });
        resumo.apagados++;
        mexeu = true;
        continue;
      }
      let prefixo = '';
      const local = ehIdentidade(st.matriz) ? null : matrizLocal(p.ctm, st.matriz);
      if (local) {
        prefixo += `${local.map(numero).join(' ')} cm `;
        if (soDesloca(st.matriz, 1e-6)) resumo.movidos++;
        else resumo.redimensionados++;
      }
      const pre = p.tipo === 'texto' ? undefined : st.preenchimento;
      const tra = p.tipo === 'texto' || p.tipo === 'imagem' || p.tipo === 'grupo' ? undefined : st.traco;
      const podeCor = p.tipo === 'forma' || p.tipo === 'texto';
      let envolver = false;
      if (podeCor && (pre || tra || (p.tipo === 'texto' && st.preenchimento))) {
        envolver = true;
        resumo.recoloridos++;
        if (pre) prefixo += `${op(pre, 'k')} `;
        if (tra) prefixo += `${op(tra, 'K')} `;
        // o texto pode trazer a sua cor dentro do bloco: põe-se a nova imediatamente antes de cada mostrar
        if (p.tipo === 'texto' && st.preenchimento) for (const m of p.mostras) trocas.push({ inicio: m, fim: m, texto: `${op(st.preenchimento, 'k')} `, ordem: 1 });
      }
      if (!prefixo && !envolver) continue;
      trocas.push({ inicio: p.inicio, fim: p.inicio, texto: `q ${prefixo}`, ordem: 1 });
      trocas.push({ inicio: p.fim, fim: p.fim, texto: ' Q', ordem: 0 });
      mexeu = true;
    }
    if (!mexeu && !trocas.length) continue;
    trocas.sort((a, b) => a.inicio - b.inicio || a.fim - b.fim || a.ordem - b.ordem);
    let saida = '';
    let pos = 0;
    for (const t of trocas) {
      if (t.inicio < pos) continue;
      saida += pg.texto.slice(pos, t.inicio) + t.texto;
      pos = t.fim;
    }
    saida += pg.texto.slice(pos);
    substituirConteudo(pdf, c.nos[indice].node, Uint8Array.from(saida, (ch) => ch.charCodeAt(0) & 255), usos);
    if (!resumo.paginas.includes(indice)) resumo.paginas.push(indice);
  }
  return resumo;
}
