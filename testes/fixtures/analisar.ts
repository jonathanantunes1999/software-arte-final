import { SPOTS_TECNICAS_OMISSAO, type ConfigAlertas } from '../../src/alertas/tipos';
import { analisarDocumento, type AnaliseDocumento } from '../../src/analise/analisador';
import { abrirPdf } from '../../src/analise/documento';
import { gerarPdfRaw, type PaginaRaw } from './gerar';

/** Gera um PDF a partir da especificação e analisa-o. */
export async function analisarRaw(...paginas: PaginaRaw[]): Promise<AnaliseDocumento> {
  const bytes = await gerarPdfRaw(paginas);
  return analisarDocumento(await abrirPdf(bytes));
}

export const BASE = { mediaMm: [100, 100] as [number, number] };

/** Config por omissão dos testes de alertas */
export const CFG_BASE: ConfigAlertas = {
  sangriaReferenciaMm: 3,
  toleranciaFormatoMm: 0.5,
  spotsTecnicas: SPOTS_TECNICAS_OMISSAO,
  resolucaoAvisoPpi: 300,
  resolucaoErroPpi: 150,
  linhaMinimaPt: 0.25,
  textoPretoMaxPt: 12,
  fundoPretoMinimoPercent: 25,
  zonaSegurancaMm: 3,
  verificarMarcasCorte: true,
  qrTamanhoMinimoMm: 20,
  overprintLinhaMaxPt: 1,
  marcasCorteCor: 'registo',
  tintaTotalMaxPercent: 300,
  multiploPaginas: 4,
};
