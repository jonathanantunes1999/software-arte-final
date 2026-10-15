import { FORMATOS_PREDEFINIDOS, TOLERANCIA_FORMATO_MM, sanearFormatos, type Formato } from '../comum/formatos';

export type Tema = 'auto' | 'claro' | 'escuro';

export interface Definicoes {
  formatos: Formato[];
  /** Sangria de referência, em mm */
  sangriaReferenciaMm: number;
  toleranciaFormatoMm: number;
  tema: Tema;
  mostrarCaixas: boolean;
}

const CHAVE = 'arte-final:definicoes:v1';

export function definicoesPorOmissao(): Definicoes {
  return {
    formatos: FORMATOS_PREDEFINIDOS.map((f) => ({ ...f })),
    sangriaReferenciaMm: 3,
    toleranciaFormatoMm: TOLERANCIA_FORMATO_MM,
    tema: 'auto',
    mostrarCaixas: true,
  };
}

function numeroPositivo(v: unknown, omissao: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : omissao;
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
