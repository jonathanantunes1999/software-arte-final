import { ptParaMm } from '../comum/unidades';

/** Retângulo em pontos, com x0<x1 e y0<y1 (espaço de utilizador da página). */
export interface Caixa {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type OrigemTrim = 'TrimBox' | 'CropBox' | 'MediaBox';
export type OrigemSangria = 'BleedBox' | 'nenhuma';

export interface Lados {
  esquerda: number;
  cima: number;
  direita: number;
  baixo: number;
}

export interface CaixasBrutas {
  media: Caixa;
  crop?: Caixa;
  trim?: Caixa;
  bleed?: Caixa;
  /** /Rotate da página, em graus (qualquer múltiplo de 90) */
  rotacao: number;
  /** /UserUnit (1 unidade = userUnit/72 polegadas). Por omissão 1. */
  userUnit: number;
}

export interface MedidaPagina {
  /** Medida final (TrimBox) como se vê no ecrã, já com rotação e UserUnit */
  larguraMm: number;
  alturaMm: number;
  origemTrim: OrigemTrim;
  origemSangria: OrigemSangria;
  /** Sangria em mm de cada lado, como se vê no ecrã. Zero quando não há BleedBox. */
  sangriaMm: Lados;
  /** A BleedBox do ficheiro sai da CropBox (área visível), pelo que foi cortada por ela */
  bleedForaDaCrop: boolean;
  /** Caixas em pt (espaço de utilizador, sem rotação), já normalizadas e com defaults */
  trim: Caixa;
  bleed: Caixa;
  crop: Caixa;
  media: Caixa;
  rotacao: number;
}

export function normalizarCaixa(a: number, b: number, c: number, d: number): Caixa {
  return { x0: Math.min(a, c), y0: Math.min(b, d), x1: Math.max(a, c), y1: Math.max(b, d) };
}

/** Interseção; null se não se tocam. */
function intersetar(a: Caixa, b: Caixa): Caixa | null {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  return x0 < x1 && y0 < y1 ? { x0, y0, x1, y1 } : null;
}

/** true se `dentro` cabe inteira em `fora` (com folga de 0,01 pt para erros de arredondamento) */
function contem(fora: Caixa, dentro: Caixa): boolean {
  const e = 0.01;
  return dentro.x0 >= fora.x0 - e && dentro.y0 >= fora.y0 - e && dentro.x1 <= fora.x1 + e && dentro.y1 <= fora.y1 + e;
}

export function normalizarRotacao(graus: number): 0 | 90 | 180 | 270 {
  const r = ((Math.round(graus / 90) * 90) % 360 + 360) % 360;
  return r as 0 | 90 | 180 | 270;
}

/**
 * Aplica os defaults da especificação (CropBox = MediaBox, TrimBox = CropBox)
 * e calcula medida final e sangria como se veem no ecrã.
 */
export function medirPagina(brutas: CaixasBrutas): MedidaPagina {
  const rot = normalizarRotacao(brutas.rotacao);
  const unit = brutas.userUnit > 0 ? brutas.userUnit : 1;

  const media = brutas.media;
  // A CropBox nunca passa da MediaBox
  const crop = (brutas.crop && intersetar(brutas.crop, media)) || media;
  const trimDefinida = brutas.trim !== undefined;
  const trim = brutas.trim ?? crop;
  const bleedDefinida = brutas.bleed !== undefined;
  // A sangria só conta até à CropBox: o que fica fora não se vê nem se exporta
  const bleedBruta = brutas.bleed ?? trim;
  const bleed = intersetar(bleedBruta, crop) ?? trim;
  const bleedForaDaCrop = bleedDefinida && !contem(crop, bleedBruta);

  const origemTrim: OrigemTrim = trimDefinida ? 'TrimBox' : brutas.crop ? 'CropBox' : 'MediaBox';

  const emMm = (pt: number) => ptParaMm(pt * unit);

  // Lados no espaço de utilizador (antes de rodar). Sangria nunca negativa.
  const lados = {
    esq: Math.max(0, trim.x0 - bleed.x0),
    dir: Math.max(0, bleed.x1 - trim.x1),
    baixo: Math.max(0, trim.y0 - bleed.y0),
    cima: Math.max(0, bleed.y1 - trim.y1),
  };

  // Rodar para a orientação em que o utilizador vê a página (/Rotate é no sentido horário)
  let visto: Lados;
  switch (rot) {
    case 90:
      visto = { cima: lados.esq, direita: lados.cima, baixo: lados.dir, esquerda: lados.baixo };
      break;
    case 180:
      visto = { cima: lados.baixo, direita: lados.esq, baixo: lados.cima, esquerda: lados.dir };
      break;
    case 270:
      visto = { cima: lados.dir, direita: lados.baixo, baixo: lados.esq, esquerda: lados.cima };
      break;
    default:
      visto = { cima: lados.cima, direita: lados.dir, baixo: lados.baixo, esquerda: lados.esq };
  }

  const w = trim.x1 - trim.x0;
  const h = trim.y1 - trim.y0;
  const trocar = rot === 90 || rot === 270;

  return {
    larguraMm: emMm(trocar ? h : w),
    alturaMm: emMm(trocar ? w : h),
    origemTrim,
    origemSangria: bleedDefinida ? 'BleedBox' : 'nenhuma',
    bleedForaDaCrop,
    sangriaMm: {
      esquerda: emMm(visto.esquerda),
      cima: emMm(visto.cima),
      direita: emMm(visto.direita),
      baixo: emMm(visto.baixo),
    },
    trim,
    bleed,
    crop,
    media,
    rotacao: rot,
  };
}

/** true se as páginas não têm todas a mesma medida final (dentro da tolerância). */
export function tamanhosDiferentes(
  medidas: Pick<MedidaPagina, 'larguraMm' | 'alturaMm'>[],
  toleranciaMm: number,
): boolean {
  if (medidas.length < 2) return false;
  const ref = medidas[0];
  return medidas.some(
    (m) => Math.abs(m.larguraMm - ref.larguraMm) > toleranciaMm || Math.abs(m.alturaMm - ref.alturaMm) > toleranciaMm,
  );
}
