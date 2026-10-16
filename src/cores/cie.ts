/** Cor em CIE Lab (D50, como nas bibliotecas de cor da Adobe) */
export type Lab = [number, number, number];

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gama = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** sRGB (0 a 1) → XYZ D50 (matriz de Bradford já aplicada) */
function rgbParaXyz50(r: number, g: number, b: number): [number, number, number] {
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  return [
    0.4360747 * R + 0.3850649 * G + 0.1430804 * B,
    0.2225045 * R + 0.7168786 * G + 0.0606169 * B,
    0.0139322 * R + 0.0971045 * G + 0.7141733 * B,
  ];
}

const BRANCO_D50 = [0.9642, 1, 0.8249];
const eps = 216 / 24389;
const kappa = 24389 / 27;
const fLab = (t: number) => (t > eps ? Math.cbrt(t) : (kappa * t + 16) / 116);

export function rgbParaLab(r: number, g: number, b: number): Lab {
  const [x, y, z] = rgbParaXyz50(r, g, b);
  const fx = fLab(x / BRANCO_D50[0]);
  const fy = fLab(y / BRANCO_D50[1]);
  const fz = fLab(z / BRANCO_D50[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Lab (D50) → sRGB 0 a 1, cortado ao gamut. Serve para mostrar amostras. */
export function labParaRgb([L, a, b]: Lab): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t: number) => (t ** 3 > eps ? t ** 3 : (116 * t - 16) / kappa);
  const x = inv(fx) * BRANCO_D50[0];
  const y = (L > kappa * eps ? ((L + 16) / 116) ** 3 : L / kappa) * BRANCO_D50[1];
  const z = inv(fz) * BRANCO_D50[2];
  // XYZ D50 → sRGB linear (inversa da matriz acima)
  const R = 3.1338561 * x - 1.6168667 * y - 0.4906146 * z;
  const G = -0.9787684 * x + 1.9161415 * y + 0.033454 * z;
  const B = 0.0719453 * x - 0.2289914 * y + 1.4052427 * z;
  const c = (v: number) => Math.max(0, Math.min(1, gama(Math.max(0, v))));
  return [c(R), c(G), c(B)];
}

/**
 * CMYK → Lab por conversão ingénua (sem perfil ICC). Dá a ideia da cor, não a prova de cor: por isso
 * as sugestões são sempre "parecidas", nunca "iguais".
 */
export function cmykParaLab(c: number, m: number, y: number, k: number): Lab {
  return rgbParaLab((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k));
}

const rad = (g: number) => (g * Math.PI) / 180;
const graus = (r: number) => (r * 180) / Math.PI;

/** Diferença de cor CIEDE2000 (Sharma, Wu e Dalal, 2005) */
export function deltaE2000(l1: Lab, l2: Lab): number {
  const [L1, a1, b1] = l1;
  const [L2, a2, b2] = l2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h = (b: number, a: number) => (b === 0 && a === 0 ? 0 : (graus(Math.atan2(b, a)) + 360) % 360);
  const h1p = h(b1, a1p);
  const h2p = h(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

  const Lpm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hpm /= 2;
    else hpm = hpm < 360 ? (hpm + 360) / 2 : (hpm - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos(rad(hpm - 30)) + 0.24 * Math.cos(rad(2 * hpm)) + 0.32 * Math.cos(rad(3 * hpm + 6)) - 0.2 * Math.cos(rad(4 * hpm - 63));
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
  const Sc = 1 + 0.045 * Cpm;
  const Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * ((dCp / Sc) * (dHp / Sh)));
}
