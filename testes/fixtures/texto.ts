import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName } from 'pdf-lib';

const ler = (f: string) => new Uint8Array(readFileSync(new URL(`./fontes/${f}`, import.meta.url)));

/** Larguras dos glifos das fontes de teste (A, B, O, C e espaço), em milésimos */
export const LARGURAS: Record<number, number> = { 0x20: 300, 0x41: 700, 0x42: 600, 0x4f: 750, 0x43: 650 };

export type FonteTeste =
  | 'ttf' // TrueType simples, WinAnsiEncoding
  | 'cff' // Type1C simples, WinAnsiEncoding
  | 'otf' // OpenType (CFF) simples
  | 'cid' // Type0 Identity-H sobre TrueType
  | 'nao-incorporada'
  | 'type1';

export interface PaginaTexto {
  conteudo: string;
  fontes?: Record<string, FonteTeste>;
  /** Form XObjects com os seus recursos (o nome é o do recurso) */
  formularios?: Record<string, { conteudo: string; fontes?: Record<string, FonteTeste> }>;
}

/** Cria um PDF com uma ou mais páginas de 300×300 pt com texto nas fontes de teste */
export async function pdfComTexto(paginas: PaginaTexto[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const ctx = pdf.context;
  const cache = new Map<string, ReturnType<typeof ctx.register>>();
  /** Forms iguais (mesmo nome e conteúdo) em várias páginas são o mesmo objeto */
  const formsPartilhados = new Map<string, ReturnType<typeof ctx.register>>();

  const fonte = (tipo: FonteTeste) => {
    const c = cache.get(tipo);
    if (c) return c;
    const larg: number[] = [];
    for (let i = 32; i <= 90; i++) larg.push(LARGURAS[i] ?? 500);
    const simples = { Type: 'Font', BaseFont: 'ABCDEF+Teste', FirstChar: 32, LastChar: 90, Widths: larg };
    let ref;
    if (tipo === 'ttf') {
      const d = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: 'ABCDEF+Teste', Flags: 32, Ascent: 800, Descent: -200, FontFile2: ctx.register(ctx.stream(ler('teste.ttf'))) } as never));
      ref = ctx.register(ctx.obj({ ...simples, Subtype: 'TrueType', Encoding: 'WinAnsiEncoding', FontDescriptor: d } as never));
    } else if (tipo === 'cff') {
      const d = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: 'ABCDEF+TesteCff', Flags: 32, Ascent: 800, Descent: -200, FontFile3: ctx.register(ctx.stream(ler('teste.cff'), { Subtype: 'Type1C' } as never)) } as never));
      ref = ctx.register(ctx.obj({ ...simples, BaseFont: 'ABCDEF+TesteCff', Subtype: 'Type1', Encoding: 'WinAnsiEncoding', FontDescriptor: d } as never));
    } else if (tipo === 'otf') {
      const d = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: 'ABCDEF+TesteOtf', Flags: 32, Ascent: 800, Descent: -200, FontFile3: ctx.register(ctx.stream(ler('teste.otf'), { Subtype: 'OpenType' } as never)) } as never));
      ref = ctx.register(ctx.obj({ ...simples, BaseFont: 'ABCDEF+TesteOtf', Subtype: 'Type1', Encoding: 'WinAnsiEncoding', FontDescriptor: d } as never));
    } else if (tipo === 'cid') {
      const d = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: 'ABCDEF+TesteCid', Flags: 4, Ascent: 800, Descent: -200, FontFile2: ctx.register(ctx.stream(ler('teste.ttf'))) } as never));
      // CID = glifo: 2 = A, 3 = B, 4 = O, 5 = C, 1 = espaço
      const desc = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'CIDFontType2', BaseFont: 'ABCDEF+TesteCid', CIDToGIDMap: 'Identity', FontDescriptor: d, DW: 500, W: [1, [300, 700, 600, 750, 650]] } as never));
      ref = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'ABCDEF+TesteCid', Encoding: 'Identity-H', DescendantFonts: [desc] } as never));
    } else if (tipo === 'type1') {
      const d = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: 'ABCDEF+TesteT1', Flags: 32, Ascent: 800, Descent: -200, FontFile: ctx.register(ctx.stream(new Uint8Array(8))) } as never));
      ref = ctx.register(ctx.obj({ ...simples, BaseFont: 'ABCDEF+TesteT1', Subtype: 'Type1', Encoding: 'WinAnsiEncoding', FontDescriptor: d } as never));
    } else {
      ref = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', FirstChar: 32, LastChar: 90, Widths: larg } as never));
    }
    cache.set(tipo, ref);
    return ref;
  };

  const recursosDe = (fontes: Record<string, FonteTeste> = {}) => {
    const f: Record<string, unknown> = {};
    for (const [n, t] of Object.entries(fontes)) f[n] = fonte(t);
    return f;
  };

  for (const p of paginas) {
    const pg = pdf.addPage([300, 300]);
    const xo: Record<string, unknown> = {};
    for (const [n, f] of Object.entries(p.formularios ?? {})) {
      const chave = `${n}|${f.conteudo}`;
      let ref = formsPartilhados.get(chave);
      if (!ref) {
        ref = ctx.register(ctx.stream(f.conteudo, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 300, 300], Resources: { Font: recursosDe(f.fontes) } } as never));
        formsPartilhados.set(chave, ref);
      }
      xo[n] = ref;
    }
    pg.node.set(PDFName.of('Resources'), ctx.obj({ Font: recursosDe(p.fontes), XObject: xo } as never));
    pg.node.addContentStream(ctx.register(ctx.stream(p.conteudo)));
  }
  return pdf.save();
}
