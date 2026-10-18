/**
 * Ponte para a casca Electron (electron/preload.cjs). No browser não existe: `desktop` é null
 * e a app comporta-se como a versão web.
 */

export interface FicheiroAberto {
  nome: string;
  caminho: string;
  bytes: Uint8Array;
}

/** Uma fonte instalada no computador, encontrada para uma fonte do PDF */
export interface FonteInstalada {
  nome: string;
  /** Não é a própria fonte */
  aproximada: boolean;
  /** exata; métricas = equivalente (Arial por Helvetica); parecida = outro desenho do mesmo género; generica = só o género (sem serifas, com serifas, mono) */
  grau: 'exata' | 'metricas' | 'parecida' | 'generica';
  bytes: Uint8Array;
}

export interface PedidoFonteInstalada {
  nomeBase: string;
  negrito: boolean;
  italico: boolean;
  serifa: boolean;
  mono: boolean;
}

export interface PonteNotch {
  info(): Promise<{ temNotch: boolean } | null>;
  soltar(caminho: string): Promise<{ ok: boolean; erro?: string }>;
  soltarBytes(nome: string, bytes: Uint8Array): Promise<{ ok: boolean; erro?: string }>;
  /** Vários de uma vez: cada item tem o caminho no disco ou, se não houver, o nome e os bytes */
  soltarLista(itens: ({ caminho: string } | { nome: string; bytes: Uint8Array })[]): Promise<{ ok: boolean; erro?: string }>;
  evento(nome: 'dragenter' | 'drop'): void;
  segurar(ms: number): void;
  aoMostrar(cb: (tipo: string) => void): () => void;
  aoFase(cb: (fase: string) => void): () => void;
  /** O progresso real da análise (0…1) enquanto a mascote leva a barra */
  aoProgresso(cb: (fracao: number) => void): () => void;
  aoEsconder(cb: () => void): () => void;
}

export interface PonteDesktop {
  ehDesktop: true;
  caminhoDe(ficheiro: File): string;
  abrir(): Promise<FicheiroAberto | null>;
  guardar(nomeSugerido: string, bytes: Uint8Array, caminhoOriginal: string): Promise<string | null>;
  fontesDoSistema(pedidos: PedidoFonteInstalada[]): Promise<(FonteInstalada | null)[]>;
  /** Os PDFs com que a app foi aberta (podem ser vários), pela ordem em que chegaram */
  ficheirosIniciais(): Promise<FicheiroAberto[]>;
  aoAbrirFicheiro(cb: (f: FicheiroAberto) => void): () => void;
  recolher(): void;
  /** Diz à casca que o ficheiro que ela entregou já foi analisado */
  analisePronta(): void;
  /** O progresso da análise (0…1), para a barra da janelinha */
  progressoAnalise(fracao: number): void;
  /** Cmd/Ctrl+W (vem do menu da casca): fechar o separador à frente */
  aoFecharSeparador(cb: () => void): () => void;
  modoNotch(): Promise<boolean>;
  aoModoNotch(cb: (ligado: boolean) => void): () => void;
  notch: PonteNotch;
}

declare global {
  interface Window {
    arteFinal?: PonteDesktop;
  }
}

export const desktop: PonteDesktop | null = typeof window !== 'undefined' && window.arteFinal?.ehDesktop ? window.arteFinal : null;

/** Cria um File a partir do que o processo principal leu (a página não toca no disco) */
export function ficheiroDe(f: FicheiroAberto): File {
  return new File([f.bytes.slice()], f.nome, { type: 'application/pdf' });
}
