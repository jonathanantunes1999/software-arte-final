import type { Rgb } from '../analise/amostra';

/**
 * Junta as placas num só ecrã como na pré-visualização de separações do Acrobat: cada placa é
 * uma camada de tinta que multiplica sobre o papel branco.
 */

export interface PlacaPixels {
  /** Um byte por pixel: 255 = sem tinta, 0 = tinta a 100% */
  dados: Uint8Array | Uint8ClampedArray;
  /** Cor da tinta a 100% */
  cor: Rgb;
}

/** Cobertura de tinta (0–1) de um pixel de placa */
export const tintaDoPixel = (cinzento: number): number => (255 - cinzento) / 255;

export function compor(placas: PlacaPixels[], largura: number, altura: number, papel: Rgb = [255, 255, 255]): Uint8ClampedArray {
  const n = largura * altura;
  const saida = new Uint8ClampedArray(n * 4);
  const fr = new Float32Array(n).fill(papel[0]);
  const fg = new Float32Array(n).fill(papel[1]);
  const fb = new Float32Array(n).fill(papel[2]);
  for (const p of placas) {
    if (p.dados.length < n) continue;
    const kr = 1 - p.cor[0] / 255;
    const kg = 1 - p.cor[1] / 255;
    const kb = 1 - p.cor[2] / 255;
    for (let i = 0; i < n; i++) {
      const a = (255 - p.dados[i]) / 255;
      if (a === 0) continue;
      fr[i] *= 1 - a * kr;
      fg[i] *= 1 - a * kg;
      fb[i] *= 1 - a * kb;
    }
  }
  for (let i = 0; i < n; i++) {
    saida[i * 4] = fr[i];
    saida[i * 4 + 1] = fg[i];
    saida[i * 4 + 2] = fb[i];
    saida[i * 4 + 3] = 255;
  }
  return saida;
}

/** A placa tem alguma tinta (algum pixel abaixo de ~2% de cobertura)? */
export function temTinta(dados: Uint8Array | Uint8ClampedArray, limiar = 250): boolean {
  for (let i = 0; i < dados.length; i++) if (dados[i] < limiar) return true;
  return false;
}

/** Extrai o canal vermelho (a placa é cinzenta) de um ImageData RGBA */
export function canalCinzento(rgba: Uint8ClampedArray): Uint8Array {
  const r = new Uint8Array(rgba.length >> 2);
  for (let i = 0; i < r.length; i++) r[i] = rgba[i * 4];
  return r;
}
