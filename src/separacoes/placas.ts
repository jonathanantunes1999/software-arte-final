import { cmykParaRgb, labParaRgb, type Rgb } from '../analise/amostra';
import type { Cor } from '../analise/ir';

/**
 * Placas (chapas) de impressão: as quatro de processo e uma por cada spot.
 * Aqui está a regra de "que tinta leva cada placa" para uma cor, e se um objeto em overprint
 * deixa a placa em paz ou a apaga.
 */

export interface Placa {
  /** 'C', 'M', 'Y', 'K' ou 'spot:<nome>' */
  id: string;
  tipo: 'processo' | 'spot';
  nome: string;
  /** Cor da tinta a 100%, para pintar a placa no ecrã */
  rgb: Rgb;
}

export const PLACAS_PROCESSO: Placa[] = [
  { id: 'C', tipo: 'processo', nome: 'Ciano', rgb: cmykParaRgb(1, 0, 0, 0) },
  { id: 'M', tipo: 'processo', nome: 'Magenta', rgb: cmykParaRgb(0, 1, 0, 0) },
  { id: 'Y', tipo: 'processo', nome: 'Amarelo', rgb: cmykParaRgb(0, 0, 1, 0) },
  { id: 'K', tipo: 'processo', nome: 'Preto', rgb: [35, 31, 32] },
];

const INDICE_PROCESSO: Record<string, number> = { C: 0, M: 1, Y: 2, K: 3 };

export const idSpot = (nome: string): string => `spot:${nome}`;

/** Paleta para spots sem cor alternativa que se consiga ler (cores bem distintas das de processo) */
const PALETA_SPOTS: Rgb[] = [
  [255, 120, 0],
  [120, 60, 200],
  [0, 160, 90],
  [200, 0, 90],
  [0, 130, 160],
  [140, 110, 0],
];

export function corDeSpotPorOmissao(indice: number): Rgb {
  return PALETA_SPOTS[indice % PALETA_SPOTS.length];
}

const NOMES_PROCESSO: Record<string, string> = { cyan: 'C', magenta: 'M', yellow: 'Y', black: 'K' };

/** "Cyan", "Magenta", "Yellow", "Black" (em Separation ou DeviceN) são as placas de processo */
export function placaDeProcessoPorNome(nome: string): string | undefined {
  return NOMES_PROCESSO[nome.trim().toLowerCase()];
}

const ehTodas = (nome: string) => nome.trim().toLowerCase() === 'all';
const ehNenhuma = (nome: string) => nome.trim().toLowerCase() === 'none';

/** Id da placa que um nome de tinta designa: processo, spot, ou 'todas' / 'nenhuma' */
export function placaDoNome(nome: string): string {
  const p = placaDeProcessoPorNome(nome);
  if (p) return p;
  if (ehTodas(nome)) return '*';
  if (ehNenhuma(nome)) return '-';
  return idSpot(nome.trim());
}

/** RGB (0–1) → CMYK sem perfis: serve para pôr imagens e cores RGB numa placa de processo */
export function rgbParaCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 1];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k];
}

const lim01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** Tintas de processo (C, M, Y, K, de 0 a 1) que uma cor de processo ou RGB/Lab/cinzento dá. */
function processoDe(cor: Cor): [number, number, number, number] | undefined {
  const v = cor.valores;
  switch (cor.familia) {
    case 'CMYK':
      return v.length === 4 ? [v[0], v[1], v[2], v[3]] : undefined;
    case 'Gray':
      return v.length === 1 ? [0, 0, 0, 1 - v[0]] : undefined;
    case 'RGB':
      return v.length === 3 ? rgbParaCmyk(v[0], v[1], v[2]) : undefined;
    case 'Lab': {
      if (v.length !== 3) return undefined;
      const [r, g, b] = labParaRgb(v[0], v[1], v[2]);
      return rgbParaCmyk(r / 255, g / 255, b / 255);
    }
    default:
      return undefined;
  }
}

/** Pares nome → tinta de uma cor Separation/DeviceN */
function tintasNomeadas(cor: Cor): { nome: string; tinta: number }[] {
  const nomes = cor.nomes ?? [];
  return nomes.map((nome, i) => ({ nome, tinta: lim01(cor.valores[i] ?? 0) }));
}

/** Quantidade de tinta (0–1) que a cor leva nesta placa. Placas que a cor não usa levam 0. */
export function tintaNaPlaca(cor: Cor, placa: Placa): number {
  if (cor.familia === 'Separation' || cor.familia === 'DeviceN') {
    let t = 0;
    for (const { nome, tinta } of tintasNomeadas(cor)) {
      const alvo = placaDoNome(nome);
      if (alvo === '*' || alvo === placa.id) t = Math.max(t, tinta);
    }
    return t;
  }
  const p = processoDe(cor);
  if (!p || placa.tipo !== 'processo') return 0;
  return lim01(p[INDICE_PROCESSO[placa.id]]);
}

/**
 * A cor "marca" esta placa? Só importa com overprint: sem overprint, tudo o que se pinta apaga o que
 * estava por baixo em todas as placas (marcar a zero também apaga). Com overprint, o objeto só mexe
 * nas placas das tintas que usa; nas outras deixa o que lá estava.
 *
 * Em CMYK (e cinzento) o modo 1 de overprint (OPM) ainda exclui as componentes a zero.
 * RGB, Lab e padrões não têm overprint: apagam sempre.
 */
export function marcaPlaca(cor: Cor, placa: Placa, overprint: boolean, modo: 0 | 1): boolean {
  if (!overprint) return true;
  switch (cor.familia) {
    case 'CMYK':
    case 'Gray': {
      if (placa.tipo !== 'processo') return false;
      return modo === 1 ? tintaNaPlaca(cor, placa) > 0 : true;
    }
    case 'Separation':
    case 'DeviceN': {
      const t = tintasNomeadas(cor);
      return t.some(({ nome, tinta }) => {
        const alvo = placaDoNome(nome);
        return (alvo === '*' || alvo === placa.id) && tinta > 0;
      });
    }
    default:
      return true;
  }
}

/** A cor não deixa marca nenhuma (Separation /None, ou todas as tintas a zero com overprint) */
export function corInvisivel(cor: Cor): boolean {
  return (cor.familia === 'Separation' || cor.familia === 'DeviceN') && (cor.nomes ?? []).length > 0 && (cor.nomes ?? []).every(ehNenhuma);
}

/** Nomes de spots de uma cor (sem processo, All e None) */
export function spotsDaCor(cor: Cor | undefined): string[] {
  if (!cor || (cor.familia !== 'Separation' && cor.familia !== 'DeviceN')) return [];
  return (cor.nomes ?? []).map((n) => n.trim()).filter((n) => n && placaDoNome(n).startsWith('spot:'));
}
