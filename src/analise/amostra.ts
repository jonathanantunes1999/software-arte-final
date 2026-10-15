import { PDFArray, type PDFObject } from 'pdf-lib';
import { lerFuncao } from './funcoes';
import type { Leitor } from './leitor';

export type Rgb = [number, number, number];

const lim = (v: number) => Math.round(Math.min(255, Math.max(0, v)));

/**
 * CMYK → RGB aproximado, o mesmo polinómio que o pdf.js usa no preview (Apache-2.0), para as
 * amostras de cor coincidirem com o que se vê no ecrã. Entradas de 0 a 1, saída de 0 a 255.
 */
export function cmykParaRgb(c: number, m: number, y: number, k: number): Rgb {
  return [
    lim(255 + c * (-4.387332384609988 * c + 54.48615194189176 * m + 18.82290502165302 * y + 212.25662451639585 * k - 285.2331026137004) + m * (1.7149763477362134 * m - 5.6096736904047315 * y - 17.873870861415444 * k - 5.497006427196366) + y * (-2.5217340131683033 * y - 21.248923337353073 * k + 17.5119270841813) + k * (-21.86122147463605 * k - 189.48180835922747)),
    lim(255 + c * (8.841041422036149 * c + 60.118027045597366 * m + 6.871425592049007 * y + 31.159100130055922 * k - 79.2970844816548) + m * (-15.310361306967817 * m + 17.575251261109482 * y + 131.35250912493976 * k - 190.9453302588951) + y * (4.444339102852739 * y + 9.8632861493405 * k - 24.86741582555878) + k * (-20.737325471181034 * k - 187.80453709719578)),
    lim(255 + c * (0.8842522430003296 * c + 8.078677503112928 * m + 30.89978309703729 * y - 0.23883238689178934 * k - 14.183576799673286) + m * (10.49593273432072 * m + 63.02378494754052 * y + 50.606957656360734 * k - 112.23884253719248) + y * (0.03296041114873217 * y + 115.60384449646641 * k - 193.58209356861505) + k * (-22.33816807309886 * k - 180.12613974708367)),
  ];
}

/** Lab (D50) → sRGB */
export function labParaRgb(L: number, a: number, b: number): Rgb {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t: number) => (t > 6 / 29 ? t ** 3 : (3 * (6 / 29) ** 2) * (t - 4 / 29));
  const X = 0.9642 * inv(fx);
  const Y = inv(fy);
  const Z = 0.8249 * inv(fz);
  // D50 → sRGB (Bradford)
  const r = 3.1338561 * X - 1.6168667 * Y - 0.4906146 * Z;
  const g = -0.9787684 * X + 1.9161415 * Y + 0.033454 * Z;
  const bl = 0.0719453 * X - 0.2289914 * Y + 1.4052427 * Z;
  const gama = (u: number) => (u <= 0.0031308 ? 12.92 * u : 1.055 * Math.max(u, 0) ** (1 / 2.4) - 0.055);
  return [lim(255 * gama(r)), lim(255 * gama(g)), lim(255 * gama(bl))];
}

/** Componentes no espaço alternativo → RGB. `alt` é o objeto do espaço (nome ou array). */
function paraRgb(l: Leitor, alt: PDFObject | undefined, v: number[]): Rgb | undefined {
  const nome = l.nome(alt);
  const itens = l.itens(alt);
  const familia = nome ?? l.nome(itens[0]);
  const n = v.length;
  switch (familia) {
    case 'DeviceGray':
    case 'CalGray':
      return [lim(v[0] * 255), lim(v[0] * 255), lim(v[0] * 255)];
    case 'DeviceRGB':
    case 'CalRGB':
      return n >= 3 ? [lim(v[0] * 255), lim(v[1] * 255), lim(v[2] * 255)] : undefined;
    case 'DeviceCMYK':
      return n >= 4 ? cmykParaRgb(v[0], v[1], v[2], v[3]) : undefined;
    case 'Lab':
      return n >= 3 ? labParaRgb(v[0], v[1], v[2]) : undefined;
    case 'ICCBased': {
      const nc = l.num(l.get(l.dict(itens[1]), 'N')) ?? n;
      if (nc === 1) return [lim(v[0] * 255), lim(v[0] * 255), lim(v[0] * 255)];
      if (nc === 3) return [lim(v[0] * 255), lim(v[1] * 255), lim(v[2] * 255)];
      if (nc === 4) return cmykParaRgb(v[0], v[1], v[2], v[3]);
      return undefined;
    }
    default:
      return undefined;
  }
}

const cache = new WeakMap<PDFArray, Rgb | null>();

/** Cor aproximada de uma tinta Separation a 100%: avalia a transformação de tinta no espaço alternativo. */
export function amostraSeparacao(l: Leitor, espaco: PDFArray): Rgb | undefined {
  const guardado = cache.get(espaco);
  if (guardado !== undefined) return guardado ?? undefined;
  let r: Rgb | undefined;
  try {
    const itens = espaco.asArray();
    const f = lerFuncao(l, itens[3]);
    const v = f?.([1]);
    if (v) r = paraRgb(l, l.res(itens[2]), v);
  } catch {
    r = undefined;
  }
  cache.set(espaco, r ?? null);
  return r;
}
