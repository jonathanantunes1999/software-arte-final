import { PDFDict, PDFRef } from 'pdf-lib';
import type { InfoFonte } from '../analise/ir';
import type { Leitor } from '../analise/leitor';
import { abrirFontePdf } from './fonte-pdf';

/** Uma fonte do ficheiro e se o texto que a usa se consegue converter em curvas */
export interface FonteInventariada {
  /** Etiqueta do objeto ("12 0 R"), que é o que se manda ao motor */
  id: string;
  nome: string;
  convertivel: boolean;
  /** Porque não se consegue (quando não se consegue) */
  motivo?: string;
}

/** Só as fontes usadas em texto (`usadas`). Type 3 não entra: já é vetorial. */
export function inventariarFontes(l: Leitor, fontes: Record<string, InfoFonte>, usadas: Set<string>): FonteInventariada[] {
  const r: FonteInventariada[] = [];
  for (const [id, info] of Object.entries(fontes)) {
    if (!usadas.has(id) || info.type3) continue;
    const m = id.match(/^(\d+) (\d+) R$/);
    const d = m ? l.ctx.lookup(PDFRef.of(parseInt(m[1], 10), parseInt(m[2], 10))) : undefined;
    if (!(d instanceof PDFDict)) {
      r.push({ id, nome: info.nome, convertivel: false, motivo: 'fonte dentro de um objeto direto' });
      continue;
    }
    const a = abrirFontePdf(l, d);
    r.push('ok' in a ? { id, nome: info.nome, convertivel: true } : { id, nome: info.nome, convertivel: false, motivo: a.erro });
  }
  return r.sort((x, y) => x.nome.localeCompare(y.nome));
}
