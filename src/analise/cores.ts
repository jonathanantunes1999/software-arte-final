import type { PDFDict, PDFObject } from 'pdf-lib';
import { PDFArray, PDFName } from 'pdf-lib';
import type { Cor, FamiliaCor } from './ir';
import type { Leitor } from './leitor';

export interface EspacoCor {
  familia: FamiliaCor;
  /** Número de componentes */
  n: number;
  nomes?: string[];
  calibrada?: boolean;
}

export const ESPACO_GRAY: EspacoCor = { familia: 'Gray', n: 1 };
export const ESPACO_RGB: EspacoCor = { familia: 'RGB', n: 3 };
export const ESPACO_CMYK: EspacoCor = { familia: 'CMYK', n: 4 };
const ESPACO_DESCONHECIDO: EspacoCor = { familia: 'Desconhecido', n: 1 };

const ABREVIATURAS: Record<string, EspacoCor> = {
  DeviceGray: ESPACO_GRAY,
  G: ESPACO_GRAY,
  CalGray: { familia: 'Gray', n: 1, calibrada: true },
  DeviceRGB: ESPACO_RGB,
  RGB: ESPACO_RGB,
  CalRGB: { familia: 'RGB', n: 3, calibrada: true },
  DeviceCMYK: ESPACO_CMYK,
  CMYK: ESPACO_CMYK,
  Pattern: { familia: 'Pattern', n: 0 },
};

/**
 * Resolve um espaço de cor: um nome (DeviceCMYK, ou um nome em /Resources/ColorSpace)
 * ou um array ([/Separation ...], [/ICCBased ...], ...).
 */
export function resolverEspaco(
  l: Leitor,
  obj: PDFObject | undefined,
  recursos: PDFDict | undefined,
  profundidade = 0,
): EspacoCor {
  if (profundidade > 6) return ESPACO_DESCONHECIDO;
  const o = l.res(obj);

  const nome = l.nome(o);
  if (nome !== undefined) {
    if (ABREVIATURAS[nome]) return ABREVIATURAS[nome];
    const doRecurso = l.get(l.dict(l.get(recursos, 'ColorSpace')), nome);
    return doRecurso ? resolverEspaco(l, doRecurso, recursos, profundidade + 1) : ESPACO_DESCONHECIDO;
  }

  if (!(o instanceof PDFArray)) return ESPACO_DESCONHECIDO;
  const itens = l.itens(o);
  const familia = l.nome(itens[0]);

  switch (familia) {
    case 'ICCBased': {
      const n = l.num(l.get(l.dict(itens[1]), 'N')) ?? 3;
      const f: FamiliaCor = n === 1 ? 'Gray' : n === 4 ? 'CMYK' : 'RGB';
      return { familia: f, n, calibrada: true };
    }
    case 'CalGray':
    case 'CalRGB':
    case 'DeviceGray':
    case 'DeviceRGB':
    case 'DeviceCMYK':
      return ABREVIATURAS[familia];
    case 'Lab':
      return { familia: 'Lab', n: 3, calibrada: true };
    case 'Indexed':
    case 'I': {
      const base = resolverEspaco(l, itens[1], recursos, profundidade + 1);
      return { ...base, n: 1 };
    }
    case 'Separation':
      return { familia: 'Separation', n: 1, nomes: [l.nome(itens[1]) ?? ''] };
    case 'DeviceN': {
      const nomes = l.itens(itens[1]).map((x) => l.nome(x) ?? '');
      return { familia: 'DeviceN', n: nomes.length, nomes };
    }
    case 'Pattern':
      return { familia: 'Pattern', n: 0 };
    default:
      return ESPACO_DESCONHECIDO;
  }
}

/** Valores iniciais de cada espaço, como manda a especificação. */
export function corInicial(e: EspacoCor): Cor {
  switch (e.familia) {
    case 'Gray':
      return { familia: 'Gray', valores: [0], calibrada: e.calibrada };
    case 'RGB':
      return { familia: 'RGB', valores: [0, 0, 0], calibrada: e.calibrada };
    case 'CMYK':
      return { familia: 'CMYK', valores: [0, 0, 0, 1], calibrada: e.calibrada };
    case 'Lab':
      return { familia: 'Lab', valores: [0, 0, 0], calibrada: true };
    case 'Separation':
      return { familia: 'Separation', valores: [1], nomes: e.nomes };
    case 'DeviceN':
      return { familia: 'DeviceN', valores: (e.nomes ?? []).map(() => 1), nomes: e.nomes };
    default:
      return { familia: e.familia, valores: [] };
  }
}

export function corDe(e: EspacoCor, valores: number[]): Cor {
  return { familia: e.familia, valores, nomes: e.nomes, calibrada: e.calibrada };
}

const SEM_TINTA = 0.001;

/** Sem tinta nenhuma: CMYK 0/0/0/0, spots a 0%. */
export function semTinta(c: Cor | undefined): boolean {
  if (!c) return false;
  switch (c.familia) {
    case 'CMYK':
    case 'Separation':
    case 'DeviceN':
      return c.valores.length > 0 && c.valores.every((v) => v <= SEM_TINTA);
    default:
      return false;
  }
}

/** Branco: não deixa tinta (CMYK 0/0/0/0, tinta a 0%) ou é cinzento 100% / RGB branco. */
export function ehBranco(c: Cor | undefined): boolean {
  if (!c) return false;
  if (semTinta(c)) return true;
  if (c.familia === 'Gray') return c.valores[0] >= 1 - SEM_TINTA;
  if (c.familia === 'RGB') return c.valores.length === 3 && c.valores.every((v) => v >= 1 - SEM_TINTA);
  if (c.familia === 'Lab') return c.valores[0] >= 99.9;
  return false;
}

/** Preto de quatro cores: K alto com C, M e Y também presentes (ex.: 60/40/40/100 ou 75/68/67/90). */
export function ehPretoRico(c: Cor | undefined): boolean {
  return !!c && c.familia === 'CMYK' && c.valores.length === 4 && c.valores[3] >= 0.7 && c.valores[0] > 0.05 && c.valores[1] > 0.05 && c.valores[2] > 0.05;
}

/** Só preto K, sem outras tintas (CMYK 0/0/0/100 ou cinzento 0): em grandes áreas fica acinzentado. */
export function ehPretoChapado(c: Cor | undefined): boolean {
  if (!c) return false;
  if (c.familia === 'CMYK' && c.valores.length === 4) return c.valores[0] <= 0.02 && c.valores[1] <= 0.02 && c.valores[2] <= 0.02 && c.valores[3] >= 0.95;
  return c.familia === 'Gray' && c.valores[0] <= 0.02;
}

/** "Todas" (registo): a tinta de registo, usada em marcas. */
export function ehRegisto(c: Cor | undefined): boolean {
  return !!c && c.familia === 'Separation' && c.nomes?.[0]?.toLowerCase() === 'all';
}

export function normalizarNomeSpot(nome: string): string {
  return nome.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * A cor é uma spot técnica (faca, vincos, verniz...)? Compara com a lista das definições,
 * ignorando maiúsculas, espaços e pontuação. Aceita sufixos numéricos ("Cortante 2").
 */
export function ehSpotTecnica(c: Cor | undefined, tecnicas: string[]): boolean {
  if (!c || (c.familia !== 'Separation' && c.familia !== 'DeviceN')) return false;
  const lista = tecnicas.map(normalizarNomeSpot).filter(Boolean);
  return (c.nomes ?? []).some((n) => {
    const nn = normalizarNomeSpot(n);
    return lista.some((t) => nn === t || (t.length >= 4 && nn.startsWith(t) && /^\d*$/.test(nn.slice(t.length))));
  });
}

/** Descrição curta e legível de uma cor, para mensagens: "CMYK 0/100/0/0", "PANTONE 485 C 60%". */
export function descreverCor(c: Cor | undefined): string {
  if (!c) return '';
  const pct = (v: number) => Math.round(v * 100);
  switch (c.familia) {
    case 'CMYK':
      return `CMYK ${c.valores.map(pct).join('/')}`;
    case 'RGB':
      return `RGB ${c.valores.map((v) => Math.round(v * 255)).join('/')}`;
    case 'Gray':
      return c.valores[0] <= 0.001 ? 'preto' : c.valores[0] >= 0.999 ? 'branco' : `cinzento ${pct(c.valores[0])}%`;
    case 'Separation':
      return `${c.nomes?.[0] ?? 'spot'} ${pct(c.valores[0] ?? 1)}%`;
    case 'DeviceN':
      return `DeviceN (${(c.nomes ?? []).join(', ')})`;
    case 'Lab':
      return 'Lab';
    case 'Pattern':
      return 'padrão';
    default:
      return '';
  }
}

export { PDFName };
