import { PDFName, type PDFDict, type PDFObject } from 'pdf-lib';
import { corDe, resolverEspaco, type EspacoCor } from '../analise/cores';
import { lerFuncao, type Funcao } from '../analise/funcoes';
import { corDaImagem } from '../analise/interpretador';
import type { Cor } from '../analise/ir';
import type { Leitor } from '../analise/leitor';
import { ehIndexado } from './imagens';
import { tintaNaPlaca, type Placa } from './placas';

/**
 * Degradés (shadings) axiais e radiais. Para cada placa troca-se a cor do degradé por um cinzento
 * que representa a tinta dessa placa ao longo do degradé, guardado como função amostrada.
 */

export const AMOSTRAS = 256;

export interface DegradeLido {
  espaco: EspacoCor;
  /** Domínio do parâmetro t */
  dominio: [number, number];
  /** Componentes da cor em cada uma das AMOSTRAS posições de t */
  componentes: number[][];
  /** Representa "as tintas que este degradé pode pintar", para decidir o overprint */
  corSintetica: Cor;
}

export type ResultadoDegrade = { ok: DegradeLido } | { erro: string };

const NOMES_TIPO: Record<number, string> = {
  1: 'degradé por função',
  4: 'malha de degradé (tipo 4)',
  5: 'malha de degradé (tipo 5)',
  6: 'malha de degradé (tipo 6)',
  7: 'malha de degradé (tipo 7)',
};

export function lerDegrade(l: Leitor, obj: PDFObject | undefined, recursos: PDFDict | undefined): ResultadoDegrade {
  const d = l.dict(obj);
  if (!d) return { erro: 'degradé em falta' };
  const tipo = l.num(l.get(d, 'ShadingType'));
  if (tipo !== 2 && tipo !== 3) return { erro: NOMES_TIPO[tipo ?? 0] ?? 'degradé de tipo desconhecido' };
  const espaco = resolverEspaco(l, d.get(PDFName.of('ColorSpace')), recursos);
  if (espaco.familia === 'Pattern' || espaco.familia === 'Desconhecido') return { erro: 'degradé com espaço de cor desconhecido' };
  if (ehIndexado(l, d.get(PDFName.of('ColorSpace')))) return { erro: 'degradé Indexed' };

  const f = l.get(d, 'Function');
  const funcoes: (Funcao | null)[] = l.arr(f) ? l.itens(f).map((x) => lerFuncao(l, x)) : [lerFuncao(l, d.get(PDFName.of('Function')))];
  if (!funcoes.length || funcoes.some((x) => !x)) return { erro: 'degradé com função não suportada' };
  const dom = l.numeros(l.get(d, 'Domain'));
  const dominio: [number, number] = dom.length >= 2 && dom.every(Number.isFinite) ? [dom[0], dom[1]] : [0, 1];

  const componentes: number[][] = [];
  for (let k = 0; k < AMOSTRAS; k++) {
    const t = dominio[0] + ((dominio[1] - dominio[0]) * k) / (AMOSTRAS - 1);
    const comps = funcoes.length === 1 ? funcoes[0]!([t]) : funcoes.map((fn) => fn!([t])[0] ?? 0);
    componentes.push(comps);
  }
  return { ok: { espaco, dominio, componentes, corSintetica: corDaImagem(espaco) } };
}

/** Quantidade de tinta (0–255) desta placa em cada uma das AMOSTRAS posições do degradé */
export function tintasDoDegrade(dg: DegradeLido, placa: Placa): Uint8Array {
  const r = new Uint8Array(AMOSTRAS);
  for (let k = 0; k < AMOSTRAS; k++) r[k] = Math.round(255 * tintaNaPlaca(corDe(dg.espaco, dg.componentes[k]), placa));
  return r;
}

/** A cor de fundo (/Background) como tinta desta placa, ou undefined se não houver */
export function tintaDoFundo(l: Leitor, shading: PDFDict, dg: DegradeLido, placa: Placa): number | undefined {
  const bg = l.numeros(l.get(shading, 'Background'));
  if (!bg.length || bg.some(Number.isNaN)) return undefined;
  return tintaNaPlaca(corDe(dg.espaco, bg), placa);
}

