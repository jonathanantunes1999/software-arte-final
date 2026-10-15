import { analisarDocumento, type AnaliseDocumento } from '../../src/analise/analisador';
import { abrirPdf } from '../../src/analise/documento';
import { gerarPdfRaw, type PaginaRaw } from './gerar';

/** Gera um PDF a partir da especificação e analisa-o. */
export async function analisarRaw(...paginas: PaginaRaw[]): Promise<AnaliseDocumento> {
  const bytes = await gerarPdfRaw(paginas);
  return analisarDocumento(await abrirPdf(bytes));
}

export const BASE = { mediaMm: [100, 100] as [number, number] };
