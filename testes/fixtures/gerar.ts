import { PDFDocument, PDFName, PDFNumber, degrees } from 'pdf-lib';
import { mmParaPt } from '../../src/comum/unidades';

/** [x, y, largura, altura] em mm, a partir do canto inferior esquerdo da página */
export type CaixaMmSpec = [number, number, number, number];

export interface PaginaSpec {
  /** MediaBox: largura x altura em mm, origem em 0,0 */
  mediaMm: [number, number];
  cropMm?: CaixaMmSpec;
  trimMm?: CaixaMmSpec;
  bleedMm?: CaixaMmSpec;
  rotacao?: 0 | 90 | 180 | 270;
  userUnit?: number;
}

const pt = (v: number) => mmParaPt(v);

/** Gera um PDF só com as caixas pedidas (sem conteúdo). */
export async function gerarPdf(paginas: PaginaSpec[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const spec of paginas) {
    const p = pdf.addPage([pt(spec.mediaMm[0]), pt(spec.mediaMm[1])]);
    if (spec.cropMm) p.setCropBox(pt(spec.cropMm[0]), pt(spec.cropMm[1]), pt(spec.cropMm[2]), pt(spec.cropMm[3]));
    if (spec.trimMm) p.setTrimBox(pt(spec.trimMm[0]), pt(spec.trimMm[1]), pt(spec.trimMm[2]), pt(spec.trimMm[3]));
    if (spec.bleedMm) p.setBleedBox(pt(spec.bleedMm[0]), pt(spec.bleedMm[1]), pt(spec.bleedMm[2]), pt(spec.bleedMm[3]));
    if (spec.rotacao) p.setRotation(degrees(spec.rotacao));
    if (spec.userUnit) p.node.set(PDFName.of('UserUnit'), PDFNumber.of(spec.userUnit));
  }
  return pdf.save();
}

/** A4 com TrimBox definida e 3 mm de sangria nos quatro lados */
export const A4_COM_SANGRIA: PaginaSpec = {
  mediaMm: [226, 313],
  trimMm: [8, 8, 210, 297],
  bleedMm: [5, 5, 216, 303],
};
