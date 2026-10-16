/**
 * Ponte para a casca Electron (electron/preload.cjs). No browser não existe: `desktop` é null
 * e a app comporta-se como a versão web.
 */

export interface FicheiroAberto {
  nome: string;
  caminho: string;
  bytes: Uint8Array;
}

export interface PonteDesktop {
  ehDesktop: true;
  caminhoDe(ficheiro: File): string;
  abrir(): Promise<FicheiroAberto | null>;
  guardar(nomeSugerido: string, bytes: Uint8Array, caminhoOriginal: string): Promise<string | null>;
  ficheiroInicial(): Promise<FicheiroAberto | null>;
  aoAbrirFicheiro(cb: (f: FicheiroAberto) => void): () => void;
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
