import { SPOTS_TECNICAS_OMISSAO } from '../alertas/tipos';
import { FORMATOS_PREDEFINIDOS, TOLERANCIA_FORMATO_MM, sanearFormatos, type Formato } from '../comum/formatos';

export type Tema = 'auto' | 'claro' | 'escuro';

export interface Definicoes {
  formatos: Formato[];
  /** Sangria de referência, em mm */
  sangriaReferenciaMm: number;
  toleranciaFormatoMm: number;
  /** Nomes de spots técnicas (faca, vincos, verniz...). Não pedem sangria nem overprint de texto. */
  spotsTecnicas: string[];
  /** Resolução efetiva mínima das imagens: abaixo do primeiro dá aviso, abaixo do segundo dá erro */
  resolucaoAvisoPpi: number;
  resolucaoErroPpi: number;
  /** Traço mínimo, em pt */
  linhaMinimaPt: number;
  /** Texto abaixo deste corpo (pt) não deve levar preto de quatro cores */
  textoPretoMaxPt: number;
  /** Fundo só em K 100% a partir desta percentagem da página */
  fundoPretoMinimoPercent: number;
  /** Distância mínima do texto e da arte ao corte, em mm (3 a 5 é o habitual) */
  zonaSegurancaMm: number;
  /** Verificar marcas de corte. Desliga-se em trabalhos sem marcas (ex.: impressão digital). */
  verificarMarcasCorte: boolean;
  /** Procurar QR codes (renderiza as páginas, por isso custa tempo) */
  verificarQrCodes: boolean;
  /** QR codes mais pequenos que isto (mm de lado) dão aviso */
  qrTamanhoMinimoMm: number;
  /** Linhas a 100% K até esta espessura (pt) devem levar overprint */
  overprintLinhaMaxPt: number;
  /** Rever o texto para português de Portugal (vocabulário, gerúndio, formatos, tipografia) */
  revisarTexto: boolean;
  /** Cor das marcas de corte: registo (offset) ou só preto (digital) */
  marcasCorteCor: 'registo' | 'preto';
  /** Soma máxima de tintas (C+M+Y+K, em %) */
  tintaTotalMaxPercent: number;
  /** Nº de páginas múltiplo de (0 = não verificar) */
  multiploPaginas: number;
  /** Nome que assina os relatórios (ex.: a tua agência) */
  autorRelatorio: string;
  tema: Tema;
  mostrarCaixas: boolean;
  mostrarLeitor: boolean;
}

const CHAVE = 'arte-final:definicoes:v1';

export function definicoesPorOmissao(): Definicoes {
  return {
    formatos: FORMATOS_PREDEFINIDOS.map((f) => ({ ...f })),
    sangriaReferenciaMm: 3,
    toleranciaFormatoMm: TOLERANCIA_FORMATO_MM,
    spotsTecnicas: [...SPOTS_TECNICAS_OMISSAO],
    resolucaoAvisoPpi: 300,
    resolucaoErroPpi: 150,
    linhaMinimaPt: 0.25,
    textoPretoMaxPt: 12,
    fundoPretoMinimoPercent: 25,
    zonaSegurancaMm: 3,
    verificarMarcasCorte: true,
    verificarQrCodes: true,
    qrTamanhoMinimoMm: 20,
    overprintLinhaMaxPt: 1,
    revisarTexto: true,
    marcasCorteCor: 'registo',
    tintaTotalMaxPercent: 300,
    multiploPaginas: 4,
    autorRelatorio: '',
    tema: 'auto',
    mostrarCaixas: true,
    mostrarLeitor: true,
  };
}

function numeroPositivo(v: unknown, omissao: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : omissao;
}

function sanearLista(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
}

function carregar(): Definicoes {
  const base = definicoesPorOmissao();
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return base;
    const guardado = JSON.parse(bruto) as Partial<Definicoes>;
    return {
      formatos: sanearFormatos(guardado.formatos) ?? base.formatos,
      sangriaReferenciaMm: numeroPositivo(guardado.sangriaReferenciaMm, base.sangriaReferenciaMm),
      toleranciaFormatoMm: numeroPositivo(guardado.toleranciaFormatoMm, base.toleranciaFormatoMm),
      spotsTecnicas: sanearLista(guardado.spotsTecnicas) ?? base.spotsTecnicas,
      resolucaoAvisoPpi: numeroPositivo(guardado.resolucaoAvisoPpi, base.resolucaoAvisoPpi),
      resolucaoErroPpi: numeroPositivo(guardado.resolucaoErroPpi, base.resolucaoErroPpi),
      linhaMinimaPt: numeroPositivo(guardado.linhaMinimaPt, base.linhaMinimaPt),
      textoPretoMaxPt: numeroPositivo(guardado.textoPretoMaxPt, base.textoPretoMaxPt),
      fundoPretoMinimoPercent: numeroPositivo(guardado.fundoPretoMinimoPercent, base.fundoPretoMinimoPercent),
      zonaSegurancaMm: numeroPositivo(guardado.zonaSegurancaMm, base.zonaSegurancaMm),
      verificarMarcasCorte: typeof guardado.verificarMarcasCorte === 'boolean' ? guardado.verificarMarcasCorte : base.verificarMarcasCorte,
      verificarQrCodes: typeof guardado.verificarQrCodes === 'boolean' ? guardado.verificarQrCodes : base.verificarQrCodes,
      qrTamanhoMinimoMm: numeroPositivo(guardado.qrTamanhoMinimoMm, base.qrTamanhoMinimoMm),
      overprintLinhaMaxPt: numeroPositivo(guardado.overprintLinhaMaxPt, base.overprintLinhaMaxPt),
      revisarTexto: typeof guardado.revisarTexto === 'boolean' ? guardado.revisarTexto : base.revisarTexto,
      marcasCorteCor: guardado.marcasCorteCor === 'preto' ? 'preto' : 'registo',
      tintaTotalMaxPercent: numeroPositivo(guardado.tintaTotalMaxPercent, base.tintaTotalMaxPercent),
      multiploPaginas: numeroPositivo(guardado.multiploPaginas, base.multiploPaginas),
      autorRelatorio: typeof guardado.autorRelatorio === 'string' ? guardado.autorRelatorio.slice(0, 80) : base.autorRelatorio,
      tema: guardado.tema === 'claro' || guardado.tema === 'escuro' ? guardado.tema : 'auto',
      mostrarCaixas: typeof guardado.mostrarCaixas === 'boolean' ? guardado.mostrarCaixas : base.mostrarCaixas,
      mostrarLeitor: typeof guardado.mostrarLeitor === 'boolean' ? guardado.mostrarLeitor : base.mostrarLeitor,
    };
  } catch {
    return base; // localStorage indisponível ou JSON corrompido
  }
}

export function guardarDefinicoes(d: Definicoes): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(d));
  } catch {
    /* sem armazenamento: as definições valem só para esta sessão */
  }
}

export const definicoes: Definicoes = $state(carregar());
