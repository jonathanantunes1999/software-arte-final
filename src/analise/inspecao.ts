import { descreverCor, overprintEfetivo } from './cores';
import type { Cor, EventoDesenho, Geometria } from './ir';

/**
 * Leitor de cor: que objetos estão debaixo de um ponto da página, e o que cada um pinta.
 * Trabalha sobre a IR com geometria (ver `inspecionarPagina`). Não conhece transparências:
 * um objeto com opacidade baixa conta como se fosse opaco.
 */

export interface Toque {
  evento: EventoDesenho;
  /** O ponto está em cima do preenchimento / do traço */
  preenchimento: boolean;
  traco: boolean;
}

/** Número de enrolamento do ponto em relação a todos os contornos (cada um fechado à força) */
function enrolamento(g: Geometria, x: number, y: number): { enrolamento: number; cruzamentos: number } {
  let w = 0;
  let c = 0;
  for (const pts of g.contornos) {
    const n = pts.length / 2;
    if (n < 3) continue;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[2 * i];
      const yi = pts[2 * i + 1];
      const xj = pts[2 * j];
      const yj = pts[2 * j + 1];
      if (yi > y !== yj > y) {
        const xc = xi + ((y - yi) / (yj - yi)) * (xj - xi);
        if (xc > x) {
          c++;
          w += yj > yi ? 1 : -1;
        }
      }
    }
  }
  return { enrolamento: w, cruzamentos: c };
}

export function pontoNoPreenchimento(g: Geometria, x: number, y: number): boolean {
  const r = enrolamento(g, x, y);
  return g.parImpar ? r.cruzamentos % 2 === 1 : r.enrolamento !== 0;
}

function distanciaAoSegmento(x: number, y: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const q = dx * dx + dy * dy;
  const t = q > 0 ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / q)) : 0;
  return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
}

export function distanciaAoTraco(g: Geometria, x: number, y: number): number {
  let melhor = Infinity;
  g.contornos.forEach((pts, k) => {
    const n = pts.length / 2;
    for (let i = 0; i + 1 < n; i++) melhor = Math.min(melhor, distanciaAoSegmento(x, y, pts[2 * i], pts[2 * i + 1], pts[2 * i + 2], pts[2 * i + 3]));
    if (g.fechados[k] && n > 2) melhor = Math.min(melhor, distanciaAoSegmento(x, y, pts[2 * n - 2], pts[2 * n - 1], pts[0], pts[1]));
  });
  return melhor;
}

/**
 * Objetos que pintam o ponto (x, y), do que está por cima para o que está por baixo.
 * `tolerancia` (pt) alarga os traços finos para se conseguirem apanhar com o rato.
 * Texto e imagens contam pela caixa; degradés pela área de recorte.
 */
export function objetosEm(eventos: EventoDesenho[], x: number, y: number, tolerancia = 0.5, max = 8): Toque[] {
  const r: Toque[] = [];
  for (let i = eventos.length - 1; i >= 0 && r.length < max; i--) {
    const e = eventos[i];
    const b = e.bbox;
    if (x < b.x0 - tolerancia || x > b.x1 + tolerancia || y < b.y0 - tolerancia || y > b.y1 + tolerancia) continue;
    if (e.texto?.invisivel) continue;

    if (e.tipo !== 'forma') {
      // texto, imagem, degradé: a caixa é a melhor aproximação que temos
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
      r.push({ evento: e, preenchimento: e.preenche, traco: e.traca });
      continue;
    }

    const g = e.geometria;
    if (!g) {
      // formas grandes demais para guardar os contornos: só a caixa
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
      r.push({ evento: e, preenchimento: e.preenche, traco: e.traca });
      continue;
    }
    // o recorte vale para o que se pinta: a caixa já vem recortada, por isso confirma-se sempre nela
    const dentroDaCaixa = x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
    const preenchimento = e.preenche && dentroDaCaixa && pontoNoPreenchimento(g, x, y);
    const folga = Math.max((e.espessuraTraco ?? 0) / 2, tolerancia);
    const traco = e.traca && distanciaAoTraco(g, x, y) <= folga;
    if (preenchimento || traco) r.push({ evento: e, preenchimento, traco });
  }
  return r;
}

// --- apresentação

export interface ParteLida {
  parte: 'Preenchimento' | 'Traço';
  cor: Cor;
  /** "C 0 · M 100 · Y 0 · K 0", "PANTONE 485 C · 60%" */
  valores: string;
  /** Cor CSS aproximada (não há para spots) */
  amostra?: string;
  overprint: 'ligado' | 'desligado' | 'sem-efeito';
}

export interface Leitura {
  objeto: 'Forma' | 'Texto' | 'Imagem' | 'Degradé';
  partes: ParteLida[];
  /** Imagens e degradés: não sabemos a cor de cada ponto */
  nota?: string;
}

const pct = (v: number): string => {
  const p = Math.round(v * 1000) / 10;
  return Number.isInteger(p) ? String(p) : p.toFixed(1).replace('.', ',');
};

/** Cor CSS aproximada. CMYK → RGB ingénuo: serve de amostra, não de prova de cor. */
export function amostraCss(c: Cor): string | undefined {
  const v = c.valores;
  switch (c.familia) {
    case 'CMYK': {
      const [C, M, Y, K] = v;
      return rgb((1 - C) * (1 - K), (1 - M) * (1 - K), (1 - Y) * (1 - K));
    }
    case 'RGB':
      return rgb(v[0], v[1], v[2]);
    case 'Gray':
      return rgb(v[0], v[0], v[0]);
    default:
      return undefined;
  }
}
const rgb = (r: number, g: number, b: number) => `rgb(${[r, g, b].map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255)).join(' ')})`;

export function valoresDaCor(c: Cor): string {
  const v = c.valores;
  switch (c.familia) {
    case 'CMYK':
      return `C ${pct(v[0])} · M ${pct(v[1])} · Y ${pct(v[2])} · K ${pct(v[3])}`;
    case 'RGB':
      return `RGB ${v.map((x) => Math.round(x * 255)).join(' · ')}`;
    case 'Gray':
      return `Cinzento · K ${pct(1 - v[0])}%`;
    case 'Separation':
      return `${c.nomes?.[0] ?? 'spot'} · ${pct(v[0] ?? 1)}%`;
    case 'DeviceN':
      return (c.nomes ?? []).map((n, i) => `${n} ${pct(v[i] ?? 0)}%`).join(' · ');
    case 'Lab':
      return `Lab ${v.map((x) => Math.round(x)).join(' · ')}`;
    case 'Pattern':
      return 'Padrão';
    default:
      return descreverCor(c) || 'Cor desconhecida';
  }
}

function parte(nome: ParteLida['parte'], cor: Cor, ligado: boolean, modo: 0 | 1): ParteLida {
  const efetivo = overprintEfetivo(cor, ligado, modo);
  return {
    parte: nome,
    cor,
    valores: valoresDaCor(cor),
    amostra: amostraCss(cor),
    overprint: !ligado ? 'desligado' : efetivo ? 'ligado' : 'sem-efeito',
  };
}

export function lerToque(t: Toque): Leitura {
  const e = t.evento;
  const partes: ParteLida[] = [];
  if (t.preenchimento && e.cor && e.tipo !== 'shading') partes.push(parte('Preenchimento', e.cor, e.overprintPreenchimento, e.modoOverprint));
  if (t.traco && e.corTraco) partes.push(parte('Traço', e.corTraco, e.overprintTraco, e.modoOverprint));
  const objeto = e.tipo === 'texto' ? 'Texto' : e.tipo === 'imagem' ? 'Imagem' : e.tipo === 'shading' ? 'Degradé' : 'Forma';
  let nota: string | undefined;
  if (e.tipo === 'imagem') {
    const i = e.imagem;
    nota = i && i.espacoCor !== 'Mask' ? `Imagem ${i.espacoCor}${i.nomes?.length ? ` (${i.nomes.join(', ')})` : ''}, ${Math.round(Math.min(i.ppiX, i.ppiY))} ppi. A cor de cada pixel não é lida.` : undefined;
    if (i?.espacoCor === 'Mask') nota = 'Máscara de 1 bit: pinta com a cor de preenchimento.';
  } else if (e.tipo === 'shading') {
    nota = 'Degradé: a cor varia de ponto para ponto e não é lida.';
  }
  return { objeto, partes, nota };
}
