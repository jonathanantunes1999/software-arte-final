import { PDFName, PDFRef, type PDFDocument } from 'pdf-lib';
import { lerPaginas, type DocumentoInfo, type PaginaInfo } from './documento';
import type { Fonte } from './fontes';
import { interpretarPagina } from './interpretador';
import type { InfoFonte, PaginaIR } from './ir';
import { Leitor } from './leitor';

export interface PaginaAnalise {
  info: PaginaInfo;
  ir: PaginaIR;
}

export interface AnaliseDocumento {
  paginas: PaginaAnalise[];
  fontes: Record<string, InfoFonte>;
}

/** Etiquetas das layers (OCGs) desligadas por omissão em /OCProperties/D */
function camadasOcultas(l: Leitor, pdf: PDFDocument): Set<string> {
  const ocultos = new Set<string>();
  const props = l.dict(pdf.catalog.get(PDFName.of('OCProperties')));
  if (!props) return ocultos;
  const d = l.dict(props.get(PDFName.of('D')));
  const todos = (l.arr(props.get(PDFName.of('OCGs')))?.asArray() ?? []).filter((x): x is PDFRef => x instanceof PDFRef);
  const refs = (chave: string) =>
    (l.arr(d?.get(PDFName.of(chave)))?.asArray() ?? []).filter((x): x is PDFRef => x instanceof PDFRef).map((r) => r.tag);

  if (l.nome(d?.get(PDFName.of('BaseState'))) === 'OFF') {
    const ligados = new Set(refs('ON'));
    for (const r of todos) if (!ligados.has(r.tag)) ocultos.add(r.tag);
  } else {
    for (const t of refs('OFF')) ocultos.add(t);
  }
  return ocultos;
}

/**
 * Interpreta todas as páginas e devolve a representação intermédia.
 * Só lê o PDF: nunca o altera.
 */
export function analisarDocumento(
  pdf: PDFDocument,
  info: DocumentoInfo = lerPaginas(pdf),
  aoProgredir?: (feitas: number, total: number) => void,
): AnaliseDocumento {
  const l = new Leitor(pdf.context);
  const ocgOcultos = camadasOcultas(l, pdf);
  const fontes = new Map<string, Fonte>();
  const nos = pdf.getPages();

  const paginas = info.paginas.map((pi, i): PaginaAnalise => {
    let ir: PaginaIR;
    try {
      ir = interpretarPagina(l, nos[i].node, { indice: i, limites: pi.media, ocgOcultos, fontes });
    } catch (e) {
      ir = { indice: i, eventos: [], fontesUsadas: [], avisos: [`Não consegui analisar esta página (${(e as Error).message})`] };
    }
    aoProgredir?.(i + 1, info.paginas.length);
    return { info: pi, ir };
  });

  const simples: Record<string, InfoFonte> = {};
  for (const [id, f] of fontes) {
    simples[id] = { id: f.id, nome: f.nome, nomeCompleto: f.nomeCompleto, subtype: f.subtype, incorporada: f.incorporada, composta: f.composta, type3: f.type3 };
  }
  return { paginas, fontes: simples };
}
