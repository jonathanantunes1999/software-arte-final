import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, type PDFPage } from 'pdf-lib';
import { medirPagina, normalizarCaixa, type Caixa, type CaixasBrutas, type MedidaPagina } from './caixas';

export interface PaginaInfo extends MedidaPagina {
  /** 0-based */
  indice: number;
}

export interface DocumentoInfo {
  paginas: PaginaInfo[];
}

/** US Letter, só se o PDF não tiver MediaBox válida (ficheiro inválido) */
const MEDIA_BOX_OMISSAO: Caixa = { x0: 0, y0: 0, x1: 612, y1: 792 };

function lerCaixa(arr: PDFArray | undefined): Caixa | undefined {
  if (!arr || arr.size() < 4) return undefined;
  const n: number[] = [];
  for (let i = 0; i < 4; i++) {
    const v = arr.lookupMaybe(i, PDFNumber)?.asNumber();
    if (v === undefined || !Number.isFinite(v)) return undefined;
    n.push(v);
  }
  const c = normalizarCaixa(n[0], n[1], n[2], n[3]);
  // Caixa sem área não serve de nada: trata-se como não definida
  return c.x0 < c.x1 && c.y0 < c.y1 ? c : undefined;
}

/**
 * Lê as caixas de todas as páginas. Só lê: não altera nem reescreve o PDF.
 * Recebe bytes (não um caminho), para correr igual no browser e no Electron.
 */
export async function abrirPdf(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, {
    ignoreEncryption: true, // só queremos a estrutura e os content streams
    updateMetadata: false,
    throwOnInvalidObject: false,
  });
}

export async function lerDocumento(bytes: Uint8Array): Promise<DocumentoInfo> {
  return lerPaginas(await abrirPdf(bytes));
}

export function lerPaginas(pdf: PDFDocument): DocumentoInfo {
  const paginas = pdf.getPages().map((pagina, indice): PaginaInfo => {
    const no = pagina.node;

    let media: Caixa;
    try {
      media = lerCaixa(no.MediaBox()) ?? MEDIA_BOX_OMISSAO;
    } catch {
      media = MEDIA_BOX_OMISSAO;
    }

    const userUnit = no.lookupMaybe(PDFName.of('UserUnit'), PDFNumber)?.asNumber();

    const brutas: CaixasBrutas = {
      media,
      crop: lerCaixa(no.CropBox()),
      trim: lerCaixa(no.TrimBox()),
      bleed: lerCaixa(no.BleedBox()),
      rotacao: no.Rotate()?.asNumber() ?? 0,
      userUnit: userUnit && userUnit > 0 ? userUnit : 1,
    };

    return { indice, ...medirPagina(brutas) };
  });

  return { paginas };
}

/** Nome do XObject em que a sangria automática guarda a página original (ver correcoes/sangria.ts) */
export const NOME_FORM_SANGRIA = 'ArtSangria';

/** A página foi feita pela sangria automática: a arte original está num Form e há faixas espelhadas por baixo */
export function temSangriaGerada(no: PDFPage['node']): boolean {
  try {
    const x = no.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    return !!x && x.has(PDFName.of(NOME_FORM_SANGRIA));
  } catch {
    return false;
  }
}
