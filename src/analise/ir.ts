import type { Caixa } from './caixas';

/**
 * Representação intermédia: uma lista plana de "coisas pintadas" na página, com
 * a informação que o pdf.js deita fora (espaço de cor original, overprint, layer).
 * Todas as coordenadas são pontos no espaço de utilizador da página (sem rotação).
 */

export type FamiliaCor = 'Gray' | 'RGB' | 'CMYK' | 'Lab' | 'Separation' | 'DeviceN' | 'Pattern' | 'Desconhecido';

export interface Cor {
  familia: FamiliaCor;
  /** Gray: [g] · RGB: [r,g,b] · CMYK: [c,m,y,k] · Separation: [tinta] · DeviceN: tintas · Lab: [L,a,b] (0–1 nos device, 0–100 no Lab) */
  valores: number[];
  /** Separation: [nome] · DeviceN: nomes das tintas */
  nomes?: string[];
  /** Veio de um espaço ICCBased/Cal* (a família é a dos componentes) */
  calibrada?: boolean;
  /** Separation: cor RGB aproximada da tinta a 100% (do espaço alternativo), para amostras no ecrã */
  amostra?: [number, number, number];
}

export type TipoEvento = 'forma' | 'texto' | 'imagem' | 'shading';

export interface InfoImagem {
  larguraPx: number;
  alturaPx: number;
  /** Família do espaço de cor da imagem; 'Mask' para stencil de 1 bit (usa a cor de preenchimento) */
  espacoCor: FamiliaCor | 'Mask';
  /** Para DeviceN/Separation: nomes das tintas */
  nomes?: string[];
  bitsPorComponente?: number;
  filtro?: string;
  /** Resolução efetiva (pixels por polegada) pelo tamanho a que está colocada */
  ppiX: number;
  ppiY: number;
  /** Tamanho a que está colocada, em pontos (comprimento dos lados da imagem, mesmo se rodada) */
  larguraPt: number;
  alturaPt: number;
}

export interface InfoTexto {
  /** id da fonte (ver InfoFonte.id) */
  fonte: string;
  /** Tamanho efetivo em pt (corpo × escala da matriz) */
  tamanho: number;
  /** Modo de renderização 3: não se vê */
  invisivel: boolean;
}

/**
 * Contornos de uma forma, em pt: cada um é uma lista x,y,x,y... (curvas já aproximadas por
 * segmentos). Só se guarda quando o interpretador é chamado com `geometria` (leitor de cor).
 */
export interface Geometria {
  contornos: Float32Array[];
  /** O contorno foi fechado de forma explícita (h, re, s, b): o traço fecha-o. */
  fechados: boolean[];
  /** Regra de preenchimento: true = par-ímpar (f*), false = enrolamento (f) */
  parImpar: boolean;
}

export interface EventoDesenho {
  pagina: number;
  tipo: TipoEvento;
  /** Caixa que contém o objeto, já recortada pelos clipping paths do conteúdo */
  bbox: Caixa;
  preenche: boolean;
  traca: boolean;
  /** Cor de preenchimento (também a do texto e a das imagens-máscara) */
  cor?: Cor;
  corTraco?: Cor;
  /** Espessura do traço em pt, já com a escala da matriz */
  espessuraTraco?: number;
  /**
   * Só em traços feitos de segmentos retos (até 16): cada segmento é [x0, y0, x1, y1] em pt.
   * Permite reconhecer linhas soltas, como as marcas de corte, mesmo quando várias vão no mesmo caminho.
   */
  segmentos?: [number, number, number, number][];
  /**
   * Só em formas preenchidas: área aproximada da parte visível, em pt². Calculada pelo contorno
   * (buracos descontados), por isso uma moldura tem muito menos área que a sua caixa.
   */
  area?: number;
  /** Contornos da forma (só quando pedido: ver Geometria) */
  geometria?: Geometria;
  overprintPreenchimento: boolean;
  overprintTraco: boolean;
  modoOverprint: 0 | 1;
  /** Nome da layer (Optional Content) mais interna, se houver */
  camada?: string;
  texto?: InfoTexto;
  imagem?: InfoImagem;
}

export interface InfoFonte {
  id: string;
  /** Nome sem o prefixo de subset (ABCDEF+) */
  nome: string;
  nomeCompleto: string;
  subtype: string;
  incorporada: boolean;
  /** Type0 (códigos de 2 bytes) */
  composta: boolean;
  type3: boolean;
}

/** Uma layer (Optional Content Group) usada na página */
export interface CamadaInfo {
  /** Etiqueta do objeto no PDF (PDFRef.tag, ex.: "12 0 R") */
  id: string;
  nome: string;
  /** Desligada por omissão no ficheiro */
  desligada: boolean;
}

export interface PaginaIR {
  indice: number;
  eventos: EventoDesenho[];
  /** Layers referenciadas pelo conteúdo da página, pela ordem em que aparecem */
  camadas: CamadaInfo[];
  /** Fontes realmente usadas em texto nesta página (mesmo que o texto esteja recortado) */
  fontesUsadas: string[];
  /** Coisas que o interpretador não soube tratar nesta página */
  avisos: string[];
}
