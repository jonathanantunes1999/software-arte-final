/**
 * Personalização da mascote: o que o utilizador pode mudar (cor, acessório, bolas, se aparece) e as
 * contas de cor e de forma que o desenho precisa. Sem Svelte nem DOM, para se poder testar.
 */

export type Acessorio = 'nenhum' | 'oculos' | 'boina' | 'laco';

export interface PerfilMascote {
  visivel: boolean;
  /** Cor do corpo, #rrggbb */
  cor: string;
  acessorio: Acessorio;
  /** As quatro bolas CMYK à volta (e atrás, quando voa) */
  bolas: boolean;
  /** Onde aparece */
  inicio: boolean;
  alertas: boolean;
  /** Mexe-se (respira, pisca, segue o rato). Desligada, fica quieta. */
  animada: boolean;
}

export const ACESSORIOS: { valor: Acessorio; nome: string }[] = [
  { valor: 'nenhum', nome: 'Nenhum' },
  { valor: 'oculos', nome: 'Óculos' },
  { valor: 'boina', nome: 'Boina' },
  { valor: 'laco', nome: 'Laço' },
];

export const CORES: { nome: string; cor: string }[] = [
  { nome: 'Pérola', cor: '#f1eee8' },
  { nome: 'Ciano', cor: '#7fd6fb' },
  { nome: 'Magenta', cor: '#ff80c2' },
  { nome: 'Amarelo', cor: '#ffe27a' },
  { nome: 'Grafite', cor: '#4a4f62' },
];

/** As tintas de processo, como bolas: ciano, magenta, amarelo e preto */
export const BOLAS_CMYK = ['#00aeef', '#ec008c', '#ffd400', '#1c1a1f'] as const;

export const PERFIL_OMISSAO: PerfilMascote = { visivel: true, cor: CORES[0].cor, acessorio: 'nenhum', bolas: true, inicio: true, alertas: true, animada: true };

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
    acessorio: ACESSORIOS.some((x) => x.valor === o.acessorio) ? (o.acessorio as Acessorio) : PERFIL_OMISSAO.acessorio,
    bolas: typeof o.bolas === 'boolean' ? o.bolas : PERFIL_OMISSAO.bolas,
    inicio: typeof o.inicio === 'boolean' ? o.inicio : PERFIL_OMISSAO.inicio,
    alertas: typeof o.alertas === 'boolean' ? o.alertas : PERFIL_OMISSAO.alertas,
    animada: typeof o.animada === 'boolean' ? o.animada : PERFIL_OMISSAO.animada,
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
  /** Cor dos olhos e da boca: escura, ou clara se o corpo for escuro */
  tinta: string;
}

/** Os tons que dão volume ao corpo, a partir da cor escolhida. Cores muito claras escurecem mais para a sombra se ver. */
export function tons(cor: string): Tons {
  const c = normalizarCor(cor) ?? PERFIL_OMISSAO.cor;
  const clara = luminancia(c) > 200;
  return {
    luz: misturar(c, '#ffffff', luminancia(c) < 120 ? 0.35 : 0.7),
    base: c,
    sombra: luminancia(c) < 120 ? misturar(c, '#0b0a12', 0.4) : misturar(c, '#5a4a6a', clara ? 0.34 : 0.26),
    tinta: luminancia(c) < 120 ? '#f6f3ff' : '#2a2230',
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
