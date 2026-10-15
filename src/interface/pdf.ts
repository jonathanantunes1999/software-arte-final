// Build "legacy": a normal usa APIs de JS muito recentes e falha em Safari e Chrome desatualizados
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const base = import.meta.env.BASE_URL;

export class PdfProtegidoErro extends Error {
  constructor() {
    super('Este PDF está protegido por palavra-passe.');
  }
}

/** Abre o PDF no pdf.js (só para preview). Recebe uma cópia dos bytes porque o worker fica com eles. */
export async function abrirPreview(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  try {
    return await pdfjs.getDocument({
      data: bytes.slice(),
      standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
      cMapUrl: `${base}pdfjs/cmaps/`,
      cMapPacked: true,
      iccUrl: `${base}pdfjs/iccs/`,
      wasmUrl: `${base}pdfjs/wasm/`,
    }).promise;
  } catch (e) {
    if (e instanceof Error && e.name === 'PasswordException') throw new PdfProtegidoErro();
    throw e;
  }
}
