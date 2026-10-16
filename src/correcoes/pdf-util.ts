import { PDFArray, PDFDocument, PDFName, PDFRef, type PDFDict } from 'pdf-lib';

function refsDoConteudo(no: PDFDict): PDFRef[] {
  const c = no.get(PDFName.of('Contents'));
  if (c instanceof PDFRef) return [c];
  if (c instanceof PDFArray) return c.asArray().filter((x): x is PDFRef => x instanceof PDFRef);
  return [];
}

/** Quantas páginas usam cada stream de conteúdo (para só apagar os que ninguém mais usa) */
export function usosDosConteudos(pdf: PDFDocument): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pdf.getPages()) for (const r of refsDoConteudo(p.node)) m.set(r.tag, (m.get(r.tag) ?? 0) + 1);
  return m;
}

/**
 * Substitui o conteúdo de uma página por um stream novo e apaga os antigos, se mais nenhuma página os
 * usa. O pdf-lib grava tudo o que está no documento, mesmo sem referências: sem isto, o ficheiro
 * levaria o conteúdo antigo às costas.
 */
export function substituirConteudo(pdf: PDFDocument, no: PDFDict, bytes: Uint8Array, usos: Map<string, number>): PDFRef {
  const ctx = pdf.context;
  const antigos = refsDoConteudo(no);
  const novo = ctx.register(ctx.flateStream(bytes));
  no.set(PDFName.of('Contents'), novo);
  for (const r of antigos) {
    const n = (usos.get(r.tag) ?? 1) - 1;
    usos.set(r.tag, n);
    if (n <= 0) ctx.delete(r);
  }
  usos.set(novo.tag, 1);
  return novo;
}
