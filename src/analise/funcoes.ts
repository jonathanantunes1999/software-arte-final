import { PDFRawStream, type PDFObject, type PDFStream } from 'pdf-lib';
import type { Leitor } from './leitor';

/**
 * Funções PDF (tipos 0, 2, 3 e 4), para avaliar a transformação de tinta das spots e dos degradés.
 * Devolve null quando a função não é suportada ou está mal formada.
 */
export type Funcao = (entrada: number[]) => number[];

const grampear = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function limitar(v: number[], dominio: number[]): number[] {
  return v.map((x, i) => (dominio.length >= 2 * i + 2 ? grampear(x, dominio[2 * i], dominio[2 * i + 1]) : x));
}

export function lerFuncao(l: Leitor, obj: PDFObject | undefined, profundidade = 0): Funcao | null {
  if (profundidade > 8) return null;
  const o = l.res(obj);
  const d = l.dict(o);
  if (!d) return null;
  const tipo = l.num(l.get(d, 'FunctionType'));
  const dominio = l.numeros(l.get(d, 'Domain'));
  const alcance = l.numeros(l.get(d, 'Range'));
  const saida = (v: number[]) => (alcance.length ? limitar(v, alcance) : v);

  switch (tipo) {
    case 2: {
      const c0 = l.get(d, 'C0') ? l.numeros(l.get(d, 'C0')) : [0];
      const c1 = l.get(d, 'C1') ? l.numeros(l.get(d, 'C1')) : [1];
      const n = l.num(l.get(d, 'N')) ?? 1;
      if (c0.length !== c1.length || c0.some(Number.isNaN) || c1.some(Number.isNaN)) return null;
      return (e) => {
        const x = limitar([e[0] ?? 0], dominio)[0];
        const t = n === 1 ? x : Math.pow(x, n);
        return saida(c0.map((a, i) => a + t * (c1[i] - a)));
      };
    }
    case 3: {
      const fs = l.itens(l.get(d, 'Functions')).map((f) => lerFuncao(l, f, profundidade + 1));
      const limites = l.numeros(l.get(d, 'Bounds'));
      const codificar = l.numeros(l.get(d, 'Encode'));
      if (!fs.length || fs.some((f) => !f) || dominio.length < 2) return null;
      return (e) => {
        const x = grampear(e[0] ?? 0, dominio[0], dominio[1]);
        let k = 0;
        while (k < limites.length && x >= limites[k]) k++;
        k = Math.min(k, fs.length - 1);
        const a = k === 0 ? dominio[0] : limites[k - 1];
        const b = k === fs.length - 1 ? dominio[1] : limites[k];
        const e0 = codificar[2 * k] ?? 0;
        const e1 = codificar[2 * k + 1] ?? 1;
        const t = b === a ? e0 : e0 + ((x - a) * (e1 - e0)) / (b - a);
        return saida(fs[k]!([t]));
      };
    }
    case 0:
      return funcaoAmostrada(l, o as PDFStream, dominio, alcance);
    case 4:
      return funcaoPostScript(l, o as PDFStream, dominio, alcance);
    default:
      return null;
  }
}

/** Tipo 0 com uma entrada (é o que as spots e os degradés usam); interpola linearmente */
function funcaoAmostrada(l: Leitor, s: PDFStream, dominio: number[], alcance: number[]): Funcao | null {
  const d = s.dict;
  const tamanho = l.numeros(l.get(d, 'Size'));
  const bps = l.num(l.get(d, 'BitsPerSample'));
  if (tamanho.length !== 1 || !bps || alcance.length < 2 || dominio.length < 2) return null;
  if (![1, 2, 4, 8, 12, 16, 24, 32].includes(bps)) return null;
  const nSaidas = alcance.length / 2;
  const n = tamanho[0];
  let bytes: Uint8Array;
  try {
    bytes = l.bytes(s);
  } catch {
    return null;
  }
  const codificar = l.get(d, 'Encode') ? l.numeros(l.get(d, 'Encode')) : [0, n - 1];
  const decodificar = l.get(d, 'Decode') ? l.numeros(l.get(d, 'Decode')) : alcance;
  const maximo = Math.pow(2, bps) - 1;

  const amostra = (i: number, j: number): number => {
    const bit = (i * nSaidas + j) * bps;
    let v = 0;
    for (let b = 0; b < bps; b += 8) {
      const byte = bytes[(bit + b) >> 3] ?? 0;
      if (bps >= 8) v = v * 256 + byte;
      else {
        const desloc = 8 - bps - (bit & 7);
        v = (byte >> desloc) & ((1 << bps) - 1);
      }
    }
    return v;
  };

  return (e) => {
    const x = grampear(e[0] ?? 0, dominio[0], dominio[1]);
    const t = dominio[1] === dominio[0] ? 0 : codificar[0] + ((x - dominio[0]) * (codificar[1] - codificar[0])) / (dominio[1] - dominio[0]);
    const p = grampear(t, 0, n - 1);
    const i0 = Math.floor(p);
    const i1 = Math.min(i0 + 1, n - 1);
    const f = p - i0;
    const r: number[] = [];
    for (let j = 0; j < nSaidas; j++) {
      const v = amostra(i0, j) * (1 - f) + amostra(i1, j) * f;
      const lo = decodificar[2 * j] ?? alcance[2 * j];
      const hi = decodificar[2 * j + 1] ?? alcance[2 * j + 1];
      r.push(lo + (v / maximo) * (hi - lo));
    }
    return limitar(r, alcance);
  };
}

// --- tipo 4: calculadora PostScript

type No = number | boolean | string | No[];

function lerProcedimento(texto: string): No[] | null {
  const toks = texto.match(/[{}]|[^\s{}]+/g);
  if (!toks) return null;
  let i = 0;
  const bloco = (): No[] | null => {
    const r: No[] = [];
    while (i < toks.length) {
      const t = toks[i++];
      if (t === '{') {
        const b = bloco();
        if (!b) return null;
        r.push(b);
      } else if (t === '}') return r;
      else if (t === 'true') r.push(true);
      else if (t === 'false') r.push(false);
      else if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) r.push(parseFloat(t));
      else r.push(t);
    }
    return null;
  };
  if (toks[0] !== '{') return null;
  i = 1;
  return bloco();
}

function executar(codigo: No[], pilha: (number | boolean)[], passos: { n: number }): boolean {
  const num = (): number => {
    const v = pilha.pop();
    return typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? 0);
  };
  const bool = (): boolean => {
    const v = pilha.pop();
    return typeof v === 'number' ? v !== 0 : !!v;
  };
  for (let k = 0; k < codigo.length; k++) {
    if (++passos.n > 20000 || pilha.length > 200) return false;
    const c = codigo[k];
    if (typeof c === 'number' || typeof c === 'boolean') {
      pilha.push(c);
      continue;
    }
    if (Array.isArray(c)) {
      // um procedimento só aparece antes de if / ifelse
      const seguinte = codigo[k + 1];
      if (seguinte === 'if') {
        k++;
        if (bool() && !executar(c, pilha, passos)) return false;
      } else if (Array.isArray(seguinte) && codigo[k + 2] === 'ifelse') {
        k += 2;
        if (!executar(bool() ? c : seguinte, pilha, passos)) return false;
      } else return false;
      continue;
    }
    switch (c) {
      case 'abs': pilha.push(Math.abs(num())); break;
      case 'add': { const b = num(); pilha.push(num() + b); break; }
      case 'sub': { const b = num(); pilha.push(num() - b); break; }
      case 'mul': { const b = num(); pilha.push(num() * b); break; }
      case 'div': { const b = num(); const a = num(); pilha.push(b === 0 ? 0 : a / b); break; }
      case 'idiv': { const b = Math.trunc(num()); const a = Math.trunc(num()); pilha.push(b === 0 ? 0 : Math.trunc(a / b)); break; }
      case 'mod': { const b = Math.trunc(num()); const a = Math.trunc(num()); pilha.push(b === 0 ? 0 : a % b); break; }
      case 'neg': pilha.push(-num()); break;
      case 'ceiling': pilha.push(Math.ceil(num())); break;
      case 'floor': pilha.push(Math.floor(num())); break;
      case 'round': pilha.push(Math.floor(num() + 0.5)); break;
      case 'truncate': case 'cvi': pilha.push(Math.trunc(num())); break;
      case 'cvr': break;
      case 'sqrt': pilha.push(Math.sqrt(Math.max(0, num()))); break;
      case 'sin': pilha.push(Math.sin((num() * Math.PI) / 180)); break;
      case 'cos': pilha.push(Math.cos((num() * Math.PI) / 180)); break;
      case 'atan': { const b = num(); const a = num(); const g = (Math.atan2(a, b) * 180) / Math.PI; pilha.push(g < 0 ? g + 360 : g); break; }
      case 'exp': { const b = num(); pilha.push(Math.pow(num(), b)); break; }
      case 'ln': pilha.push(Math.log(Math.max(num(), 1e-300))); break;
      case 'log': pilha.push(Math.log10(Math.max(num(), 1e-300))); break;
      case 'eq': { const b = num(); pilha.push(num() === b); break; }
      case 'ne': { const b = num(); pilha.push(num() !== b); break; }
      case 'gt': { const b = num(); pilha.push(num() > b); break; }
      case 'ge': { const b = num(); pilha.push(num() >= b); break; }
      case 'lt': { const b = num(); pilha.push(num() < b); break; }
      case 'le': { const b = num(); pilha.push(num() <= b); break; }
      case 'and': { const b = pilha.pop(); const a = pilha.pop(); pilha.push(typeof a === 'boolean' && typeof b === 'boolean' ? a && b : (Number(a) & Number(b))); break; }
      case 'or': { const b = pilha.pop(); const a = pilha.pop(); pilha.push(typeof a === 'boolean' && typeof b === 'boolean' ? a || b : (Number(a) | Number(b))); break; }
      case 'xor': { const b = pilha.pop(); const a = pilha.pop(); pilha.push(typeof a === 'boolean' && typeof b === 'boolean' ? a !== b : (Number(a) ^ Number(b))); break; }
      case 'not': { const a = pilha.pop(); pilha.push(typeof a === 'boolean' ? !a : ~Number(a)); break; }
      case 'bitshift': { const s = Math.trunc(num()); const a = Math.trunc(num()); pilha.push(s >= 0 ? a << s : a >> -s); break; }
      case 'true': pilha.push(true); break;
      case 'false': pilha.push(false); break;
      case 'pop': pilha.pop(); break;
      case 'dup': { const a = pilha[pilha.length - 1]; if (a === undefined) return false; pilha.push(a); break; }
      case 'exch': { const b = pilha.pop(); const a = pilha.pop(); if (a === undefined || b === undefined) return false; pilha.push(b, a); break; }
      case 'copy': { const n = Math.trunc(num()); if (n < 0 || n > pilha.length) return false; pilha.push(...pilha.slice(pilha.length - n)); break; }
      case 'index': { const n = Math.trunc(num()); const v = pilha[pilha.length - 1 - n]; if (v === undefined) return false; pilha.push(v); break; }
      case 'roll': {
        const j = Math.trunc(num());
        const n = Math.trunc(num());
        if (n < 0 || n > pilha.length) return false;
        if (n > 0) {
          const topo = pilha.splice(pilha.length - n, n);
          const r = ((j % n) + n) % n;
          pilha.push(...topo.slice(n - r), ...topo.slice(0, n - r));
        }
        break;
      }
      default:
        return false;
    }
  }
  return true;
}

function funcaoPostScript(l: Leitor, s: PDFStream, dominio: number[], alcance: number[]): Funcao | null {
  if (!alcance.length || !dominio.length) return null;
  let texto: string;
  try {
    const bytes = s instanceof PDFRawStream ? l.bytes(s) : s.getContents();
    texto = String.fromCharCode(...bytes);
  } catch {
    return null;
  }
  const proc = lerProcedimento(texto);
  if (!proc) return null;
  const nSaidas = alcance.length / 2;
  return (e) => {
    const pilha: (number | boolean)[] = limitar(e, dominio);
    if (!executar(proc, pilha, { n: 0 }) || pilha.length < nSaidas) return new Array(nSaidas).fill(0);
    const r = pilha.slice(pilha.length - nSaidas).map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v));
    return limitar(r, alcance);
  };
}
