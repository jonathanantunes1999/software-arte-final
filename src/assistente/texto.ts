/**
 * Ferramentas para ler o que o utilizador escreve: tira acentos e pontuação, parte em palavras e compara
 * por início de palavra (corrig → corrige, corrigir, corrija…), tolerando uma gralha em palavras compridas.
 */

export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%#.\s-]/g, ' ')
    .replace(/(^|\s)[.-]+|[.-]+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function palavras(s: string): string[] {
  const n = normalizar(s);
  return n ? n.split(' ') : [];
}

/** Distância de Damerau-Levenshtein, com corte: devolve max + 1 se passar do limite */
export function distancia(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  let anterior2: number[] = [];
  let anterior = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const atual = [i];
    let minimo = i;
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, anterior2[j - 2] + 1);
      atual.push(v);
      if (v < minimo) minimo = v;
    }
    if (minimo > max) return max + 1;
    anterior2 = anterior;
    anterior = atual;
  }
  return anterior[n];
}

/**
 * A palavra `p` corresponde ao radical `r`? Começa por ele ("corrig" ↔ "corrigir"), ou é igual a ele a
 * menos de uma gralha quando o radical é comprido ("sangira" ↔ "sangria").
 */
export function combina(p: string, r: string): boolean {
  if (p.startsWith(r)) return true;
  if (r.length >= 6) {
    const inicio = p.slice(0, r.length);
    if (distancia(inicio, r, 1) <= 1) return true;
    if (distancia(p, r, 1) <= 1) return true;
  }
  return false;
}

/** Alguma das palavras combina com algum dos radicais? */
export function tem(ps: string[], radicais: string[]): boolean {
  return ps.some((p) => radicais.some((r) => combina(p, r)));
}

/** Palavra exata (sem tolerância), para siglas curtas como "rgb" ou "ok" */
export function temExata(ps: string[], alvos: string[]): boolean {
  return ps.some((p) => alvos.includes(p));
}

/** A frase normalizada contém esta expressão (palavras seguidas)? */
export function contemExpressao(normalizada: string, expressao: string): boolean {
  return ` ${normalizada} `.includes(` ${expressao} `);
}

/** Primeiro número inteiro que aparece no texto, ou os ordinais por extenso ("primeiro" → 1) */
const ORDINAIS: Record<string, number> = {
  primeir: 1, segund: 2, terceir: 3, quart: 4, quint: 5, sext: 6, setim: 7, oitav: 8, non: 9, decim: 10,
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};
export function numeroNoTexto(ps: string[]): number | null {
  for (const p of ps) if (/^\d+$/.test(p)) return parseInt(p, 10);
  for (const p of ps) for (const [r, n] of Object.entries(ORDINAIS)) if (r.length <= 3 ? p === r : p.startsWith(r)) return n;
  return null;
}
