import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFString, degrees } from 'pdf-lib';
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

// ---------------------------------------------------------------------------
// PDFs com content stream escrito à mão: permitem fabricar exatamente o problema
// que cada alerta deve detetar (ex.: "/GS0 gs 0 0 0 0 k" para branco em overprint).
// ---------------------------------------------------------------------------

export const mm = (v: number) => (v * 72) / 25.4;

export type FonteSpec =
  | { tipo: 'padrao'; nome?: string } // Helvetica sem FontDescriptor: NÃO incorporada
  | { tipo: 'incorporada'; nome?: string; larguras?: number[]; primeiro?: number; ascent?: number; descent?: number }
  | { tipo: 'sem-ficheiro'; nome?: string } // tem FontDescriptor mas sem FontFile: NÃO incorporada
  | { tipo: 'type0'; nome?: string; incorporada: boolean; dw?: number; w?: unknown[] }
  | { tipo: 'type3' };

export type EspacoSpec =
  | { tipo: 'separation'; nome: string; alt?: 'CMYK' | 'Gray' }
  | { tipo: 'devicen'; nomes: string[] }
  | { tipo: 'icc'; n: 1 | 3 | 4 }
  | { tipo: 'lab' };

export interface ImagemSpec {
  larguraPx: number;
  alturaPx: number;
  espaco: 'Gray' | 'RGB' | 'CMYK' | { separation: string };
  mascara?: boolean;
}

export interface FormSpec {
  conteudo: string;
  bbox?: [number, number, number, number];
  matriz?: [number, number, number, number, number, number];
  fontes?: Record<string, FonteSpec>;
  /** Se verdadeiro, o Form não tem /Resources e herda os da página */
  herdaRecursos?: boolean;
}

export interface PaginaRaw extends PaginaSpec {
  /** Content stream. Um array vira vários streams. */
  conteudo: string | string[];
  fontes?: Record<string, FonteSpec>;
  espacos?: Record<string, EspacoSpec>;
  estados?: Record<string, { OP?: boolean; op?: boolean; OPM?: number; ca?: number; CA?: number }>;
  /** Layers (Optional Content), referenciadas em /Properties */
  camadas?: Record<string, { nome: string; oculta?: boolean }>;
  imagens?: Record<string, ImagemSpec>;
  formularios?: Record<string, FormSpec>;
}

function criarFonte(pdf: PDFDocument, spec: FonteSpec): PDFRef {
  const ctx = pdf.context;
  const stub = () => ctx.register(ctx.stream(new Uint8Array([0, 1, 2, 3])));
  switch (spec.tipo) {
    case 'padrao':
      return ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: spec.nome ?? 'Helvetica' }));
    case 'sem-ficheiro': {
      const desc = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: spec.nome ?? 'Arial', Flags: 32, Ascent: 900, Descent: -200 }));
      return ctx.register(ctx.obj({ Type: 'Font', Subtype: 'TrueType', BaseFont: spec.nome ?? 'Arial', FontDescriptor: desc }));
    }
    case 'incorporada': {
      const desc = ctx.register(
        ctx.obj({ Type: 'FontDescriptor', FontName: spec.nome ?? 'ABCDEF+MinhaFonte', Flags: 32, Ascent: spec.ascent ?? 800, Descent: spec.descent ?? -200, FontFile2: stub() }),
      );
      const d: Record<string, unknown> = { Type: 'Font', Subtype: 'TrueType', BaseFont: spec.nome ?? 'ABCDEF+MinhaFonte', FontDescriptor: desc };
      if (spec.larguras) {
        d.FirstChar = spec.primeiro ?? 0;
        d.LastChar = (spec.primeiro ?? 0) + spec.larguras.length - 1;
        d.Widths = spec.larguras;
      }
      return ctx.register(ctx.obj(d as never));
    }
    case 'type0': {
      const nome = spec.nome ?? 'ABCDEF+FonteCID';
      const desc = ctx.register(
        ctx.obj({
          Type: 'FontDescriptor',
          FontName: nome,
          Flags: 4,
          Ascent: 800,
          Descent: -200,
          ...(spec.incorporada ? { FontFile3: stub() } : {}),
        } as never),
      );
      const desc2: Record<string, unknown> = { Type: 'Font', Subtype: 'CIDFontType0', BaseFont: nome, FontDescriptor: desc, DW: spec.dw ?? 1000 };
      if (spec.w) desc2.W = spec.w;
      const cid = ctx.register(ctx.obj(desc2 as never));
      return ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: nome, Encoding: 'Identity-H', DescendantFonts: [cid] }));
    }
    case 'type3':
      return ctx.register(
        ctx.obj({ Type: 'Font', Subtype: 'Type3', FontBBox: [0, 0, 1000, 1000], FontMatrix: [0.001, 0, 0, 0.001, 0, 0], CharProcs: {}, Encoding: {}, FirstChar: 0, LastChar: 0, Widths: [1000] }),
      );
  }
}

function criarEspaco(pdf: PDFDocument, spec: EspacoSpec): PDFRef | unknown[] {
  const ctx = pdf.context;
  const tint = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [0, 1, 1, 0], N: 1 }));
  switch (spec.tipo) {
    case 'separation':
      return ctx.register(ctx.obj(['Separation', spec.nome, spec.alt === 'Gray' ? 'DeviceGray' : 'DeviceCMYK', tint] as never));
    case 'devicen':
      return ctx.register(ctx.obj(['DeviceN', spec.nomes, 'DeviceCMYK', tint] as never));
    case 'icc': {
      const perfil = ctx.register(ctx.stream(new Uint8Array(16), { N: spec.n }));
      return ctx.register(ctx.obj(['ICCBased', perfil] as never));
    }
    case 'lab':
      return ctx.register(ctx.obj(['Lab', { WhitePoint: [0.95, 1, 1.09] }] as never));
  }
}

function criarImagem(pdf: PDFDocument, spec: ImagemSpec): PDFRef {
  const ctx = pdf.context;
  const d: Record<string, unknown> = { Type: 'XObject', Subtype: 'Image', Width: spec.larguraPx, Height: spec.alturaPx, BitsPerComponent: spec.mascara ? 1 : 8 };
  if (spec.mascara) d.ImageMask = true;
  else if (typeof spec.espaco === 'object') {
    const tint = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [0, 1, 1, 0], N: 1 }));
    d.ColorSpace = ['Separation', spec.espaco.separation, 'DeviceCMYK', tint];
  } else d.ColorSpace = spec.espaco === 'Gray' ? 'DeviceGray' : spec.espaco === 'RGB' ? 'DeviceRGB' : 'DeviceCMYK';
  return ctx.register(ctx.stream(new Uint8Array(4), d as never));
}

/** Gera um PDF de uma ou mais páginas com conteúdo e recursos escritos à mão. */
export async function gerarPdfRaw(paginas: PaginaRaw[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const ctx = pdf.context;

  for (const spec of paginas) {
    const p = pdf.addPage([mm(spec.mediaMm[0]), mm(spec.mediaMm[1])]);
    if (spec.cropMm) p.setCropBox(mm(spec.cropMm[0]), mm(spec.cropMm[1]), mm(spec.cropMm[2]), mm(spec.cropMm[3]));
    if (spec.trimMm) p.setTrimBox(mm(spec.trimMm[0]), mm(spec.trimMm[1]), mm(spec.trimMm[2]), mm(spec.trimMm[3]));
    if (spec.bleedMm) p.setBleedBox(mm(spec.bleedMm[0]), mm(spec.bleedMm[1]), mm(spec.bleedMm[2]), mm(spec.bleedMm[3]));
    if (spec.rotacao) p.setRotation(degrees(spec.rotacao));

    const recursos: Record<string, Record<string, unknown>> = {};
    const poe = (cat: string, nome: string, valor: unknown) => ((recursos[cat] ??= {})[nome] = valor);

    for (const [n, f] of Object.entries(spec.fontes ?? {})) poe('Font', n, criarFonte(pdf, f));
    for (const [n, e] of Object.entries(spec.espacos ?? {})) poe('ColorSpace', n, criarEspaco(pdf, e));
    for (const [n, g] of Object.entries(spec.estados ?? {})) poe('ExtGState', n, ctx.register(ctx.obj({ Type: 'ExtGState', ...g } as never)));
    for (const [n, c] of Object.entries(spec.imagens ?? {})) poe('XObject', n, criarImagem(pdf, c));
    for (const [n, c] of Object.entries(spec.camadas ?? {})) poe('Properties', n, ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of(c.nome) } as never)));

    for (const [n, f] of Object.entries(spec.formularios ?? {})) {
      const d: Record<string, unknown> = { Type: 'XObject', Subtype: 'Form', BBox: f.bbox ?? [0, 0, 10000, 10000] };
      if (f.matriz) d.Matrix = f.matriz;
      if (!f.herdaRecursos) {
        const fr: Record<string, Record<string, unknown>> = {};
        for (const [fn, fs] of Object.entries(f.fontes ?? {})) (fr.Font ??= {})[fn] = criarFonte(pdf, fs);
        d.Resources = fr;
      }
      poe('XObject', n, ctx.register(ctx.stream(f.conteudo, d as never)));
    }

    const dictRecursos = ctx.obj(recursos as never);
    p.node.set(PDFName.of('Resources'), dictRecursos);

    const partes = Array.isArray(spec.conteudo) ? spec.conteudo : [spec.conteudo];
    for (const c of partes) p.node.addContentStream(ctx.register(ctx.stream(c)));
  }

  // Layers ocultas por omissão
  const todas: PDFRef[] = [];
  const ocultas: PDFRef[] = [];
  pdf.getPages().forEach((p, i) => {
    const props = p.node.Resources()?.lookupMaybe(PDFName.of('Properties'), PDFDict);
    if (!props) return;
    for (const [nome, ref] of props.entries()) {
      if (!(ref instanceof PDFRef)) continue;
      todas.push(ref);
      const spec = Object.entries(paginas[i].camadas ?? {}).find(([k]) => k === nome.decodeText().replace(/^\//, ''));
      if (spec?.[1].oculta) ocultas.push(ref);
    }
  });
  if (todas.length) {
    pdf.catalog.set(PDFName.of('OCProperties'), ctx.obj({ OCGs: todas, D: { OFF: ocultas } } as never));
  }

  return pdf.save();
}

export { PDFArray };
