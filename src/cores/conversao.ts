/**
 * RGB → CMYK sem perfis ICC. A app não traz perfis de impressão (ver bibliotecas.ts), por isso a
 * conversão é uma aproximação: serve para tirar o RGB do ficheiro, não para igualar uma prova de cor.
 *
 * Regras:
 * - o eixo neutro (preto, cinzentos) fica só em K: o preto RGB passa a K 100% e não a um preto de
 *   quatro cores;
 * - quanto mais saturada a cor, menos K (o K vem do "cinzento" que há na cor: min(C, M, Y));
 * - a soma das tintas não passa o limite (300% por omissão): acima disso reduz-se C, M e Y.
 */

export type Cmyk = [number, number, number, number];

const lim01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function rgbParaCmykPrensa(r: number, g: number, b: number, tintaMax = 3): Cmyk {
  const C1 = 1 - lim01(r);
  const M1 = 1 - lim01(g);
  const Y1 = 1 - lim01(b);
  const mn = Math.min(C1, M1, Y1);
  const croma = Math.max(C1, M1, Y1) - mn;
  const K = mn * (1 - croma);
  if (K >= 1 - 1e-9) return [0, 0, 0, 1];
  let c = lim01((C1 - K) / (1 - K));
  let m = lim01((M1 - K) / (1 - K));
  let y = lim01((Y1 - K) / (1 - K));
  const processo = c + m + y;
  const folga = tintaMax - K;
  if (processo > folga && processo > 0) {
    const s = Math.max(0, folga) / processo;
    c *= s;
    m *= s;
    y *= s;
  }
  return [c, m, y, K];
}

/**
 * Uma cor em bytes (0 a 255) com a soma das tintas garantida abaixo do limite: arredondar cada
 * canal podia deixar a soma 0,4% acima (300,4%) e os alertas de tinta total voltavam a disparar.
 */
export function rgbParaCmykBytes(r: number, g: number, b: number, tintaMax = 3): [number, number, number, number] {
  const v = rgbParaCmykPrensa(r, g, b, tintaMax);
  const c = [Math.round(v[0] * 255), Math.round(v[1] * 255), Math.round(v[2] * 255)];
  const k = Math.round(v[3] * 255);
  const limite = Math.floor(tintaMax * 255 + 1e-6);
  while (c[0] + c[1] + c[2] + k > limite && c[0] + c[1] + c[2] > 0) {
    const i = c[0] >= c[1] && c[0] >= c[2] ? 0 : c[1] >= c[2] ? 1 : 2;
    c[i]--;
  }
  return [c[0], c[1], c[2], k];
}

/**
 * Converte pixeis RGB de 8 bits (3 bytes por pixel) em CMYK de 8 bits (4 bytes por pixel).
 * Guarda as últimas cores vistas: nas imagens há muitos pixeis seguidos iguais.
 */
export function converterPixeisRgb(rgb: Uint8Array, pixeis: number, tintaMax = 3): Uint8Array {
  const saida = new Uint8Array(pixeis * 4);
  let ur = -1;
  let ug = -1;
  let ub = -1;
  let c = 0;
  let m = 0;
  let y = 0;
  let k = 0;
  for (let i = 0, o = 0; i < pixeis; i++, o += 4) {
    const r = rgb[3 * i];
    const g = rgb[3 * i + 1];
    const b = rgb[3 * i + 2];
    if (r !== ur || g !== ug || b !== ub) {
      [c, m, y, k] = rgbParaCmykBytes(r / 255, g / 255, b / 255, tintaMax);
      ur = r;
      ug = g;
      ub = b;
    }
    saida[o] = c;
    saida[o + 1] = m;
    saida[o + 2] = y;
    saida[o + 3] = k;
  }
  return saida;
}
