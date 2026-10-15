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
  tema: Tema;
  mostrarCaixas: boolean;
}

const CHAVE = 'arte-final:definicoes:v1';

export function definicoesPorOmissao(): Definicoes {
  return {
    formatos: FORMATOS_PREDEFINIDOS.map((f) => ({ ...f })),
    sangriaReferenciaMm: 3,
    toleranciaFormatoMm: TOLERANCIA_FORMATO_MM,
    spotsTecnicas: [...SPOTS_TECNICAS_OMISSAO],
    tema: 'auto',
    mostrarCaixas: true,
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
      tema: guardado.tema === 'claro' || guardado.tema === 'escuro' ? guardado.tema : 'auto',
      mostrarCaixas: typeof guardado.mostrarCaixas === 'boolean' ? guardado.mostrarCaixas : base.mostrarCaixas,
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
