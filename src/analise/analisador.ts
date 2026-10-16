import { PDFName, PDFRef, type PDFDocument } from 'pdf-lib';
import { lerPaginas, temSangriaGerada, type DocumentoInfo, type PaginaInfo } from './documento';
import type { Fonte } from './fontes';
import { interpretarPagina, type OpcoesInterpretador } from './interpretador';
import type { InfoFonte, PaginaIR } from './ir';
import { Leitor } from './leitor';

export interface PaginaAnalise {
  info: PaginaInfo;
  ir: PaginaIR;
  /** A sangria foi gerada pela correção automática (faixas espelhadas): o alerta de sangria não se aplica */
  sangriaGerada?: boolean;
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
      ir = { indice: i, eventos: [], camadas: [], fontesUsadas: [], avisos: [`Não consegui analisar esta página (${(e as Error).message})`] };
    }
    aoProgredir?.(i + 1, info.paginas.length);
    return { info: pi, ir, sangriaGerada: temSangriaGerada(nos[i].node) };
  });

  const simples: Record<string, InfoFonte> = {};
  for (const [id, f] of fontes) {
    simples[id] = { id: f.id, nome: f.nome, nomeCompleto: f.nomeCompleto, subtype: f.subtype, incorporada: f.incorporada, composta: f.composta, type3: f.type3 };
  }
  return { paginas, fontes: simples };
}

/** Contexto para interpretar uma página de cada vez, com contornos, sem repetir a análise do documento */
export interface ContextoInspecao {
  pdf: PDFDocument;
  l: Leitor;
  nos: ReturnType<PDFDocument['getPages']>;
  info: DocumentoInfo;
  fontes: Map<string, Fonte>;
  /** Layers desligadas por omissão no ficheiro */
  ocgPorOmissao: Set<string>;
  /** Quantas layers (OCGs) o ficheiro declara, mesmo as que nenhuma página usa */
  totalCamadas: number;
}

export function prepararInspecao(pdf: PDFDocument, info: DocumentoInfo = lerPaginas(pdf)): ContextoInspecao {
  const l = new Leitor(pdf.context);
  const props = l.dict(pdf.catalog.get(PDFName.of('OCProperties')));
  const totalCamadas = l.arr(props?.get(PDFName.of('OCGs')))?.size() ?? 0;
  return { pdf, l, nos: pdf.getPages(), info, fontes: new Map(), ocgPorOmissao: camadasOcultas(l, pdf), totalCamadas };
}

/**
 * Interpreta uma página guardando os contornos das formas (para o leitor de cor).
 * `ocgOcultos` substitui o estado das layers do ficheiro (é o que o utilizador escolheu ver).
 */
export function opcoesInspecao(c: ContextoInspecao, indice: number, ocgOcultos: Set<string> = c.ocgPorOmissao): OpcoesInterpretador {
  return { indice, limites: c.info.paginas[indice].media, ocgOcultos, fontes: c.fontes };
}

export function inspecionarPagina(c: ContextoInspecao, indice: number, ocgOcultos: Set<string> = c.ocgPorOmissao): PaginaIR {
  try {
    return interpretarPagina(c.l, c.nos[indice].node, { ...opcoesInspecao(c, indice, ocgOcultos), geometria: true });
  } catch (e) {
    return { indice, eventos: [], camadas: [], fontesUsadas: [], avisos: [`Não consegui analisar esta página (${(e as Error).message})`] };
  }
}
