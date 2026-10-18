import type { Caixa } from '../analise/caixas';
import type { Cor, Geometria } from '../analise/ir';
import type { Matriz } from './matriz';

/** Cor CMYK, de 0 a 1 */
export type Cmyk = [number, number, number, number];

/**
 * Um objeto que se pode editar: uma forma, um bloco de texto, uma imagem, um degradé ou um grupo (um Form inteiro).
 * Os ids são a ordem em que se pintam no conteúdo da página (0 = o de baixo): não mudam enquanto o ficheiro for o mesmo,
 * por isso as edições guardam-se por id e aplicam-se sempre ao original.
 */
export interface ObjetoEditavel {
  id: number;
  tipo: 'forma' | 'texto' | 'imagem' | 'degrade' | 'grupo';
  /** Em pt, no espaço de utilizador da página, já recortada */
  bbox: Caixa;
  preenche: boolean;
  traca: boolean;
  cor?: Cor;
  corTraco?: Cor;
  espessuraTraco?: number;
  /** Os contornos (só nas formas): para clicar dentro do desenho e não só na caixa */
  geometria?: Geometria;
  /** Segmentos retos de um traço (linhas), para clicar nelas */
  segmentos?: [number, number, number, number][];
}

export type Edicao =
  | { tipo: 'apagar'; pagina: number; objeto: number }
  /** `matriz` age no espaço da página (desloca, muda a escala…); duas seguidas compõem-se */
  | { tipo: 'transformar'; pagina: number; objeto: number; matriz: Matriz }
  | { tipo: 'cor'; pagina: number; objeto: number; preenchimento?: Cmyk; traco?: Cmyk };

export interface ResumoEdicao {
  apagados: number;
  movidos: number;
  redimensionados: number;
  recoloridos: number;
  /** Páginas onde se mexeu (0 = primeira) */
  paginas: number[];
  /** Edições que já não se aplicam (o objeto não existe) */
  ignoradas: number;
}

export const resumoEdicaoVazio = (): ResumoEdicao => ({ apagados: 0, movidos: 0, redimensionados: 0, recoloridos: 0, paginas: [], ignoradas: 0 });
