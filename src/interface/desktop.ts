/**
 * Ponte para a casca Electron (electron/preload.cjs). No browser não existe: `desktop` é null
 * e a app comporta-se como a versão web.
 */

export interface FicheiroAberto {
  nome: string;
  caminho: string;
  bytes: Uint8Array;
}

export type EstadoNotch = 'repouso' | 'estado' | 'dica' | 'aberto';

export interface PonteNotch {
  info(): Promise<{ temNotch: boolean; dica: boolean } | null>;
  tamanho(estado: EstadoNotch): void;
  soltar(caminho: string): Promise<boolean>;
  soltarBytes(nome: string, bytes: Uint8Array): Promise<boolean>;
}

export interface PonteDesktop {
  ehDesktop: true;
  caminhoDe(ficheiro: File): string;
  abrir(): Promise<FicheiroAberto | null>;
  guardar(nomeSugerido: string, bytes: Uint8Array, caminhoOriginal: string): Promise<string | null>;
  ficheiroInicial(): Promise<FicheiroAberto | null>;
  aoAbrirFicheiro(cb: (f: FicheiroAberto) => void): () => void;
  recolher(): void;
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
