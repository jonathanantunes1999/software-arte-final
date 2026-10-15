/**
 * Tokenizador de content streams. Percorre o texto (latin1: 1 carácter = 1 byte) e
 * devolve operações { op, args }. Não interpreta nada, só separa operadores e operandos.
 */

export interface NomePdf {
  nome: string;
}
export interface TextoPdf {
  /** Bytes da string, um por carácter */
  texto: string;
}
export type Operando = number | boolean | null | NomePdf | TextoPdf | Operando[] | { dict: Record<string, Operando> };

export interface Operacao {
  op: string;
  args: Operando[];
  /** Posição, no texto original, do primeiro operando (ou do operador, se não tiver operandos) */
  inicio: number;
  /** Posição logo a seguir ao operador */
  fim: number;
}

const ESPACO = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]); // ( ) < > [ ] { } / %

const ehEspaco = (c: number) => ESPACO.has(c);
const ehFim = (c: number) => ESPACO.has(c) || DELIM.has(c);

export function nomeDe(o: Operando | undefined): string | undefined {
  return o !== null && typeof o === 'object' && 'nome' in o ? o.nome : undefined;
}

export function textoDe(o: Operando | undefined): string | undefined {
  return o !== null && typeof o === 'object' && 'texto' in o ? o.texto : undefined;
}

export function numeroDe(o: Operando | undefined, omissao = 0): number {
  return typeof o === 'number' && Number.isFinite(o) ? o : omissao;
}

const RE_NUMERO = /^[+-]*(\d+\.?\d*|\.\d+)$/;

function lerNumero(t: string): number | null {
  if (!RE_NUMERO.test(t)) return null;
  // Alguns geradores escrevem "--5" ou "+-3": vale o último sinal significativo
  const negativo = t.startsWith('-');
  const v = parseFloat(t.replace(/^[+-]+/, ''));
  return negativo ? -v : v;
}

export function* operacoes(s: string): Generator<Operacao> {
  const n = s.length;
  let i = 0;
  let operandos: Operando[] = [];
  // onde começa a operação em curso (o primeiro token depois da operação anterior)
  let inicioOp = -1;

  // Pilha para arrays e dicionários aninhados
  type Quadro = { tipo: 'array'; itens: Operando[] } | { tipo: 'dict'; itens: Operando[] };
  const pilha: Quadro[] = [];
  const empurrar = (o: Operando) => {
    if (pilha.length) pilha[pilha.length - 1].itens.push(o);
    else operandos.push(o);
  };

  while (i < n) {
    const c = s.charCodeAt(i);

    if (ehEspaco(c)) {
      i++;
      continue;
    }

    if (c === 37) {
      // comentário até ao fim da linha
      while (i < n && s.charCodeAt(i) !== 10 && s.charCodeAt(i) !== 13) i++;
      continue;
    }

    if (inicioOp < 0) inicioOp = i;

    if (c === 40) {
      // string literal (...)
      let prof = 1;
      let out = '';
      i++;
      while (i < n && prof > 0) {
        const ch = s.charCodeAt(i);
        if (ch === 92) {
          i++;
          const e = s[i];
          if (e === 'n') out += '\n';
          else if (e === 'r') out += '\r';
          else if (e === 't') out += '\t';
          else if (e === 'b') out += '\b';
          else if (e === 'f') out += '\f';
          else if (e >= '0' && e <= '7') {
            let oct = e;
            while (oct.length < 3 && s[i + 1] >= '0' && s[i + 1] <= '7') oct += s[++i];
            out += String.fromCharCode(parseInt(oct, 8) & 255);
          } else if (e === '\r') {
            if (s[i + 1] === '\n') i++;
          } else if (e === '\n') {
            /* continuação de linha */
          } else if (e !== undefined) out += e;
          i++;
        } else {
          if (ch === 40) prof++;
          else if (ch === 41) {
            prof--;
            if (prof === 0) {
              i++;
              break;
            }
          }
          out += s[i];
          i++;
        }
      }
      empurrar({ texto: out });
      continue;
    }

    if (c === 60) {
      if (s.charCodeAt(i + 1) === 60) {
        pilha.push({ tipo: 'dict', itens: [] });
        i += 2;
        continue;
      }
      // string hexadecimal <...>
      const fim = s.indexOf('>', i + 1);
      const fimReal = fim === -1 ? n : fim;
      let hex = s.slice(i + 1, fimReal).replace(/[^0-9A-Fa-f]/g, '');
      if (hex.length % 2) hex += '0';
      let out = '';
      for (let k = 0; k < hex.length; k += 2) out += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
      empurrar({ texto: out });
      i = fimReal + 1;
      continue;
    }

    if (c === 62) {
      if (s.charCodeAt(i + 1) === 62) {
        i += 2;
        const q = pilha.pop();
        if (q && q.tipo === 'dict') {
          const dict: Record<string, Operando> = {};
          for (let k = 0; k + 1 < q.itens.length; k += 2) {
            const chave = nomeDe(q.itens[k]);
            if (chave !== undefined) dict[chave] = q.itens[k + 1];
          }
          empurrar({ dict });
        }
        continue;
      }
      i++;
      continue;
    }

    if (c === 91) {
      pilha.push({ tipo: 'array', itens: [] });
      i++;
      continue;
    }

    if (c === 93) {
      i++;
      const q = pilha.pop();
      if (q) empurrar(q.itens);
      continue;
    }

    if (c === 123 || c === 125 || c === 41) {
      i++;
      continue;
    }

    if (c === 47) {
      // /Nome com #xx
      let j = i + 1;
      while (j < n && !ehFim(s.charCodeAt(j))) j++;
      const nome = s.slice(i + 1, j).replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      empurrar({ nome });
      i = j;
      continue;
    }

    // número ou operador
    const inicioToken = i;
    let j = i;
    while (j < n && !ehFim(s.charCodeAt(j))) j++;
    const t = s.slice(i, j);
    i = j;

    const num = lerNumero(t);
    if (num !== null) {
      empurrar(num);
      continue;
    }
    if (t === 'true') {
      empurrar(true);
      continue;
    }
    if (t === 'false') {
      empurrar(false);
      continue;
    }
    if (t === 'null') {
      empurrar(null);
      continue;
    }

    if (t === 'BI') {
      const inicioBI = inicioToken;
      // imagem inline: pares chave/valor até ID, depois dados binários até EI
      const { inicioId, inicioDados } = procurarId(s, i);
      const toks = tokensSimples(s.slice(i, inicioId));
      const dict: Record<string, Operando> = {};
      for (let k = 0; k + 1 < toks.length; k += 2) {
        const chave = nomeDe(toks[k]);
        if (chave !== undefined) dict[chave] = toks[k + 1];
      }
      i = procurarEI(s, inicioDados);
      operandos = [];
      yield { op: 'INLINEIMAGE', args: [{ dict }], inicio: inicioBI, fim: i };
      inicioOp = -1;
      continue;
    }

    if (pilha.length) {
      // operador dentro de array/dict: ignorar (conteúdo malformado)
      continue;
    }
    const args = operandos;
    operandos = [];
    yield { op: t, args, inicio: inicioOp, fim: i };
    inicioOp = -1;
  }
}

/** Tokeniza só operandos (usado no cabeçalho das imagens inline). */
function tokensSimples(s: string): Operando[] {
  const out: Operando[] = [];
  for (const o of operacoes(s + '\n__X__')) {
    if (o.op === '__X__') {
      out.push(...o.args);
    }
  }
  return out;
}

function procurarId(s: string, de: number): { inicioId: number; inicioDados: number } {
  const re = /(^|[\s\]>)])ID(\s|$)/g;
  re.lastIndex = de;
  const m = re.exec(s);
  if (!m) return { inicioId: s.length, inicioDados: s.length };
  const inicioId = m.index + m[1].length;
  // depois de ID vem um único espaço em branco
  return { inicioId, inicioDados: inicioId + 3 };
}

function procurarEI(s: string, de: number): number {
  const re = /\sEI(?=\s|$)/g;
  re.lastIndex = Math.max(0, de - 1);
  const m = re.exec(s);
  return m ? m.index + m[0].length : s.length;
}
