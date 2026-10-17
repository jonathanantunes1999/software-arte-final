import type { TipoCorrecao } from '../alertas/correcao-sugerida';
import type { PedidoCorrecoes } from '../correcoes/aplicar';
import type { EstadoMascote } from '../mascote/expressoes';
import type { Acessorio, PerfilMascote } from '../mascote/personalizacao';

/** O que o assistente sabe do ficheiro e da app, só para leitura. A interface monta-o a partir do estado. */
export interface AlertaResumo {
  id: string;
  gravidade: 'erro' | 'aviso' | 'info';
  titulo: string;
  detalhe: string;
  /** 1-based, para falar com o utilizador */
  paginas: number[];
  correcao: TipoCorrecao | null;
}

export interface ContextoAssistente {
  ficheiro: { nome: string; paginas: number; pagina: number } | null;
  alertas: AlertaResumo[];
  inventario: {
    rgbVetores: number;
    rgbImagens: number;
    overprint: { branco: number; pretoTexto: number; pretoLinha: number; spotsTecnicas: number };
    spots: number;
    juncoes: { de: string; para: string }[];
    /** Cores de processo usadas em traços (candidatas a faca): precisam de uma decisão do utilizador */
    facas: number;
    /** Fontes (ids) que se convertem em curvas sem ajuda */
    fontesConvertiveis: string[];
    fontesTotal: number;
    /** Fontes não incorporadas (só na desktop se podem desenhar com as instaladas, e isso passa pelo painel) */
    fontesNaoIncorporadas: number;
  } | null;
  paginasSemSangria: number;
  /** Páginas sem marcas de corte (ou sem espaço para elas); falta = 0 */
  paginasSemMarcas?: number;
  sangriaMm: number;
  /** Já há uma cópia corrigida? */
  corrigido: boolean;
  desktop: boolean;
  mascote: PerfilMascote;
}

export type Painel = 'layers' | 'separacoes' | 'correcoes' | 'caixas';

/** O que o assistente pede à app para fazer. A app decide como; o assistente nunca mexe no estado. */
export type Acao =
  | { tipo: 'corrigir'; pedido: PedidoCorrecoes; descricao: string[] }
  | { tipo: 'prepararCorrecao'; correcao: TipoCorrecao }
  | { tipo: 'painel'; painel: Painel }
  | { tipo: 'definicoes'; separador: 'verificacoes' | 'formatos' | 'relatorio' | 'mascote' }
  | { tipo: 'irParaAlerta'; indice: number }
  | { tipo: 'pagina'; pagina: number }
  | { tipo: 'relatorio' }
  | { tipo: 'descarregar' }
  | { tipo: 'comparar' }
  | { tipo: 'abrirFicheiro' }
  | { tipo: 'abrirExemplo' }
  | { tipo: 'tema'; tema: 'claro' | 'escuro' | 'auto' }
  | { tipo: 'mascote'; mudancas: Partial<PerfilMascote> };

export interface Resposta {
  /** Texto para mostrar. **negrito** e parágrafos separados por linha em branco. */
  texto: string;
  /** Como a mascote fica ao responder */
  expressao: EstadoMascote;
  acoes: Acao[];
  /** Perguntas que se podem fazer a seguir (botões) */
  sugestoes: string[];
}

/** O que se lembra de uma resposta para a seguinte */
export interface Memoria {
  /** Ação proposta à espera de um "sim" */
  pendente: Acao[] | null;
  ultimoTema: string | null;
}

export const MEMORIA_VAZIA: Memoria = { pendente: null, ultimoTema: null };

export interface Resultado {
  resposta: Resposta;
  memoria: Memoria;
}

export type { Acessorio };
