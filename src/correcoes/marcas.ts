import { PDFDict, PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import { alertasMarcasCorte } from '../alertas/marcas-corte';
import type { ConfigAlertas } from '../alertas/tipos';
import { analisarDocumento } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import { lerPaginas, temSangriaGerada, type PaginaInfo } from '../analise/documento';
import { mmParaPt, ptParaMm } from '../comum/unidades';
import { acrescentarAoConteudo, embrulharPagina } from './pdf-util';

/**
 * Marcas de corte para um ficheiro que não as tem: oito traços finos (dois por canto, um horizontal e
 * um vertical), alinhados com o corte, do lado de fora e afastados dele. A cor é a que as Definições
 * esperam: registo (a tinta "All", que sai em todas as chapas) ou só preto (K 100%, para digital).
 *
 * Se a página não tem margem para elas, pode crescer (MediaBox e CropBox): a TrimBox fica fixada
 * no que era, por isso a medida final não muda. A arte original não é tocada.
 */

export interface PedidoMarcas {
  /** Comprimento de cada marca, em mm */
  comprimentoMm: number;
  /** Distância da ponta mais próxima ao corte, em mm. Nunca menos do que a sangria. */
  afastamentoMm: number;
  /** Aumenta a página onde não há margem para as marcas (senão encurta-as, ou deixa a página como está) */
  ampliar: boolean;
}

export interface ResumoMarcas {
  comprimentoMm: number;
  afastamentoMm: number;
  /** Páginas onde se desenharam marcas (0 = primeira) */
  geradas: number[];
  /** Destas, as que cresceram para terem espaço */
  ampliadas: number[];
  /** As que ficaram com marcas mais curtas do que o pedido, para caberem */
  encurtadas: number[];
  /** Páginas onde não havia espaço e não se mexeu */
  semEspaco: number[];
  /** O afastamento pedido era menor do que a sangria: subiu-se até lá */
  afastamentoSubido: boolean;
}

/** Nome do Form em que a página original fica guardada */
export const NOME_FORM_MARCAS = 'ArtPagina';
/** Nome do espaço de cor de registo nos recursos da página */
export const NOME_COR_MARCAS = 'ArtRegisto';

/** Espessura de uma marca: 0,25 pt, a de qualquer cortante */
const ESPESSURA_PT = 0.25;
/** Folga extra à volta das marcas ao ampliar a página */
const FOLGA_MM = 0.5;
/** Mais curtas que isto já não se leem como marcas */
const COMPRIMENTO_MINIMO_MM = 3;
/** Folga para erros de arredondamento ao comparar milímetros */
const TOLERANCIA_MM = 0.02;

const f = (n: number) => String(Math.round(n * 1000) / 1000);

/** Páginas onde os alertas dizem que faltam marcas de corte (todas, ou sem espaço para elas) */
export function paginasSemMarcas(pdf: PDFDocument, cfg: ConfigAlertas): number[] {
  const analise = analisarDocumento(pdf, lerPaginas(pdf));
  const r = new Set<number>();
  for (const a of alertasMarcasCorte(analise, { ...cfg, verificarMarcasCorte: true })) {
    if (a.id !== 'marcas-corte-ausentes' && a.id !== 'marcas-corte-sem-espaco') continue;
    for (const l of a.locais ?? []) r.add(l.pagina);
  }
  return [...r].sort((a, b) => a - b);
}

/** As oito marcas como segmentos `[x0, y0, x1, y1]`, em unidades de utilizador da página */
export function linhasDeMarcas(trim: Caixa, afastamento: number, comprimento: number): [number, number, number, number][] {
  const linhas: [number, number, number, number][] = [];
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      const x = sx === -1 ? trim.x0 : trim.x1;
      const y = sy === -1 ? trim.y0 : trim.y1;
      linhas.push([x + sx * afastamento, y, x + sx * (afastamento + comprimento), y]);
      linhas.push([x, y + sy * afastamento, x, y + sy * (afastamento + comprimento)]);
    }
  }
  return linhas;
}

/** O desenho das oito marcas, em unidades de utilizador da página */
export function conteudoDeMarcas(trim: Caixa, afastamento: number, comprimento: number, cor: ConfigAlertas['marcasCorteCor']): string {
  const linhas = linhasDeMarcas(trim, afastamento, comprimento).map(([x0, y0, x1, y1]) => `${f(x0)} ${f(y0)} m ${f(x1)} ${f(y1)} l S`);
  const tinta = cor === 'preto' ? '0 0 0 1 K' : `/${NOME_COR_MARCAS} CS 1 SCN`;
  return `q ${ESPESSURA_PT} w 0 J 0 j [] 0 d ${tinta}\n${linhas.join('\n')}\nQ`;
}

const uniao = (a: Caixa, b: Caixa): Caixa => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const interseccao = (a: Caixa, b: Caixa): Caixa | null => {
  const c = { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
  return c.x0 < c.x1 && c.y0 < c.y1 ? c : null;
};

/** O que o plano precisa de saber da página (em pt, espaço de utilizador) */
export type GeometriaPagina = Pick<PaginaInfo, 'trim' | 'media' | 'crop' | 'producao' | 'origemSangria'>;

export interface PlanoMarcas {
  /** Não há margem e a página não podia crescer (nem encurtando as marcas): não se faz nada */
  semEspaco: boolean;
  comprimentoMm: number;
  afastamentoMm: number;
  encurtada: boolean;
  ampliada: boolean;
  /** O afastamento pedido era menor do que a sangria */
  afastamentoSubido: boolean;
  /** As oito marcas, em pt de utilizador */
  linhas: [number, number, number, number][];
  /** A área que as marcas ocupam (corte + afastamento + comprimento + folga) */
  alvo: Caixa;
  /** Área visível da página antes de criar as marcas */
  visivelAntes: Caixa;
  /** Área visível depois (igual à de antes, ou maior se a página cresce) */
  visivelDepois: Caixa;
}

/**
 * Decide o que se faz numa página: a que distância ficam as marcas, de que tamanho, e se a página cresce.
 * É a única fonte desta lógica: a correção e o preview usam-na, por isso mostram exatamente o mesmo.
 * `unit` é o UserUnit da página (1 na quase totalidade dos ficheiros).
 */
export function planearMarcas(pg: GeometriaPagina, unit: number, pedido: PedidoMarcas, cfg: ConfigAlertas): PlanoMarcas {
  const pt = (mm: number) => mmParaPt(mm) / unit;
  const mm = (v: number) => ptParaMm(v * unit);
  const { trim } = pg;

  // as marcas têm de ficar fora da sangria: a maior margem de produção que o ficheiro já tem manda
  const prod = pg.producao;
  const daBleedBox = pg.origemSangria === 'BleedBox' ? mm(Math.max(trim.x0 - prod.x0, prod.x1 - trim.x1, trim.y0 - prod.y0, prod.y1 - trim.y1)) : 0;
  const sangria = Math.max(cfg.sangriaReferenciaMm, daBleedBox);
  const afastamento = Math.max(pedido.afastamentoMm, sangria);

  // o que se vê: a CropBox dentro da MediaBox
  const visivel = interseccao(pg.crop, pg.media) ?? pg.media;
  const margem = Math.min(mm(trim.x0 - visivel.x0), mm(visivel.x1 - trim.x1), mm(trim.y0 - visivel.y0), mm(visivel.y1 - trim.y1));
  const precisa = (comp: number) => afastamento + comp + FOLGA_MM;

  let comprimento = pedido.comprimentoMm;
  let ampliada = false;
  let encurtada = false;
  let semEspaco = false;
  if (margem + TOLERANCIA_MM < precisa(comprimento)) {
    if (pedido.ampliar) ampliada = true;
    else {
      const cabe = margem - afastamento - FOLGA_MM;
      if (cabe < COMPRIMENTO_MINIMO_MM) semEspaco = true;
      else {
        comprimento = Math.floor(cabe * 2) / 2;
        encurtada = true;
      }
    }
  }

  const a = pt(afastamento);
  const c = pt(comprimento);
  const m = pt(precisa(comprimento));
  const alvo: Caixa = { x0: trim.x0 - m, y0: trim.y0 - m, x1: trim.x1 + m, y1: trim.y1 + m };
  return {
    semEspaco,
    comprimentoMm: comprimento,
    afastamentoMm: afastamento,
    encurtada,
    ampliada,
    afastamentoSubido: afastamento > pedido.afastamentoMm + 1e-9,
    linhas: semEspaco ? [] : linhasDeMarcas(trim, a, c),
    alvo,
    visivelAntes: visivel,
    visivelDepois: ampliada ? uniao(visivel, alvo) : visivel,
  };
}

export function gerarMarcas(pdf: PDFDocument, pedido: PedidoMarcas, paginas: number[], cfg: ConfigAlertas, usos: Map<string, number>): ResumoMarcas {
  const resumo: ResumoMarcas = { comprimentoMm: pedido.comprimentoMm, afastamentoMm: pedido.afastamentoMm, geradas: [], ampliadas: [], encurtadas: [], semEspaco: [], afastamentoSubido: false };
  const info = lerPaginas(pdf);
  const ctx = pdf.context;
  const nos = pdf.getPages();

  for (const i of paginas) {
    const pi = info.paginas[i];
    const no = nos[i].node;
    if (!pi) continue;
    const unit = no.lookupMaybe(PDFName.of('UserUnit'), PDFNumber)?.asNumber() || 1;
    const plano = planearMarcas(pi, unit, pedido, cfg);
    if (plano.afastamentoSubido) resumo.afastamentoSubido = true;
    resumo.afastamentoMm = Math.max(resumo.afastamentoMm, plano.afastamentoMm);
    if (plano.semEspaco) {
      resumo.semEspaco.push(i);
      continue;
    }
    if (plano.encurtada) resumo.encurtadas.push(i);

    // o texto antigo passa a Form; as marcas desenham-se por cima, na própria página. As páginas da sangria
    // automática já são só um Form e o que o desenha: aí as marcas juntam-se ao fim (e a página continua a ser reconhecida como tal)
    const marcasTexto = conteudoDeMarcas(pi.trim, mmParaPt(plano.afastamentoMm) / unit, mmParaPt(plano.comprimentoMm) / unit, cfg.marcasCorteCor);
    const res = temSangriaGerada(no)
      ? acrescentarAoConteudo(pdf, no, marcasTexto, usos)
      : embrulharPagina(pdf, no, pi.crop, NOME_FORM_MARCAS, (nome) => `/${nome} Do\n${marcasTexto}`, usos);
    if (cfg.marcasCorteCor !== 'preto') {
      const funcao = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [1, 1, 1, 1], N: 1 }));
      const cs = ctx.obj({}) as PDFDict;
      cs.set(PDFName.of(NOME_COR_MARCAS), ctx.obj(['Separation', 'All', 'DeviceCMYK', funcao] as never));
      res.set(PDFName.of('ColorSpace'), cs);
    }

    if (plano.ampliada) {
      const arr = (b: Caixa) => ctx.obj([b.x0, b.y0, b.x1, b.y1]);
      no.set(PDFName.of('MediaBox'), arr(uniao(pi.media, plano.alvo)));
      no.set(PDFName.of('CropBox'), arr(uniao(pi.crop, plano.alvo)));
      // a medida final não pode mudar: sem TrimBox, a página inteira era o corte
      no.set(PDFName.of('TrimBox'), arr(pi.trim));
      resumo.ampliadas.push(i);
    }
    resumo.geradas.push(i);
  }
  return resumo;
}
