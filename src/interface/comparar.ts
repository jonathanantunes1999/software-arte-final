import type { PDFDocumentProxy } from 'pdfjs-dist';
import { canalCinzento, compor } from '../separacoes/compor';
import type { Placa } from '../separacoes/placas';
import { idLayerPdfjs } from './pdf';

/** Pixeis RGBA de uma vista da página, para comparar o antes e o depois */
export interface Pixeis {
  largura: number;
  altura: number;
  dados: Uint8ClampedArray;
}

/** Magenta, como as linhas de corte: destaca o que mudou */
export const COR_DIFERENCA: [number, number, number] = [224, 36, 94];

/**
 * Mapa de diferenças: onde os dois renders diferem (soma das diferenças de R, G e B acima do limiar)
 * pinta-se a magenta; o resto é o "antes" esbatido, para se perceber onde estamos.
 */
export function diferenca(a: Pixeis, b: Pixeis, limiar = 40): { pixeis: Pixeis; mudados: number; total: number } {
  const n = Math.min(a.largura * a.altura, b.largura * b.altura);
  const dados = new Uint8ClampedArray(a.largura * a.altura * 4);
  let mudados = 0;
  const mesmoTamanho = a.largura === b.largura && a.altura === b.altura;
  for (let i = 0; i < a.largura * a.altura; i++) {
    const o = i * 4;
    const dentro = mesmoTamanho && i < n;
    const d = dentro ? Math.abs(a.dados[o] - b.dados[o]) + Math.abs(a.dados[o + 1] - b.dados[o + 1]) + Math.abs(a.dados[o + 2] - b.dados[o + 2]) : 255 * 3;
    if (d > limiar) {
      mudados++;
      dados[o] = COR_DIFERENCA[0];
      dados[o + 1] = COR_DIFERENCA[1];
      dados[o + 2] = COR_DIFERENCA[2];
    } else {
      // o "antes" a 35% de intensidade
      dados[o] = 255 - (255 - a.dados[o]) * 0.35;
      dados[o + 1] = 255 - (255 - a.dados[o + 1]) * 0.35;
      dados[o + 2] = 255 - (255 - a.dados[o + 2]) * 0.35;
    }
    dados[o + 3] = 255;
  }
  return { pixeis: { largura: a.largura, altura: a.altura, dados }, mudados, total: a.largura * a.altura };
}

/** A página tal como o pdf.js a desenha (sem overprint) */
export async function pixeisNormais(
  doc: PDFDocumentProxy,
  pagina: number,
  escala: number,
  dpr: number,
  sobreposicoes: Record<string, boolean>,
  cancelado: () => boolean,
): Promise<Pixeis | null> {
  const pg = await doc.getPage(pagina + 1);
  if (cancelado()) return null;
  const vp = pg.getViewport({ scale: escala });
  const largura = Math.floor(vp.width * dpr);
  const altura = Math.floor(vp.height * dpr);
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const c2 = tela.getContext('2d', { willReadFrequently: true })!;
  c2.fillStyle = '#ffffff';
  c2.fillRect(0, 0, largura, altura);
  const layers = await doc.getOptionalContentConfig();
  for (const [tag, visivel] of Object.entries(sobreposicoes)) {
    const id = idLayerPdfjs(tag);
    if (layers.getGroup(id)) layers.setVisibility(id, visivel);
  }
  try {
    await pg.render({
      canvas: tela,
      canvasContext: c2,
      viewport: vp,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      optionalContentConfigPromise: Promise.resolve(layers),
      annotationMode: 0,
    }).promise;
  } catch {
    return null;
  }
  if (cancelado()) return null;
  return { largura, altura, dados: c2.getImageData(0, 0, largura, altura).data };
}

/** As placas desenhadas e compostas (com overprint, se foi simulado ao montá-las) */
export async function pixeisSeparados(
  sep: { doc: PDFDocumentProxy; placas: Placa[] },
  escala: number,
  dpr: number,
  escondidas: Record<string, boolean>,
  cancelado: () => boolean,
): Promise<Pixeis | null> {
  const dados: Uint8Array[] = [];
  let largura = 0;
  let altura = 0;
  const tela = document.createElement('canvas');
  for (let k = 0; k < sep.placas.length; k++) {
    const pg = await sep.doc.getPage(k + 1);
    if (cancelado()) return null;
    const vp = pg.getViewport({ scale: escala });
    largura = Math.floor(vp.width * dpr);
    altura = Math.floor(vp.height * dpr);
    tela.width = largura;
    tela.height = altura;
    const c2 = tela.getContext('2d', { willReadFrequently: true })!;
    c2.fillStyle = '#ffffff';
    c2.fillRect(0, 0, largura, altura);
    try {
      await pg.render({ canvas: tela, canvasContext: c2, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined, annotationMode: 0 }).promise;
    } catch {
      return null;
    }
    if (cancelado()) return null;
    dados.push(canalCinzento(c2.getImageData(0, 0, largura, altura).data));
  }
  const visiveis = sep.placas.map((p, i) => ({ p, i })).filter(({ p }) => !escondidas[p.id]);
  return { largura, altura, dados: compor(visiveis.map(({ p, i }) => ({ dados: dados[i], cor: p.rgb })), largura, altura) };
}
