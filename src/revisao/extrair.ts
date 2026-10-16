import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PaginaTexto } from './revisar';

/**
 * Lê o texto de cada página com o pdf.js (as fontes e as codificações já vêm resolvidas).
 * Cede o fio entre páginas para a interface não ficar parada.
 */
export async function extrairTexto(doc: PDFDocumentProxy, aoProgredir?: (feitas: number, total: number) => void, cancelado?: () => boolean): Promise<PaginaTexto[]> {
  const r: PaginaTexto[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    if (cancelado?.()) return r;
    const pagina = await doc.getPage(i);
    const conteudo = await pagina.getTextContent();
    const itens = [];
    for (const it of conteudo.items) {
      if (!('str' in it) || it.str === '') continue;
      const t = it.transform as number[];
      itens.push({ str: it.str, x: t[4], y: t[5], w: it.width, h: it.height || Math.hypot(t[2], t[3]), eol: !!it.hasEOL });
    }
    r.push({ pagina: i - 1, itens });
    pagina.cleanup();
    aoProgredir?.(i, doc.numPages);
    if (i % 5 === 0) await new Promise((ok) => setTimeout(ok, 0));
  }
  return r;
}
