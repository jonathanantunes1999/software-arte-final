import { PDFDict, PDFName, PDFRef, type PDFStream } from 'pdf-lib';
import type { Caixa } from './caixas';
import {
  ESPACO_CMYK,
  ESPACO_GRAY,
  ESPACO_RGB,
  corDe,
  corInicial,
  resolverEspaco,
  type EspacoCor,
} from './cores';
import { lerFonte, type Fonte } from './fontes';
import type { CamadaInfo, Cor, EventoDesenho, Geometria, InfoImagem, PaginaIR } from './ir';
import { nomeDe, numeroDe, operacoes, textoDe, type Operando } from './lexer';
import type { Leitor } from './leitor';

type Mat = [number, number, number, number, number, number];
const IDENT: Mat = [1, 0, 0, 1, 0, 0];

/** a depois b (convenção de linha do PDF: x' = a·x + c·y + e) */
function mult(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

function aplicar(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Escala linear média de uma matriz */
function escala(m: Mat): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

function matDe(v: number[]): Mat {
  return v.length >= 6 && v.every(Number.isFinite) ? (v.slice(0, 6) as Mat) : IDENT;
}

/** Área de recorte vazia: nada do que se pinte a seguir é visível */
const CLIP_VAZIO: Caixa = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

function intersetar(a: Caixa, b: Caixa): Caixa | null {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  // Linhas retas têm largura ou altura zero e contam como visíveis
  return x0 <= x1 && y0 <= y1 ? { x0, y0, x1, y1 } : null;
}

/** Extremos de uma curva de Bézier cúbica num eixo */
function extremosBezier(p0: number, p1: number, p2: number, p3: number): [number, number] {
  let min = Math.min(p0, p3);
  let max = Math.max(p0, p3);
  // derivada: 3[(p1-p0)(1-t)^2 + 2(p2-p1)(1-t)t + (p3-p2)t^2] -> a t^2 + b t + c
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const ts: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const r = Math.sqrt(disc);
      ts.push((-b + r) / (2 * a), (-b - r) / (2 * a));
    }
  }
  for (const t of ts) {
    if (t > 0 && t < 1) {
      const u = 1 - t;
      const v = u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return [min, max];
}

/** Subcaminho fechado: área com sinal (positiva se anti-horário) e caixa */
interface Contorno {
  area: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Acima disto não se descontam buracos um a um (custa n²): soma-se a área com sinal */
const MAX_CONTORNOS_PARA_BURACOS = 200;

/**
 * Área preenchida por um caminho. Os subcaminhos contidos noutros (pela caixa) são buracos
 * ou ilhas conforme a regra: par-ímpar (f*) alterna a cada nível; a regra do enrolamento (f)
 * só faz buraco quando o contorno interior tem sentido contrário ao exterior.
 */
export function areaDoPreenchimento(cs: Contorno[], parImpar: boolean): number {
  const validos = cs.filter((c) => Math.abs(c.area) > 1e-9);
  if (!validos.length) return 0;
  if (validos.length > MAX_CONTORNOS_PARA_BURACOS) return Math.abs(validos.reduce((s, c) => s + c.area, 0));

  const ordem = [...validos].sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const folga = 1e-6;
  const dentro = (a: Contorno, b: Contorno) =>
    a.x0 >= b.x0 - folga && a.y0 >= b.y0 - folga && a.x1 <= b.x1 + folga && a.y1 <= b.y1 + folga;

  const enrolamento: number[] = [];
  const profundidade: number[] = [];
  const preenchido: boolean[] = [];
  let total = 0;

  for (let i = 0; i < ordem.length; i++) {
    // o pai é o menor contorno já processado que contém este
    let pai = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (dentro(ordem[i], ordem[j])) {
        pai = j;
        break; // ordenado por área decrescente: o primeiro que encontramos de trás para a frente é o menor
      }
    }
    const sinal = ordem[i].area > 0 ? 1 : -1;
    enrolamento[i] = sinal + (pai >= 0 ? enrolamento[pai] : 0);
    profundidade[i] = pai >= 0 ? profundidade[pai] + 1 : 0;
    preenchido[i] = parImpar ? (profundidade[i] + 1) % 2 === 1 : enrolamento[i] !== 0;
    const fora = pai >= 0 && preenchido[pai];
    total += Math.abs(ordem[i].area) * ((preenchido[i] ? 1 : 0) - (fora ? 1 : 0));
  }
  return Math.max(0, total);
}

/** A cor que representa "uma imagem deste espaço" (para saber que tintas toca): tudo o que o espaço pode pintar, a 100% */
export function corDaImagem(e: EspacoCor): Cor {
  switch (e.familia) {
    case 'Gray':
      return { familia: 'Gray', valores: [0] };
    case 'CMYK':
      return { familia: 'CMYK', valores: [1, 1, 1, 1] };
    case 'RGB':
      return { familia: 'RGB', valores: [0, 0, 0] };
    case 'Separation':
    case 'DeviceN':
      return { familia: e.familia, valores: (e.nomes ?? ['']).map(() => 1), nomes: e.nomes, amostra: e.amostra };
    default:
      return { familia: 'Desconhecido', valores: [] };
  }
}

function geometriaDe(geo: { pts: number[]; fechado: boolean }[], parImpar: boolean): Geometria | undefined {
  if (!geo.length) return undefined;
  return { contornos: geo.map((g) => Float32Array.from(g.pts)), fechados: geo.map((g) => g.fechado), parImpar };
}

/** O que o interpretador viu num operador, para quem quiser reescrever o conteúdo (separação em placas) */
export type Observacao =
  | {
      tipo: 'cor';
      alvo: 'fill' | 'traco';
      cor: Cor;
      /** Nome do padrão (/P1 scn), quando a cor é um Pattern */
      padrao?: string;
    }
  | {
      tipo: 'pintar';
      objeto: 'caminho' | 'texto' | 'imagem' | 'imagem-inline' | 'shading' | 'form';
      preenche: boolean;
      traca: boolean;
      cor?: Cor;
      corTraco?: Cor;
      overprintFill: boolean;
      overprintTraco: boolean;
      modo: 0 | 1;
      /** Opacidade de preenchimento (ca) e de traço (CA) em vigor */
      ca: number;
      CA: number;
      /** Está numa layer desligada */
      oculto: boolean;
      /** Nome do recurso (XObject ou shading) */
      recurso?: string;
      /** Imagem-máscara: pinta com a cor de preenchimento */
      mascara?: boolean;
      /** Caminhos: onde começou a construção do caminho (antes dele é que se podem pôr operadores gráficos) */
      inicioCaminho?: number;
    };

export interface Observador {
  /** Um content stream (a página ou um Form) vai ser interpretado; só chama uma vez por stream */
  fluxo(id: string, f: { texto: string; recursos: PDFDict | undefined; stream?: PDFStream }): void;
  /** `inicio`..`fim` é a operação inteira, com os operandos, em `texto` do fluxo */
  operador(fluxo: string, inicio: number, fim: number, o: Observacao): void;
  /** O operador que começa em `inicio` deu origem ao evento número `indice` da IR da página */
  evento?(fluxo: string, inicio: number, indice: number): void;
  /** Um operador de mostrar texto, com a posição de cada glifo */
  texto?(fluxo: string, inicio: number, fim: number, d: DadosTexto): void;
}

/** Texto mostrado por um operador (Tj, TJ, ' ou "), glifo a glifo */
export interface DadosTexto {
  /** Operador: Tj, TJ, ' (aspa simples) ou " */
  op: string;
  /** Só no operador ": espaço entre palavras e entre letras */
  tw?: number;
  tc?: number;
  fonte: { id: string; dict: PDFDict; composta: boolean; type3: boolean };
  /** Corpo, escala horizontal (1 = 100%), elevação, modo de renderização */
  tamanho: number;
  th: number;
  rise: number;
  modo: number;
  /** Matriz do texto no início do operador (a de depois de T*, no ' e no ") */
  tm: [number, number, number, number, number, number];
  /** Código de cada glifo e o deslocamento do seu início, no espaço do texto */
  glifos: { codigo: number; x: number }[];
  oculto: boolean;
}

interface EstadoGrafico {
  ctm: Mat;
  cor: Cor;
  corTraco: Cor;
  espaco: EspacoCor;
  espacoTraco: EspacoCor;
  espessura: number;
  overprintFill: boolean;
  overprintTraco: boolean;
  modoOverprint: 0 | 1;
  /** Opacidades (ca, CA) */
  ca: number;
  CA: number;
  clip: Caixa;
  // texto
  fonte?: Fonte;
  tamanho: number;
  tc: number;
  tw: number;
  th: number;
  tl: number;
  rise: number;
  tr: number;
}

export interface OpcoesInterpretador {
  indice: number;
  /** Área de desenho do dispositivo (MediaBox): o clip inicial */
  limites: Caixa;
  /** Etiquetas (PDFRef.tag) das layers desligadas por omissão */
  ocgOcultos: Set<string>;
  /** Cache de fontes do documento, partilhada entre páginas */
  fontes: Map<string, Fonte>;
  /** Guarda os contornos das formas em cada evento (para o leitor de cor); custa memória */
  geometria?: boolean;
  /** Recebe cada operador de cor e de pintura, com a sua posição no content stream */
  observador?: Observador;
}

const MAX_PROFUNDIDADE_FORMS = 12;
/** Caminhos com mais segmentos que isto não guardam a lista (não são linhas soltas) */
const MAX_SEGMENTOS = 16;
const MAX_FORMS_POR_PAGINA = 20000;
/** Formas com mais pontos que isto não guardam os contornos (o leitor usa só a caixa) */
const MAX_PONTOS_GEOMETRIA = 4000;

function paraLatin1(bytes: Uint8Array): string {
  // TextDecoder('latin1') é windows-1252 e estraga os bytes 0x80–0x9F
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return s;
}

export function interpretarPagina(l: Leitor, no: PDFDict, opcoes: OpcoesInterpretador): PaginaIR {
  const eventos: EventoDesenho[] = [];
  const fontesUsadas = new Set<string>();
  const avisos = new Set<string>();
  let formsVistos = 0;
  let contadorForms = 0;

  const cacheCamadas = new Map<string, { nome: string; oculta: boolean }>();
  const camadasUsadas = new Map<string, CamadaInfo>();
  const registarCamada = (ref: unknown, nome: string | undefined) => {
    if (!(ref instanceof PDFRef) || camadasUsadas.has(ref.tag)) return;
    camadasUsadas.set(ref.tag, { id: ref.tag, nome: nome ?? '?', desligada: opcoes.ocgOcultos.has(ref.tag) });
  };

  const recursosPagina = l.dict(
    (no as unknown as { getInheritableAttribute(n: PDFName): never }).getInheritableAttribute(PDFName.of('Resources')),
  );

  // Contents: um stream ou um array deles
  const conteudos = l.get(no, 'Contents');
  const streams = l.arr(conteudos) ? l.itens(conteudos) : [conteudos];
  let texto = '';
  for (const s of streams) {
    const st = l.stream(s);
    if (!st) continue;
    try {
      texto += paraLatin1(l.bytes(st)) + '\n';
    } catch (e) {
      avisos.add(`Não consegui descodificar parte do conteúdo da página (${(e as Error).message})`);
    }
  }

  const inicial: EstadoGrafico = {
    ctm: IDENT,
    cor: corInicial(ESPACO_GRAY),
    corTraco: corInicial(ESPACO_GRAY),
    espaco: ESPACO_GRAY,
    espacoTraco: ESPACO_GRAY,
    espessura: 1,
    overprintFill: false,
    overprintTraco: false,
    modoOverprint: 0,
    ca: 1,
    CA: 1,
    clip: opcoes.limites,
    tamanho: 0,
    tc: 0,
    tw: 0,
    th: 1,
    tl: 0,
    rise: 0,
    tr: 0,
  };

  function infoCamada(recursos: PDFDict | undefined, nome: string): { nome: string; oculta: boolean } | undefined {
    const props = l.dict(l.get(recursos, 'Properties'));
    const bruto = props?.get(PDFName.of(nome));
    const tag = bruto instanceof PDFRef ? bruto.tag : undefined;
    if (tag && cacheCamadas.has(tag)) return cacheCamadas.get(tag);
    const d = l.dict(bruto);
    if (!d) return undefined;
    let r: { nome: string; oculta: boolean };
    const tipo = l.nome(l.get(d, 'Type'));
    if (tipo === 'OCMD') {
      const ocgs = l.get(d, 'OCGs');
      const lista = l.arr(ocgs) ? l.arr(ocgs)!.asArray() : ocgs ? [d.get(PDFName.of('OCGs'))!] : [];
      const nomes = lista.map((x) => l.texto(l.get(l.dict(x), 'Name')) ?? '?');
      lista.forEach((x, i) => registarCamada(x, nomes[i]));
      const ocultas = lista.map((x) => (x instanceof PDFRef ? opcoes.ocgOcultos.has(x.tag) : false));
      r = { nome: nomes.join(' + ') || 'OCMD', oculta: lista.length > 0 && ocultas.every(Boolean) };
    } else {
      r = { nome: l.texto(l.get(d, 'Name')) ?? '?', oculta: tag ? opcoes.ocgOcultos.has(tag) : false };
      registarCamada(bruto, r.nome);
    }
    if (tag) cacheCamadas.set(tag, r);
    return r;
  }

  function fonteDe(recursos: PDFDict | undefined, nome: string): Fonte | undefined {
    const fontes = l.dict(l.get(recursos, 'Font'));
    const bruto = fontes?.get(PDFName.of(nome));
    const d = l.dict(bruto);
    if (!d) return undefined;
    const id = bruto instanceof PDFRef ? bruto.tag : `inline:${opcoes.indice}:${nome}`;
    let f = opcoes.fontes.get(id);
    if (!f) {
      f = lerFonte(l, d, id);
      opcoes.fontes.set(id, f);
    }
    return f;
  }

  function correr(
    src: string,
    recursos: PDFDict | undefined,
    estadoInicial: EstadoGrafico,
    profundidade: number,
    camadaBase: string | undefined,
    ocultoBase: boolean,
    fluxo: string,
    fluxoStream?: PDFStream,
  ): void {
    let st: EstadoGrafico = { ...estadoInicial };
    // posição da operação em curso, para o observador
    let opInicio = 0;
    let opFim = 0;
    const obs = opcoes.observador;
    const observarPintura = (
      objeto: Extract<Observacao, { tipo: 'pintar' }>['objeto'],
      preenche: boolean,
      traca: boolean,
      extra: { recurso?: string; mascara?: boolean; oculto?: boolean; inicioCaminho?: number; cor?: Cor } = {},
    ) => {
      obs?.operador(fluxo, opInicio, opFim, {
        tipo: 'pintar',
        objeto,
        preenche,
        traca,
        cor: extra.cor ?? (preenche ? st.cor : undefined),
        corTraco: traca ? st.corTraco : undefined,
        overprintFill: st.overprintFill,
        overprintTraco: st.overprintTraco,
        modo: st.modoOverprint,
        ca: st.ca,
        CA: st.CA,
        oculto: extra.oculto ?? ocultoAgora(),
        recurso: extra.recurso,
        mascara: extra.mascara,
        inicioCaminho: extra.inicioCaminho,
      });
    };
    const pilha: EstadoGrafico[] = [];
    const mc: { camada?: string; oculta: boolean }[] = [];

    const camadaAtual = (): string | undefined => {
      for (let i = mc.length - 1; i >= 0; i--) if (mc[i].camada !== undefined) return mc[i].camada;
      return camadaBase;
    };
    const ocultoAgora = (): boolean => ocultoBase || mc.some((m) => m.oculta);

    // caminho em construção, em coordenadas de página
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    let temCaminho = false;
    // onde começou o caminho em construção, no texto do stream
    let inicioCaminho = -1;
    let cx = 0,
      cy = 0,
      sx = 0,
      sy = 0;
    let clipPendente = false;
    // contorno do subcaminho em curso (x,y,x,y...) e os já fechados, para a área do preenchimento
    let sub: number[] = [];
    let fechados: Contorno[] = [];
    // segmentos retos do caminho, enquanto só tiver retas (para reconhecer linhas soltas)
    let segs: [number, number, number, number][] = [];
    let soRetas = true;
    // contornos completos (só com opcoes.geometria): pontos de cada subcaminho e se foi fechado
    let geo: { pts: number[]; fechado: boolean }[] = [];
    let pontosGeo = 0;

    // texto
    let tm: Mat = IDENT;
    let tlm: Mat = IDENT;

    const estender = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      temCaminho = true;
    };
    const limparCaminho = () => {
      minX = minY = Infinity;
      maxX = maxY = -Infinity;
      temCaminho = false;
      inicioCaminho = -1;
      clipPendente = false;
      sub = [];
      fechados = [];
      segs = [];
      soRetas = true;
      geo = [];
      pontosGeo = 0;
    };
    const juntarSegmento = (x0: number, y0: number, x1: number, y1: number) => {
      if (!soRetas) return;
      if (segs.length >= MAX_SEGMENTOS) {
        soRetas = false;
        segs = [];
      } else segs.push([x0, y0, x1, y1]);
    };
    /** Fecha o subcaminho em curso e guarda a sua área (com sinal) e a sua caixa */
    const fecharSub = (explicito = false) => {
      const n = sub.length / 2;
      if (opcoes.geometria && n >= 2 && pontosGeo <= MAX_PONTOS_GEOMETRIA) {
        pontosGeo += n;
        geo.push({ pts: sub, fechado: explicito });
      }
      if (n >= 3) {
        let a = 0;
        let x0 = Infinity,
          y0 = Infinity,
          x1 = -Infinity,
          y1 = -Infinity;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          a += sub[2 * i] * sub[2 * j + 1] - sub[2 * j] * sub[2 * i + 1];
          x0 = Math.min(x0, sub[2 * i]);
          x1 = Math.max(x1, sub[2 * i]);
          y0 = Math.min(y0, sub[2 * i + 1]);
          y1 = Math.max(y1, sub[2 * i + 1]);
        }
        fechados.push({ area: a / 2, x0, y0, x1, y1 });
      }
      sub = [];
    };
    /** Acrescenta um ponto ao contorno; se o subcaminho acabou de começar, parte do ponto atual */
    const juntarAoContorno = (...xy: number[]) => {
      if (!sub.length) sub.push(cx, cy);
      sub.push(...xy);
    };
    const moverPara = (x: number, y: number) => {
      const [px, py] = aplicar(st.ctm, x, y);
      fecharSub();
      cx = sx = px;
      cy = sy = py;
      sub = [px, py];
      estender(px, py);
    };
    const linhaPara = (x: number, y: number) => {
      const [px, py] = aplicar(st.ctm, x, y);
      juntarSegmento(cx, cy, px, py);
      juntarAoContorno(px, py);
      cx = px;
      cy = py;
      estender(px, py);
    };
    /** Curva cúbica com os pontos de controlo já em coordenadas de página */
    const curvaAbsoluta = (a: number, b: number, c: number, d: number, e: number, f: number) => {
      soRetas = false;
      segs = [];
      const [xmin, xmax] = extremosBezier(cx, a, c, e);
      const [ymin, ymax] = extremosBezier(cy, b, d, f);
      estender(xmin, ymin);
      estender(xmax, ymax);
      // para a área: cinco pontos intermédios por curva dão um erro de cerca de 1% num círculo
      const amostras: number[] = [];
      for (const t of [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]) {
        const u = 1 - t;
        amostras.push(
          u * u * u * cx + 3 * u * u * t * a + 3 * u * t * t * c + t * t * t * e,
          u * u * u * cy + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * f,
        );
      }
      juntarAoContorno(...amostras, e, f);
      cx = e;
      cy = f;
    };
    const curvaPara = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
      const [a, b] = aplicar(st.ctm, x1, y1);
      const [c, d] = aplicar(st.ctm, x2, y2);
      const [e, f] = aplicar(st.ctm, x3, y3);
      curvaAbsoluta(a, b, c, d, e, f);
    };

    const emitir = (e: Omit<EventoDesenho, 'pagina' | 'overprintPreenchimento' | 'overprintTraco' | 'modoOverprint' | 'camada'>) => {
      if (ocultoAgora()) return;
      obs?.evento?.(fluxo, opInicio, eventos.length);
      eventos.push({
        pagina: opcoes.indice,
        overprintPreenchimento: st.overprintFill,
        overprintTraco: st.overprintTraco,
        modoOverprint: st.modoOverprint,
        camada: camadaAtual(),
        ...e,
      });
    };

    const pintar = (preenche: boolean, traca: boolean, parImpar = false, fechar = false) => {
      // `n` só fecha o caminho (serve para recortar): não pinta nada
      if (temCaminho && (preenche || traca)) {
        const bb: Caixa = { x0: minX, y0: minY, x1: maxX, y1: maxY };
        let espessura: number | undefined;
        if (traca) {
          espessura = st.espessura * escala(st.ctm);
          const m = espessura / 2;
          bb.x0 -= m;
          bb.y0 -= m;
          bb.x1 += m;
          bb.y1 += m;
        }
        const visivel = intersetar(bb, st.clip);
        observarPintura('caminho', preenche, traca, { inicioCaminho: inicioCaminho >= 0 ? inicioCaminho : opInicio });
        // área do preenchimento: a do contorno, reduzida pela fração da caixa que fica visível
        fecharSub(fechar);
        let area: number | undefined;
        if (preenche) {
          const caixaCaminho: Caixa = { x0: minX, y0: minY, x1: maxX, y1: maxY };
          const areaCaixa = (maxX - minX) * (maxY - minY);
          const parte = intersetar(caixaCaminho, st.clip);
          const fracao = parte && areaCaixa > 0 ? ((parte.x1 - parte.x0) * (parte.y1 - parte.y0)) / areaCaixa : 0;
          area = areaDoPreenchimento(fechados, parImpar) * fracao;
        }
        if (visivel) {
          if ((preenche && st.cor.familia === 'Pattern') || (traca && st.corTraco.familia === 'Pattern')) {
            avisos.add('Padrões (Pattern) não são analisados por dentro');
          }
          emitir({
            tipo: 'forma',
            bbox: visivel,
            preenche,
            traca,
            cor: preenche ? st.cor : undefined,
            corTraco: traca ? st.corTraco : undefined,
            espessuraTraco: espessura,
            area,
            segmentos: traca && soRetas && segs.length ? segs.map((q) => [...q] as [number, number, number, number]) : undefined,
            geometria: opcoes.geometria && pontosGeo <= MAX_PONTOS_GEOMETRIA ? geometriaDe(geo, parImpar) : undefined,
          });
        }
      }
      if (clipPendente && temCaminho) {
        st.clip = intersetar({ x0: minX, y0: minY, x1: maxX, y1: maxY }, st.clip) ?? CLIP_VAZIO;
      }
      limparCaminho();
    };

    const observarCor = (alvo: 'fill' | 'traco', padrao?: string) =>
      obs?.operador(fluxo, opInicio, opFim, { tipo: 'cor', alvo, cor: alvo === 'fill' ? st.cor : st.corTraco, padrao });

    const definirCor = (alvo: 'fill' | 'traco', espaco: EspacoCor, args: Operando[]) => {
      const cor =
        espaco.familia === 'Pattern'
          ? ({ familia: 'Pattern', valores: [], nomes: nomeDe(args[args.length - 1]) ? [nomeDe(args[args.length - 1])!] : undefined } as Cor)
          : corDe(espaco, args.filter((a): a is number => typeof a === 'number'));
      if (alvo === 'fill') {
        st.espaco = espaco;
        st.cor = cor;
      } else {
        st.espacoTraco = espaco;
        st.corTraco = cor;
      }
      observarCor(alvo, espaco.familia === 'Pattern' ? nomeDe(args[args.length - 1]) : undefined);
    };

    // o operador de texto em curso (para o observador): ' e " mexem também no estado
    let opTexto = 'Tj';
    let opTw: number | undefined;
    let opTc: number | undefined;
    const mostrarTexto = (itens: Operando[]) => {
      const f = st.fonte;
      if (!f) {
        avisos.add('Texto sem fonte definida');
        return;
      }
      fontesUsadas.add(f.id);
      let x = 0;
      let minx = 0;
      let maxx = 0;
      const glifos: { codigo: number; x: number }[] = [];
      const tm0 = tm;
      for (const item of itens) {
        const s = textoDe(item);
        if (s !== undefined) {
          const passo = f.composta ? 2 : 1;
          for (let i = 0; i + passo <= s.length; i += passo) {
            const codigo = passo === 2 ? (s.charCodeAt(i) << 8) | s.charCodeAt(i + 1) : s.charCodeAt(i);
            const w0 = f.largura(codigo) / 1000;
            if (obs?.texto) glifos.push({ codigo, x });
            x += (w0 * st.tamanho + st.tc + (!f.composta && codigo === 32 ? st.tw : 0)) * st.th;
            if (x > maxx) maxx = x;
            if (x < minx) minx = x;
          }
        } else if (typeof item === 'number') {
          x -= (item / 1000) * st.tamanho * st.th;
          if (x > maxx) maxx = x;
          if (x < minx) minx = x;
        }
      }
      const y0 = (f.descent * st.tamanho) / 1000 + st.rise;
      const y1 = (f.ascent * st.tamanho) / 1000 + st.rise;
      const trm = mult(tm, st.ctm);
      const pts = [
        aplicar(trm, minx, y0),
        aplicar(trm, maxx, y0),
        aplicar(trm, minx, y1),
        aplicar(trm, maxx, y1),
      ];
      const bb: Caixa = {
        x0: Math.min(...pts.map((p) => p[0])),
        y0: Math.min(...pts.map((p) => p[1])),
        x1: Math.max(...pts.map((p) => p[0])),
        y1: Math.max(...pts.map((p) => p[1])),
      };
      tm = mult([1, 0, 0, 1, x, 0], tm);
      obs?.texto?.(fluxo, opInicio, opFim, {
        op: opTexto,
        tw: opTexto === '"' ? opTw : undefined,
        tc: opTexto === '"' ? opTc : undefined,
        fonte: { id: f.id, dict: f.dict, composta: f.composta, type3: f.type3 },
        tamanho: st.tamanho,
        th: st.th,
        rise: st.rise,
        modo: st.tr,
        tm: tm0 as DadosTexto['tm'],
        glifos,
        oculto: ocultoAgora(),
      });

      if (maxx - minx === 0 && !itens.some((i) => textoDe(i))) return;
      const visivel = intersetar(bb, st.clip);
      if (!visivel) return;
      const modo = st.tr;
      observarPintura('texto', modo === 0 || modo === 2 || modo === 4 || modo === 6, modo === 1 || modo === 2 || modo === 5 || modo === 6);
      emitir({
        tipo: 'texto',
        bbox: visivel,
        preenche: modo === 0 || modo === 2 || modo === 4 || modo === 6,
        traca: modo === 1 || modo === 2 || modo === 5 || modo === 6,
        cor: st.cor,
        corTraco: st.corTraco,
        espessuraTraco: st.espessura * escala(trm),
        texto: { fonte: f.id, tamanho: Math.abs(st.tamanho) * escala(trm), invisivel: modo === 3 || modo === 7 },
      });
    };

    const proximaLinha = () => {
      tlm = mult([1, 0, 0, 1, 0, -st.tl], tlm);
      tm = tlm;
    };

    const colocarImagem = (info: InfoImagem | null, mascara: boolean) => {
      if (!info) return;
      const m = st.ctm;
      const pts = [aplicar(m, 0, 0), aplicar(m, 1, 0), aplicar(m, 0, 1), aplicar(m, 1, 1)];
      const bb: Caixa = {
        x0: Math.min(...pts.map((p) => p[0])),
        y0: Math.min(...pts.map((p) => p[1])),
        x1: Math.max(...pts.map((p) => p[0])),
        y1: Math.max(...pts.map((p) => p[1])),
      };
      const larguraPt = Math.hypot(m[0], m[1]);
      const alturaPt = Math.hypot(m[2], m[3]);
      info.larguraPt = larguraPt;
      info.alturaPt = alturaPt;
      info.ppiX = larguraPt > 0 ? info.larguraPx / (larguraPt / 72) : 0;
      info.ppiY = alturaPt > 0 ? info.alturaPx / (alturaPt / 72) : 0;
      const visivel = intersetar(bb, st.clip);
      if (!visivel) return;
      emitir({ tipo: 'imagem', bbox: visivel, preenche: true, traca: false, cor: mascara ? st.cor : undefined, imagem: info });
    };

    obs?.fluxo(fluxo, { texto: src, recursos, stream: fluxoStream });
    for (const { op, args, inicio, fim } of operacoes(src)) {
      opInicio = inicio;
      opFim = fim;
      if (inicioCaminho < 0 && (op === 'm' || op === 'l' || op === 'c' || op === 'v' || op === 'y' || op === 're')) inicioCaminho = inicio;
      switch (op) {
        // --- estado gráfico
        case 'q':
          pilha.push({ ...st });
          break;
        case 'Q':
          if (pilha.length) st = pilha.pop()!;
          break;
        case 'cm':
          st.ctm = mult(matDe(args.map((a) => numeroDe(a, NaN))), st.ctm);
          break;
        case 'w':
          st.espessura = numeroDe(args[0], 1);
          break;
        case 'gs': {
          const nome = nomeDe(args[0]);
          const d = nome ? l.dict(l.get(l.dict(l.get(recursos, 'ExtGState')), nome)) : undefined;
          if (d) {
            const OP = l.bool(l.get(d, 'OP'));
            const op2 = l.bool(l.get(d, 'op'));
            const opm = l.num(l.get(d, 'OPM'));
            const ca = l.num(l.get(d, 'ca'));
            const CA = l.num(l.get(d, 'CA'));
            if (ca !== undefined) st.ca = ca;
            if (CA !== undefined) st.CA = CA;
            if (OP !== undefined) {
              st.overprintTraco = OP;
              // sem "op", o OP vale também para o preenchimento
              if (op2 === undefined) st.overprintFill = OP;
            }
            if (op2 !== undefined) st.overprintFill = op2;
            if (opm !== undefined) st.modoOverprint = opm === 1 ? 1 : 0;
            const fonteGs = l.itens(l.get(d, 'Font'));
            if (fonteGs.length === 2) {
              // [ref tamanho] — raro, mas existe
              const fd = l.dict(fonteGs[0]);
              const tam = l.num(fonteGs[1]);
              if (fd && tam !== undefined) {
                const id = `gs:${opcoes.indice}:${nome}`;
                let f = opcoes.fontes.get(id);
                if (!f) opcoes.fontes.set(id, (f = lerFonte(l, fd, id)));
                st.fonte = f;
                st.tamanho = tam;
              }
            }
          }
          break;
        }

        // --- caminhos
        case 'm':
          moverPara(numeroDe(args[0]), numeroDe(args[1]));
          break;
        case 'l':
          linhaPara(numeroDe(args[0]), numeroDe(args[1]));
          break;
        case 'c':
          curvaPara(...(args.slice(0, 6).map((a) => numeroDe(a)) as [number, number, number, number, number, number]));
          break;
        case 'v': {
          // o primeiro ponto de controlo é o ponto atual
          const p2 = aplicar(st.ctm, numeroDe(args[0]), numeroDe(args[1]));
          const p3 = aplicar(st.ctm, numeroDe(args[2]), numeroDe(args[3]));
          curvaAbsoluta(cx, cy, p2[0], p2[1], p3[0], p3[1]);
          break;
        }
        case 'y': {
          // o último ponto de controlo é o ponto final
          const p1 = aplicar(st.ctm, numeroDe(args[0]), numeroDe(args[1]));
          const p3 = aplicar(st.ctm, numeroDe(args[2]), numeroDe(args[3]));
          curvaAbsoluta(p1[0], p1[1], p3[0], p3[1], p3[0], p3[1]);
          break;
        }
        case 'h':
          if (cx !== sx || cy !== sy) juntarSegmento(cx, cy, sx, sy);
          fecharSub(true);
          cx = sx;
          cy = sy;
          break;
        case 're': {
          const x = numeroDe(args[0]);
          const y = numeroDe(args[1]);
          const w = numeroDe(args[2]);
          const h = numeroDe(args[3]);
          fecharSub();
          const cantos: [number, number][] = [];
          for (const [px, py] of [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
          ] as const) {
            const [ax, ay] = aplicar(st.ctm, px, py);
            estender(ax, ay);
            sub.push(ax, ay);
            cantos.push([ax, ay]);
          }
          for (let i = 0; i < 4; i++) juntarSegmento(...cantos[i], ...cantos[(i + 1) % 4]);
          fecharSub(true);
          const [ox, oy] = aplicar(st.ctm, x, y);
          cx = sx = ox;
          cy = sy = oy;
          break;
        }

        // --- pintura
        case 'f':
        case 'F':
          pintar(true, false);
          break;
        case 'f*':
          pintar(true, false, true);
          break;
        case 'S':
          pintar(false, true);
          break;
        case 's':
          pintar(false, true, false, true);
          break;
        case 'B':
          pintar(true, true);
          break;
        case 'b':
          pintar(true, true, false, true);
          break;
        case 'B*':
          pintar(true, true, true);
          break;
        case 'b*':
          pintar(true, true, true, true);
          break;
        case 'n':
          pintar(false, false);
          break;
        case 'W':
        case 'W*':
          clipPendente = true;
          break;
        case 'sh':
          // Degradé: ocupa toda a área de recorte atual (não lemos o BBox do shading)
          observarPintura('shading', true, false, { recurso: nomeDe(args[0]) });
          if (st.clip.x0 <= st.clip.x1) {
            emitir({ tipo: 'shading', bbox: st.clip, preenche: true, traca: false, cor: { familia: 'Desconhecido', valores: [] } });
          }
          break;

        // --- cor
        case 'g':
          definirCor('fill', ESPACO_GRAY, args);
          break;
        case 'G':
          definirCor('traco', ESPACO_GRAY, args);
          break;
        case 'rg':
          definirCor('fill', ESPACO_RGB, args);
          break;
        case 'RG':
          definirCor('traco', ESPACO_RGB, args);
          break;
        case 'k':
          definirCor('fill', ESPACO_CMYK, args);
          break;
        case 'K':
          definirCor('traco', ESPACO_CMYK, args);
          break;
        case 'cs': {
          const e = resolverEspaco(l, PDFName.of(nomeDe(args[0]) ?? ''), recursos);
          st.espaco = e;
          st.cor = corInicial(e);
          observarCor('fill');
          break;
        }
        case 'CS': {
          const e = resolverEspaco(l, PDFName.of(nomeDe(args[0]) ?? ''), recursos);
          st.espacoTraco = e;
          st.corTraco = corInicial(e);
          observarCor('traco');
          break;
        }
        case 'sc':
        case 'scn':
          definirCor('fill', st.espaco, args);
          break;
        case 'SC':
        case 'SCN':
          definirCor('traco', st.espacoTraco, args);
          break;

        // --- layers
        case 'BDC': {
          let camada: string | undefined;
          let oculta = false;
          if (nomeDe(args[0]) === 'OC') {
            const prop = nomeDe(args[1]);
            const info = prop ? infoCamada(recursos, prop) : undefined;
            if (info) {
              camada = info.nome;
              oculta = info.oculta;
            }
          }
          mc.push({ camada, oculta });
          break;
        }
        case 'BMC':
          mc.push({ oculta: false });
          break;
        case 'EMC':
          mc.pop();
          break;

        // --- XObjects
        case 'Do': {
          const nome = nomeDe(args[0]);
          const bruto = nome ? l.dict(l.get(recursos, 'XObject'))?.get(PDFName.of(nome)) : undefined;
          const xo = l.stream(bruto);
          if (!xo) break;
          const sub = l.nome(l.get(xo.dict, 'Subtype'));
          const oc = l.get(xo.dict, 'OC');
          const ocRaw = xo.dict.get(PDFName.of('OC'));
          let camadaXo: string | undefined;
          let ocultoXo = false;
          if (oc) {
            const d = l.dict(oc);
            camadaXo = l.texto(l.get(d, 'Name'));
            registarCamada(ocRaw, camadaXo);
            ocultoXo = ocRaw instanceof PDFRef && opcoes.ocgOcultos.has(ocRaw.tag);
          }
          const escondido = ocultoXo || ocultoAgora();
          if (sub === 'Image' || sub === 'Form') {
            const mascaraXo = sub === 'Image' && l.bool(l.get(xo.dict, 'ImageMask')) === true;
            observarPintura(sub === 'Image' ? 'imagem' : 'form', true, false, {
              recurso: nome,
              oculto: escondido,
              mascara: mascaraXo,
              // uma imagem pinta com as tintas do seu espaço de cor; uma máscara, com a cor de preenchimento
              cor: obs && sub === 'Image' && !mascaraXo ? corDaImagem(resolverEspaco(l, xo.dict.get(PDFName.of('ColorSpace')), recursos)) : undefined,
            });
          }
          if (escondido) break;

          if (sub === 'Image') {
            const d = xo.dict;
            const mascara = l.bool(l.get(d, 'ImageMask')) === true;
            const filtro = l.arr(l.get(d, 'Filter')) ? l.nome(l.itens(l.get(d, 'Filter')).slice(-1)[0]) : l.nome(l.get(d, 'Filter'));
            const esp = mascara ? undefined : resolverEspaco(l, d.get(PDFName.of('ColorSpace')), recursos);
            colocarImagem(
              {
                larguraPx: l.num(l.get(d, 'Width')) ?? 0,
                alturaPx: l.num(l.get(d, 'Height')) ?? 0,
                espacoCor: mascara ? 'Mask' : (esp?.familia ?? 'Desconhecido'),
                nomes: esp?.nomes,
                bitsPorComponente: mascara ? 1 : l.num(l.get(d, 'BitsPerComponent')),
                filtro,
                ppiX: 0,
                ppiY: 0,
                larguraPt: 0,
                alturaPt: 0,
              },
              mascara,
            );
          } else if (sub === 'Form') {
            if (profundidade >= MAX_PROFUNDIDADE_FORMS || ++formsVistos > MAX_FORMS_POR_PAGINA) {
              avisos.add('Formulários (Form XObjects) aninhados demais: parte do conteúdo não foi analisada');
              break;
            }
            let conteudoForm: string;
            try {
              conteudoForm = paraLatin1(l.bytes(xo));
            } catch (e) {
              avisos.add(`Não consegui descodificar um Form XObject (${(e as Error).message})`);
              break;
            }
            const matriz = matDe(l.numeros(l.get(xo.dict, 'Matrix')));
            const interno: EstadoGrafico = { ...st, ctm: mult(matriz, st.ctm) };
            const bbox = l.numeros(l.get(xo.dict, 'BBox'));
            if (bbox.length === 4 && bbox.every(Number.isFinite)) {
              const pts = [
                aplicar(interno.ctm, bbox[0], bbox[1]),
                aplicar(interno.ctm, bbox[2], bbox[1]),
                aplicar(interno.ctm, bbox[0], bbox[3]),
                aplicar(interno.ctm, bbox[2], bbox[3]),
              ];
              const c = intersetar(
                {
                  x0: Math.min(...pts.map((p) => p[0])),
                  y0: Math.min(...pts.map((p) => p[1])),
                  x1: Math.max(...pts.map((p) => p[0])),
                  y1: Math.max(...pts.map((p) => p[1])),
                },
                st.clip,
              );
              interno.clip = c ?? CLIP_VAZIO;
            }
            const idForm = bruto instanceof PDFRef ? bruto.tag : `inline:${++contadorForms}`;
            correr(conteudoForm, l.dict(l.get(xo.dict, 'Resources')) ?? recursos, interno, profundidade + 1, camadaXo ?? camadaAtual(), false, idForm, xo);
          }
          break;
        }
        case 'INLINEIMAGE': {
          const d = (args[0] as { dict: Record<string, Operando> }).dict;
          const pega = (a: string, b: string) => d[a] ?? d[b];
          const mascara = pega('IM', 'ImageMask') === true;
          const cs = pega('CS', 'ColorSpace');
          let esp: EspacoCor | undefined;
          if (!mascara) {
            const nome = nomeDe(cs);
            if (nome) esp = resolverEspaco(l, PDFName.of(nome), recursos);
            else if (Array.isArray(cs)) {
              const base = nomeDe(cs[1] as Operando);
              esp = base ? resolverEspaco(l, PDFName.of(base), recursos) : undefined;
            }
          }
          observarPintura('imagem-inline', true, false, { mascara: mascara });
          const f = pega('F', 'Filter');
          const filtro = nomeDe(Array.isArray(f) ? (f[f.length - 1] as Operando) : f);
          colocarImagem(
            {
              larguraPx: numeroDe(pega('W', 'Width')),
              alturaPx: numeroDe(pega('H', 'Height')),
              espacoCor: mascara ? 'Mask' : (esp?.familia ?? 'Desconhecido'),
              nomes: esp?.nomes,
              bitsPorComponente: mascara ? 1 : numeroDe(pega('BPC', 'BitsPerComponent'), 8),
              filtro,
              ppiX: 0,
              ppiY: 0,
              larguraPt: 0,
              alturaPt: 0,
            },
            mascara,
          );
          break;
        }

        // --- texto
        case 'BT':
          tm = tlm = IDENT;
          break;
        case 'ET':
          break;
        case 'Tf': {
          const nome = nomeDe(args[0]);
          st.fonte = nome ? fonteDe(recursos, nome) : undefined;
          st.tamanho = numeroDe(args[1]);
          if (!st.fonte) avisos.add(`Fonte /${nome ?? '?'} não encontrada nos recursos`);
          break;
        }
        case 'Tc':
          st.tc = numeroDe(args[0]);
          break;
        case 'Tw':
          st.tw = numeroDe(args[0]);
          break;
        case 'Tz':
          st.th = numeroDe(args[0], 100) / 100;
          break;
        case 'TL':
          st.tl = numeroDe(args[0]);
          break;
        case 'Ts':
          st.rise = numeroDe(args[0]);
          break;
        case 'Tr':
          st.tr = numeroDe(args[0]);
          break;
        case 'Td':
          tlm = mult([1, 0, 0, 1, numeroDe(args[0]), numeroDe(args[1])], tlm);
          tm = tlm;
          break;
        case 'TD':
          st.tl = -numeroDe(args[1]);
          tlm = mult([1, 0, 0, 1, numeroDe(args[0]), numeroDe(args[1])], tlm);
          tm = tlm;
          break;
        case 'Tm':
          tm = tlm = matDe(args.map((a) => numeroDe(a, NaN)));
          break;
        case 'T*':
          proximaLinha();
          break;
        case 'Tj':
          opTexto = 'Tj';
          mostrarTexto([args[0]]);
          break;
        case 'TJ':
          opTexto = 'TJ';
          mostrarTexto(Array.isArray(args[0]) ? args[0] : []);
          break;
        case "'":
          opTexto = "'";
          proximaLinha();
          mostrarTexto([args[0]]);
          break;
        case '"':
          opTexto = '"';
          opTw = numeroDe(args[0]);
          opTc = numeroDe(args[1]);
          st.tw = opTw;
          st.tc = opTc;
          proximaLinha();
          mostrarTexto([args[2]]);
          break;
        default:
          break;
      }
    }
  }

  correr(texto, recursosPagina, inicial, 0, undefined, false, 'pagina');

  return { indice: opcoes.indice, eventos, camadas: [...camadasUsadas.values()], fontesUsadas: [...fontesUsadas], avisos: [...avisos] };
}
