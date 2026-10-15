import { PDFArray, PDFHexString, PDFName, PDFRawStream, PDFStream, PDFString, type PDFDict, type PDFObject } from 'pdf-lib';
import { resolverEspaco, corDe, type EspacoCor } from '../analise/cores';
import type { Leitor } from '../analise/leitor';
import { JpegImage } from '../vendor/jpeg-decoder.js';
import { placaDoNome, rgbParaCmyk, tintaNaPlaca, type Placa } from './placas';

/**
 * Separa uma imagem em planos de tinta, um por placa. Cada plano tem um byte por pixel (0 = sem
 * tinta, 255 = tinta a 100%) e as dimensões da imagem, ou da imagem reduzida se for enorme.
 */

export interface PlanosImagem {
  largura: number;
  altura: number;
  /** Plano de tinta de cada placa; as placas que a imagem não toca não aparecem */
  planos: Map<string, Uint8Array>;
}

export type ResultadoImagem = { ok: PlanosImagem } | { erro: string };

/** Acima disto reduz-se a imagem (lado a lado) antes de a separar */
const MAX_PIXEIS = 16_000_000;
/** Acima disto nem se tenta */
const MAX_PIXEIS_ABSOLUTO = 200_000_000;

const FILTROS_NAO_SUPORTADOS = new Set(['JPXDecode', 'CCITTFaxDecode', 'JBIG2Decode']);

/** A imagem é cinzento simples (DeviceGray, CalGray, ICC de 1 componente)? Esse caso não precisa de ser descodificado. */
export function ehImagemCinzento(l: Leitor, xo: PDFStream, recursos: PDFDict | undefined): boolean {
  const cs = xo.dict.get(PDFName.of('ColorSpace'));
  if (!cs) return false;
  if (ehIndexado(l, cs)) return false;
  const e = resolverEspaco(l, cs, recursos);
  return e.familia === 'Gray';
}

function ehIndexado(l: Leitor, cs: PDFObject): boolean {
  const itens = l.itens(cs);
  const n = l.nome(itens[0]);
  return n === 'Indexed' || n === 'I';
}

function filtrosDe(l: Leitor, xo: PDFStream): string[] {
  const f = l.get(xo.dict, 'Filter');
  const lista = l.arr(f) ? l.itens(f) : f ? [f] : [];
  return lista.map((x) => l.nome(x) ?? '');
}

/** Bytes das amostras, depois de descomprimir. Para JPEG devolve os componentes descodificados. */
function amostrasBrutas(l: Leitor, xo: PDFStream, largura: number, altura: number, ncomp: number): { dados: Uint8Array; bits: number } | { erro: string } {
  const filtros = filtrosDe(l, xo);
  const ultimo = filtros[filtros.length - 1];
  if (ultimo && FILTROS_NAO_SUPORTADOS.has(ultimo)) return { erro: ultimo === 'JPXDecode' ? 'JPEG 2000' : ultimo === 'CCITTFaxDecode' ? 'CCITT' : 'JBIG2' };
  if (ultimo === 'DCTDecode') {
    if (filtros.length > 1) return { erro: 'JPEG com filtros extra' };
    try {
      const bytes = xo instanceof PDFRawStream ? xo.contents : xo.getContents();
      const j = new JpegImage();
      j.opts = { tolerantDecoding: true, maxResolutionInMP: 100 } as never;
      JpegImage.resetMaxMemoryUsage(768 * 1024 * 1024);
      j.parse(bytes);
      if (j.width !== largura || j.height !== altura) return { erro: 'JPEG com dimensões diferentes das do PDF' };
      const comps = j.components.length;
      if (comps !== ncomp) return { erro: `JPEG com ${comps} componentes (o espaço de cor pede ${ncomp})` };
      return { dados: j.getData(largura, altura), bits: 8 };
    } catch (e) {
      return { erro: `JPEG ilegível (${(e as Error).message})` };
    }
  }
  try {
    return { dados: l.bytes(xo), bits: l.num(l.get(xo.dict, 'BitsPerComponent')) ?? 8 };
  } catch (e) {
    return { erro: `não consegui descomprimir (${(e as Error).message})` };
  }
}

/** Valor inteiro de cada amostra (uma por componente), por pixel e por componente */
function desempacotar(dados: Uint8Array, bits: number, largura: number, altura: number, ncomp: number): Uint8Array | Uint16Array | null {
  const total = largura * altura * ncomp;
  if (bits === 8) return dados.length < total ? null : dados; // sem cópia: pode ser muito grande
  const r = new Uint16Array(total);
  if (bits === 16) {
    if (dados.length < total * 2) return null;
    for (let i = 0; i < total; i++) r[i] = (dados[2 * i] << 8) | dados[2 * i + 1];
    return r;
  }
  if (![1, 2, 4].includes(bits)) return null;
  // as linhas começam sempre num byte novo
  const bytesPorLinha = Math.ceil((largura * ncomp * bits) / 8);
  if (dados.length < bytesPorLinha * altura) return null;
  const mascara = (1 << bits) - 1;
  let k = 0;
  for (let y = 0; y < altura; y++) {
    const base = y * bytesPorLinha;
    for (let i = 0; i < largura * ncomp; i++) {
      const bit = i * bits;
      r[k++] = (dados[base + (bit >> 3)] >> (8 - bits - (bit & 7))) & mascara;
    }
  }
  return r;
}

/** Palette de uma imagem Indexed: tabela de índice → componentes (0–1) do espaço base */
function lerPaleta(l: Leitor, cs: PDFObject, recursos: PDFDict | undefined): { base: EspacoCor; entradas: number[][] } | null {
  const itens = l.itens(cs);
  const base = resolverEspaco(l, (cs as PDFArray).get(1), recursos);
  const hival = l.num(itens[2]);
  const tabela = itens[3];
  if (hival === undefined || !tabela || base.n < 1) return null;
  let bytes: Uint8Array;
  try {
    bytes = tabela instanceof PDFStream ? l.bytes(tabela) : textoParaBytes(tabela);
  } catch {
    return null;
  }
  const n = hival + 1;
  if (bytes.length < n * base.n) return null;
  const entradas: number[][] = [];
  for (let i = 0; i < n; i++) entradas.push(Array.from(bytes.subarray(i * base.n, (i + 1) * base.n), (v) => v / 255));
  return { base, entradas };
}

function textoParaBytes(o: PDFObject): Uint8Array {
  if (o instanceof PDFHexString || o instanceof PDFString) return o.asBytes();
  throw new Error('paleta ilegível');
}

export function separarImagem(l: Leitor, xo: PDFStream, recursos: PDFDict | undefined, placas: Placa[], opcoes: { maxPixeis?: number } = {}): ResultadoImagem {
  const d = xo.dict;
  const largura = l.num(l.get(d, 'Width')) ?? 0;
  const altura = l.num(l.get(d, 'Height')) ?? 0;
  if (largura < 1 || altura < 1) return { erro: 'imagem sem dimensões' };
  if (largura * altura > MAX_PIXEIS_ABSOLUTO) return { erro: 'imagem enorme' };

  const csRaw = d.get(PDFName.of('ColorSpace'));
  const cs = l.res(csRaw);
  if (!cs) return { erro: 'imagem sem espaço de cor' };
  const indexado = ehIndexado(l, cs);
  const paleta = indexado ? lerPaleta(l, cs, recursos) : null;
  if (indexado && !paleta) return { erro: 'paleta (Indexed) ilegível' };
  const espaco: EspacoCor = paleta ? paleta.base : resolverEspaco(l, cs, recursos);
  if (espaco.familia === 'Lab' || espaco.familia === 'Desconhecido' || espaco.familia === 'Pattern') {
    return { erro: espaco.familia === 'Lab' ? 'espaço Lab' : 'espaço de cor desconhecido' };
  }
  const ncomp = indexado ? 1 : espaco.n;

  const brutas = amostrasBrutas(l, xo, largura, altura, ncomp);
  if ('erro' in brutas) return brutas;
  const inteiros = desempacotar(brutas.dados, brutas.bits, largura, altura, ncomp);
  if (!inteiros) return { erro: 'dados da imagem incompletos' };
  const maximo = Math.pow(2, Math.min(brutas.bits, 16)) - 1;

  // /Decode: pares [min max] por componente (nos Indexed aplica-se ao índice)
  const decodeArr = l.get(d, 'Decode') ? l.numeros(l.get(d, 'Decode')) : [];
  const dec = (c: number): [number, number] => {
    const lo = decodeArr[2 * c];
    const hi = decodeArr[2 * c + 1];
    if (Number.isFinite(lo) && Number.isFinite(hi)) return [lo, hi];
    return indexado ? [0, maximo] : [0, 1];
  };

  // redução de imagens enormes: amostragem por saltos, sem filtro (é só para ver)
  const passo = Math.max(1, Math.ceil(Math.sqrt((largura * altura) / (opcoes.maxPixeis ?? MAX_PIXEIS))));
  const L = Math.ceil(largura / passo);
  const A = Math.ceil(altura / passo);
  const n = L * A;

  const planos = new Map<string, Uint8Array>();
  const plano = (id: string): Uint8Array => {
    let p = planos.get(id);
    if (!p) planos.set(id, (p = new Uint8Array(n)));
    return p;
  };
  const idsPlacas = new Set(placas.map((p) => p.id));
  const normal = (c: number, v: number) => {
    const [lo, hi] = dec(c);
    const x = lo + (v / maximo) * (hi - lo);
    return x < 0 ? 0 : x > 1 ? 1 : x;
  };
  const para255 = (x: number) => Math.round(x * 255);
  const indicePixel = (px: number, py: number) => py * passo * largura + px * passo;

  if (paleta) {
    // tabela índice → tinta por placa, calculada uma vez
    const tabelaTintas = new Map<string, Uint8Array>();
    const nEnt = paleta.entradas.length;
    for (const pl of placas) {
      const t = new Uint8Array(nEnt);
      for (let i = 0; i < nEnt; i++) t[i] = para255(tintaNaPlaca(corDe(paleta.base, paleta.entradas[i].slice(0, paleta.base.n)), pl));
      if (t.some((v) => v > 0)) tabelaTintas.set(pl.id, t);
    }
    for (const [id, t] of tabelaTintas) {
      const p = plano(id);
      for (let y = 0; y < A; y++) {
        for (let x = 0; x < L; x++) {
          const [lo, hi] = dec(0);
          const idx = Math.round(lo + (inteiros[indicePixel(x, y)] / maximo) * (hi - lo));
          p[y * L + x] = t[Math.min(Math.max(idx, 0), nEnt - 1)];
        }
      }
    }
    return { ok: { largura: L, altura: A, planos } };
  }

  switch (espaco.familia) {
    case 'CMYK': {
      for (let c = 0; c < 4; c++) {
        const p = plano('CMYK'[c]);
        for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) p[y * L + x] = para255(normal(c, inteiros[indicePixel(x, y) * 4 + c]));
      }
      break;
    }
    case 'Gray': {
      const p = plano('K');
      for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) p[y * L + x] = para255(1 - normal(0, inteiros[indicePixel(x, y)]));
      break;
    }
    case 'RGB': {
      const pc = plano('C');
      const pm = plano('M');
      const py = plano('Y');
      const pk = plano('K');
      for (let y = 0; y < A; y++) {
        for (let x = 0; x < L; x++) {
          const i = indicePixel(x, y) * 3;
          const [c, m, ye, k] = rgbParaCmyk(normal(0, inteiros[i]), normal(1, inteiros[i + 1]), normal(2, inteiros[i + 2]));
          const o = y * L + x;
          pc[o] = para255(c);
          pm[o] = para255(m);
          py[o] = para255(ye);
          pk[o] = para255(k);
        }
      }
      break;
    }
    case 'Separation':
    case 'DeviceN': {
      const nomes = espaco.nomes ?? [];
      for (let c = 0; c < ncomp; c++) {
        const alvo = placaDoNome(nomes[c] ?? '');
        const ids = alvo === '*' ? [...idsPlacas] : [alvo];
        for (const id of ids) {
          if (!idsPlacas.has(id)) continue;
          const p = plano(id);
          for (let y = 0; y < A; y++) {
            for (let x = 0; x < L; x++) {
              const v = para255(normal(c, inteiros[indicePixel(x, y) * ncomp + c]));
              const o = y * L + x;
              if (v > p[o]) p[o] = v;
            }
          }
        }
      }
      break;
    }
    default:
      return { erro: 'espaço de cor não suportado' };
  }

  // planos todos a zero não servem para nada
  for (const [id, p] of planos) if (!p.some((v) => v > 0) || !idsPlacas.has(id)) planos.delete(id);
  return { ok: { largura: L, altura: A, planos } };
}
