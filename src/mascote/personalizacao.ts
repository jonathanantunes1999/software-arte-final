/**
 * Personalização da mascote: o que o utilizador pode mudar (cor, orelhas, acessório, se aparece) e as
 * contas de cor e de forma que o desenho precisa. Sem Svelte nem DOM, para se poder testar.
 */

export type Orelhas = 'nenhuma' | 'gato' | 'coelho' | 'urso';
export type Acessorio = 'nenhum' | 'oculos' | 'boina' | 'laco';

export interface PerfilMascote {
  visivel: boolean;
  /** Cor do corpo, #rrggbb */
  cor: string;
  orelhas: Orelhas;
  acessorio: Acessorio;
}

export const ORELHAS: { valor: Orelhas; nome: string }[] = [
  { valor: 'nenhuma', nome: 'Sem orelhas' },
  { valor: 'gato', nome: 'Gato' },
  { valor: 'coelho', nome: 'Coelho' },
  { valor: 'urso', nome: 'Urso' },
];

export const ACESSORIOS: { valor: Acessorio; nome: string }[] = [
  { valor: 'nenhum', nome: 'Nenhum' },
  { valor: 'oculos', nome: 'Óculos' },
  { valor: 'boina', nome: 'Boina' },
  { valor: 'laco', nome: 'Laço' },
];

export const CORES: { nome: string; cor: string }[] = [
  { nome: 'Pêssego', cor: '#ffd2ad' },
  { nome: 'Pérola', cor: '#f1eee8' },
  { nome: 'Menta', cor: '#b9ecda' },
  { nome: 'Céu', cor: '#bcdcff' },
  { nome: 'Lavanda', cor: '#d6cbff' },
  { nome: 'Rosa', cor: '#ffc4d9' },
  { nome: 'Âmbar', cor: '#ffd56b' },
];

export const PERFIL_OMISSAO: PerfilMascote = { visivel: true, cor: CORES[0].cor, orelhas: 'gato', acessorio: 'nenhum' };

/** #abc ou #aabbcc (com ou sem #) → #aabbcc em minúsculas; null se não for uma cor */
export function normalizarCor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`;
}

/** O que vem do armazenamento pode estar estragado ou ser de uma versão antiga: aproveita-se o que for válido */
export function sanearPerfil(v: unknown): PerfilMascote {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  return {
    visivel: typeof o.visivel === 'boolean' ? o.visivel : PERFIL_OMISSAO.visivel,
    cor: normalizarCor(o.cor) ?? PERFIL_OMISSAO.cor,
    orelhas: ORELHAS.some((x) => x.valor === o.orelhas) ? (o.orelhas as Orelhas) : PERFIL_OMISSAO.orelhas,
    acessorio: ACESSORIOS.some((x) => x.valor === o.acessorio) ? (o.acessorio as Acessorio) : PERFIL_OMISSAO.acessorio,
  };
}

function rgb(hex: string): [number, number, number] {
  const h = normalizarCor(hex) ?? '#000000';
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

/** Mistura duas cores (t = 0 → a, t = 1 → b) */
export function misturar(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return `#${[0, 1, 2].map((i) => hex2(x[i] + (y[i] - x[i]) * t)).join('')}`;
}

export function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export interface Tons {
  /** Zona de luz (canto superior esquerdo) */
  luz: string;
  base: string;
  /** Zona de sombra (em baixo, à direita) */
  sombra: string;
  /** Rosa das orelhas por dentro e rubor, ajustado à cor do corpo */
  interior: string;
}

/** Os tons que dão volume ao corpo, a partir da cor escolhida. Cores muito claras escurecem mais para a sombra se ver. */
export function tons(cor: string): Tons {
  const c = normalizarCor(cor) ?? PERFIL_OMISSAO.cor;
  const clara = luminancia(c) > 200;
  return {
    luz: misturar(c, '#ffffff', 0.7),
    base: c,
    sombra: misturar(c, '#5a4a6a', clara ? 0.34 : 0.26),
    interior: misturar(c, '#ff7f9f', 0.55),
  };
}

/**
 * Superelipse |x/rx|ⁿ + |y/ry|ⁿ = 1 como caminho SVG. n = 2 é uma elipse; n ≈ 2,7 dá o corpo "mochi",
 * entre o redondo e o quadrado.
 */
export function superelipse(cx: number, cy: number, rx: number, ry: number, n = 2.7, passos = 96): string {
  const p: string[] = [];
  for (let i = 0; i < passos; i++) {
    const t = (i / passos) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = cx + rx * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = cy + ry * Math.sign(s) * Math.abs(s) ** (2 / n);
    p.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${p.join(' ')} Z`;
}
