import type { Caixa } from '../analise/caixas';

export type Gravidade = 'erro' | 'aviso' | 'info';

/** Um sítio onde o problema está: ao clicar no alerta a app faz zoom aqui. */
export interface Local {
  /** 0-based */
  pagina: number;
  /** Em pontos, no espaço de utilizador da página (sem rotação) */
  caixa: Caixa;
}

export interface Alerta {
  /** Estável entre execuções, para a lista não "saltar" quando se recalcula */
  id: string;
  gravidade: Gravidade;
  /** Descrição curta, em português simples */
  titulo: string;
  /** Pormenor, uma linha por \n */
  detalhe?: string;
  /** Página (0-based) para onde saltar quando não há locais precisos */
  pagina?: number;
  /** Onde está o problema. Clicar repetidamente passa de um para o seguinte. */
  locais?: Local[];
}

/** O que os alertas precisam das definições. Todos os limites são configuráveis. */
export interface ConfigAlertas {
  sangriaReferenciaMm: number;
  toleranciaFormatoMm: number;
  /** Nomes de spots técnicas (faca, vincos, verniz...), sem distinguir maiúsculas */
  spotsTecnicas: string[];
  /** Imagens abaixo disto (ppi efetivos) dão aviso */
  resolucaoAvisoPpi: number;
  /** Imagens abaixo disto (ppi efetivos) dão erro */
  resolucaoErroPpi: number;
  /** Traços mais finos que isto (pt) dão aviso */
  linhaMinimaPt: number;
  /** Texto abaixo deste corpo (pt) em preto de quatro cores dá aviso */
  textoPretoMaxPt: number;
  /** Fundos só em K 100% que ocupam pelo menos esta percentagem da página dão aviso */
  fundoPretoMinimoPercent: number;
  /** Texto e elementos de arte a menos disto (mm) do corte dão aviso */
  zonaSegurancaMm: number;
  /** Verificar marcas de corte (desliga-se para trabalhos sem marcas, como impressão digital) */
  verificarMarcasCorte: boolean;
}

export const SPOTS_TECNICAS_OMISSAO = [
  'Cortante',
  'Vincos',
  'Faca',
  'CutContour',
  'Cut',
  'Dieline',
  'Branco',
  'White',
  'Verniz',
  'Varnish',
];
