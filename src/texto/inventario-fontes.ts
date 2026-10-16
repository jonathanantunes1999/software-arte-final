import { PDFDict, PDFRef } from 'pdf-lib';
import type { InfoFonte } from '../analise/ir';
import type { Leitor } from '../analise/leitor';
import { abrirFontePdf, descreverNaoIncorporada, type FonteNaoIncorporada } from './fonte-pdf';

/** Uma fonte do ficheiro e se o texto que a usa se consegue converter em curvas */
export interface FonteInventariada {
  /** Etiqueta do objeto ("12 0 R"), que é o que se manda ao motor */
  id: string;
  nome: string;
  convertivel: boolean;
  /** Porque não se consegue (quando não se consegue) */
  motivo?: string;
  /**
   * Fonte não incorporada que se pode desenhar com uma fonte instalada no computador (só na versão
   * desktop, que é quem sabe o que está instalado). Os campos dizem como a procurar.
   */
  substituivel?: FonteNaoIncorporada;
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
    if ('ok' in a) {
      r.push({ id, nome: info.nome, convertivel: true });
      continue;
    }
    const naoIncorporada = a.erro === 'fonte sem FontDescriptor (não incorporada)' || a.erro === 'fonte não incorporada';
    if (!naoIncorporada) {
      r.push({ id, nome: info.nome, convertivel: false, motivo: a.erro });
      continue;
    }
    // Não incorporada: se for uma fonte simples de texto normal, pode desenhar-se com a instalada no computador
    const sub = descreverNaoIncorporada(l, d);
    if ('ok' in sub) r.push({ id, nome: info.nome, convertivel: false, motivo: 'fonte não incorporada', substituivel: sub.ok });
    else if (sub.erro === 'não é uma fonte simples') r.push({ id, nome: info.nome, convertivel: false, motivo: 'fonte composta não incorporada' });
    else r.push({ id, nome: info.nome, convertivel: false, motivo: `fonte não incorporada (${sub.erro})` });
  }
  return r.sort((x, y) => x.nome.localeCompare(y.nome));
}
