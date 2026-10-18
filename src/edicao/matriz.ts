/**
 * Matrizes como o PDF as escreve: [a b c d e f], com x' = a·x + c·y + e e y' = b·x + d·y + f. O produto `A·B` aplica
 * primeiro A e depois B (é o que `cm` faz: a matriz nova entra à frente da que já está em vigor).
 */
export type Matriz = [number, number, number, number, number, number];

export const IDENTIDADE: Matriz = [1, 0, 0, 1, 0, 0];

/** Aplica primeiro `a`, depois `b` */
export function produto(a: Matriz, b: Matriz): Matriz {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

export function inversa(m: Matriz): Matriz | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det || !Number.isFinite(det)) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

export const aplicarAoPonto = (m: Matriz, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export const translacao = (dx: number, dy: number): Matriz => [1, 0, 0, 1, dx, dy];

/** Muda a escala em torno de um ponto (que fica onde está) */
export const escalaEm = (sx: number, sy: number, ax: number, ay: number): Matriz => [sx, 0, 0, sy, ax * (1 - sx), ay * (1 - sy)];

/**
 * A matriz que, posta com `cm` à frente do objeto, faz no espaço da página o que `m` diz. O objeto desenha-se com a
 * `ctm` (do seu espaço para o da página): para ficar em `ctm·m` basta uma `l` com `l·ctm = ctm·m`.
 */
export function matrizLocal(ctm: Matriz, m: Matriz): Matriz | null {
  const inv = inversa(ctm);
  return inv ? produto(produto(ctm, m), inv) : null;
}

export const ehIdentidade = (m: Matriz, tol = 1e-9) => m.every((v, i) => Math.abs(v - IDENTIDADE[i]) <= tol);

/** Só desloca (sem mudar a escala nem rodar)? */
export const soDesloca = (m: Matriz, tol = 1e-9) => Math.abs(m[0] - 1) <= tol && Math.abs(m[3] - 1) <= tol && Math.abs(m[1]) <= tol && Math.abs(m[2]) <= tol;

/** A caixa (x0, y0, x1, y1) depois de transformada: a caixa que contém os quatro cantos */
export function transformarCaixa(c: { x0: number; y0: number; x1: number; y1: number }, m: Matriz) {
  const p = [aplicarAoPonto(m, c.x0, c.y0), aplicarAoPonto(m, c.x1, c.y0), aplicarAoPonto(m, c.x0, c.y1), aplicarAoPonto(m, c.x1, c.y1)];
  return { x0: Math.min(...p.map((q) => q[0])), y0: Math.min(...p.map((q) => q[1])), x1: Math.max(...p.map((q) => q[0])), y1: Math.max(...p.map((q) => q[1])) };
}

/** A matriz (escala e deslocamento) que leva a caixa `de` à caixa `para`. Uma caixa sem largura ou altura só se desloca. */
export function matrizParaCaixa(de: { x0: number; y0: number; x1: number; y1: number }, para: { x0: number; y0: number; x1: number; y1: number }): Matriz {
  const lar = de.x1 - de.x0;
  const alt = de.y1 - de.y0;
  const sx = lar > 1e-9 ? (para.x1 - para.x0) / lar : 1;
  const sy = alt > 1e-9 ? (para.y1 - para.y0) / alt : 1;
  return [sx, 0, 0, sy, para.x0 - de.x0 * sx, para.y0 - de.y0 * sy];
}

/** Escreve um número para um content stream: sem notação científica, e sem zeros a mais */
export function numero(n: number): string {
  const r = Math.round(n * 1e5) / 1e5;
  return Object.is(r, -0) ? '0' : r.toFixed(5).replace(/\.?0+$/, '') || '0';
}
