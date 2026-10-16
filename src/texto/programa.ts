import * as opentype from 'opentype.js';

/**
 * Programa de fonte (TrueType, OpenType ou CFF "nu") visto como: contornos de glifos por índice,
 * mais as tabelas que servem para ligar um código do PDF a um glifo.
 */

export type Cmd =
  | { t: 'M' | 'L'; x: number; y: number }
  | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { t: 'Z' };

export interface SubtabelaCmap {
  plataforma: number;
  codificacao: number;
  /** código → índice de glifo (0 se não existir) */
  procurar(codigo: number): number;
}

export interface Programa {
  tipo: 'truetype' | 'cff';
  unidadesPorEm: number;
  numGlifos: number;
  /** Contorno do glifo, em unidades da fonte, y para cima, só com retas e curvas cúbicas */
  contorno(gid: number): Cmd[];
  /** Índice do glifo com este nome (CFF e 'post' do TrueType) */
  porNome(nome: string): number | undefined;
  /** CFF com CIDs: índice do glifo de um CID */
  porCid(cid: number): number | undefined;
  eCid: boolean;
  cmaps: SubtabelaCmap[];
  /** CFF: glifo da codificação própria da fonte */
  codificacaoCff(codigo: number): number | undefined;
}

export type ResultadoPrograma = { ok: Programa } | { erro: string };

const u16 = (d: DataView, o: number) => (o + 2 <= d.byteLength ? d.getUint16(o) : 0);
const u32 = (d: DataView, o: number) => (o + 4 <= d.byteLength ? d.getUint32(o) : 0);

// --- cmap do TrueType

/** Lê as subtabelas 'cmap' (formatos 0, 4, 6 e 12), incluindo as (3,0) e (1,0) que o opentype.js não expõe */
export function lerCmaps(sfnt: Uint8Array): SubtabelaCmap[] {
  const d = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const n = u16(d, 4);
  let cmapOff = 0;
  for (let i = 0; i < n; i++) {
    const r = 12 + i * 16;
    if (String.fromCharCode(...sfnt.subarray(r, r + 4)) === 'cmap') cmapOff = u32(d, r + 8);
  }
  if (!cmapOff) return [];
  const nSub = u16(d, cmapOff + 2);
  const r: SubtabelaCmap[] = [];
  for (let i = 0; i < nSub; i++) {
    const plataforma = u16(d, cmapOff + 4 + i * 8);
    const codificacao = u16(d, cmapOff + 6 + i * 8);
    const off = cmapOff + u32(d, cmapOff + 8 + i * 8);
    const formato = u16(d, off);
    let procurar: ((c: number) => number) | undefined;
    if (formato === 0) procurar = (c) => (c >= 0 && c < 256 && off + 6 + c < d.byteLength ? d.getUint8(off + 6 + c) : 0);
    else if (formato === 6) {
      const primeiro = u16(d, off + 6);
      const cont = u16(d, off + 8);
      procurar = (c) => (c >= primeiro && c < primeiro + cont ? u16(d, off + 10 + (c - primeiro) * 2) : 0);
    } else if (formato === 4) {
      const segX2 = u16(d, off + 6);
      const fins = off + 14;
      const inicios = fins + segX2 + 2;
      const deltas = inicios + segX2;
      const desvios = deltas + segX2;
      procurar = (c) => {
        for (let s = 0; s < segX2; s += 2) {
          if (c <= u16(d, fins + s)) {
            const ini = u16(d, inicios + s);
            if (c < ini) return 0;
            const desvio = u16(d, desvios + s);
            if (desvio === 0) return (c + u16(d, deltas + s)) & 0xffff;
            const g = u16(d, desvios + s + desvio + (c - ini) * 2);
            return g === 0 ? 0 : (g + u16(d, deltas + s)) & 0xffff;
          }
        }
        return 0;
      };
    } else if (formato === 12) {
      const grupos = u32(d, off + 12);
      procurar = (c) => {
        for (let g = 0; g < grupos; g++) {
          const o = off + 16 + g * 12;
          const ini = u32(d, o);
          if (c >= ini && c <= u32(d, o + 4)) return u32(d, o + 8) + (c - ini);
        }
        return 0;
      };
    }
    if (procurar) r.push({ plataforma, codificacao, procurar });
  }
  return r;
}

// --- CFF "nu": o PDF guarda só a tabela CFF (FontFile3 /Type1C e /CIDFontType0C)

function lerIndice(b: Uint8Array, o: number): { itens: [number, number][]; fim: number } {
  const n = (b[o] << 8) | b[o + 1];
  if (n === 0) return { itens: [], fim: o + 2 };
  const tam = b[o + 2];
  const off = (i: number) => {
    let v = 0;
    for (let k = 0; k < tam; k++) v = v * 256 + b[o + 3 + i * tam + k];
    return v;
  };
  const base = o + 3 + (n + 1) * tam - 1;
  const itens: [number, number][] = [];
  for (let i = 0; i < n; i++) itens.push([base + off(i), base + off(i + 1)]);
  return { itens, fim: base + off(n) };
}

/** Operadores do Top DICT que nos interessam: nº de glifos (CharStrings) e a FontMatrix */
function lerTopoCff(b: Uint8Array): { numGlifos: number; unidadesPorEm: number } | null {
  if (b.length < 4 || b[0] !== 1) return null;
  const nomes = lerIndice(b, b[2]);
  const topo = lerIndice(b, nomes.fim);
  if (!topo.itens.length) return null;
  const [ini, fim] = topo.itens[0];
  const operandos: number[] = [];
  let charStrings = 0;
  let matriz: number[] | undefined;
  for (let i = ini; i < fim; ) {
    const v = b[i];
    if (v <= 21) {
      let op = v;
      i++;
      if (v === 12) op = 1200 + b[i++];
      if (op === 17) charStrings = operandos[0];
      if (op === 1207) matriz = operandos.slice(0, 6);
      operandos.length = 0;
    } else if (v === 28) {
      operandos.push(((b[i + 1] << 8) | b[i + 2]) << 16 >> 16);
      i += 3;
    } else if (v === 29) {
      operandos.push((b[i + 1] << 24) | (b[i + 2] << 16) | (b[i + 3] << 8) | b[i + 4]);
      i += 5;
    } else if (v === 30) {
      let s = '';
      i++;
      for (let fimReal = false; !fimReal && i < fim; i++) {
        for (const nib of [b[i] >> 4, b[i] & 15]) {
          if (nib === 15) {
            fimReal = true;
            break;
          }
          s += nib < 10 ? String(nib) : nib === 10 ? '.' : nib === 11 ? 'E' : nib === 12 ? 'E-' : nib === 14 ? '-' : '';
        }
      }
      operandos.push(parseFloat(s));
    } else if (v >= 32 && v <= 246) {
      operandos.push(v - 139);
      i++;
    } else if (v >= 247 && v <= 250) {
      operandos.push((v - 247) * 256 + b[i + 1] + 108);
      i += 2;
    } else if (v >= 251 && v <= 254) {
      operandos.push(-(v - 251) * 256 - b[i + 1] - 108);
      i += 2;
    } else i++;
  }
  if (!charStrings) return null;
  const numGlifos = lerIndice(b, charStrings).itens.length;
  const sx = matriz && matriz[0] > 0 ? matriz[0] : 0.001;
  return { numGlifos, unidadesPorEm: Math.round(1 / sx) };
}

function tabela(tag: string, dados: Uint8Array): { tag: string; dados: Uint8Array } {
  return { tag, dados };
}

/** Embrulha uma tabela CFF num ficheiro OpenType mínimo, que é o que o opentype.js sabe ler */
export function embrulharCff(cff: Uint8Array, numGlifos: number, unidadesPorEm: number): Uint8Array {
  const head = new Uint8Array(54);
  const hv = new DataView(head.buffer);
  hv.setUint32(0, 0x00010000);
  hv.setUint32(12, 0x5f0f3cf5);
  hv.setUint16(18, unidadesPorEm);
  const hhea = new Uint8Array(36);
  const hh = new DataView(hhea.buffer);
  hh.setUint32(0, 0x00010000);
  hh.setUint16(4, Math.round(unidadesPorEm * 0.8));
  hh.setInt16(6, -Math.round(unidadesPorEm * 0.2));
  hh.setUint16(34, 1);
  const maxp = new Uint8Array(6);
  const mv = new DataView(maxp.buffer);
  mv.setUint32(0, 0x00005000);
  mv.setUint16(4, numGlifos);
  const hmtx = new Uint8Array(4 + Math.max(0, numGlifos - 1) * 2);
  // 'name' vazia e 'cmap' sem mapeamentos: o opentype.js exige que existam
  const nome = new Uint8Array([0, 0, 0, 0, 0, 6]);
  const cmap = new Uint8Array(36);
  const cv = new DataView(cmap.buffer);
  cv.setUint16(2, 1); // 1 subtabela
  cv.setUint16(4, 3);
  cv.setUint16(6, 1);
  cv.setUint32(8, 12);
  cv.setUint16(12, 4); // formato 4
  cv.setUint16(14, 24);
  cv.setUint16(18, 2); // segCountX2
  cv.setUint16(20, 2); // searchRange
  cv.setUint16(26, 0xffff); // endCode
  cv.setUint16(30, 0xffff); // startCode
  cv.setUint16(32, 1); // idDelta
  // (por ordem alfabética das etiquetas)
  const tabs = [tabela('CFF ', cff), tabela('cmap', cmap), tabela('head', head), tabela('hhea', hhea), tabela('hmtx', hmtx), tabela('maxp', maxp), tabela('name', nome)];
  const n = tabs.length;
  let off = 12 + n * 16;
  const total = tabs.reduce((s, t) => s + ((t.dados.length + 3) & ~3), off);
  const saida = new Uint8Array(total);
  const d = new DataView(saida.buffer);
  d.setUint32(0, 0x4f54544f); // 'OTTO'
  d.setUint16(4, n);
  tabs.forEach((t, i) => {
    const r = 12 + i * 16;
    for (let k = 0; k < 4; k++) saida[r + k] = t.tag.charCodeAt(k);
    d.setUint32(r + 8, off);
    d.setUint32(r + 12, t.dados.length);
    saida.set(t.dados, off);
    off += (t.dados.length + 3) & ~3;
  });
  return saida;
}

// --- do opentype.js para a nossa interface

function paraCubicas(cmds: ReturnType<opentype.Fonte['glyphs']['get']>['path']['commands']): Cmd[] {
  const r: Cmd[] = [];
  let x = 0;
  let y = 0;
  for (const c of cmds) {
    if (c.type === 'M' || c.type === 'L') {
      r.push({ t: c.type, x: c.x, y: c.y });
      x = c.x;
      y = c.y;
    } else if (c.type === 'Q') {
      // quadrática → cúbica exata
      r.push({ t: 'C', x1: x + (2 / 3) * (c.x1 - x), y1: y + (2 / 3) * (c.y1 - y), x2: c.x + (2 / 3) * (c.x1 - c.x), y2: c.y + (2 / 3) * (c.y1 - c.y), x: c.x, y: c.y });
      x = c.x;
      y = c.y;
    } else if (c.type === 'C') {
      r.push({ t: 'C', x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, x: c.x, y: c.y });
      x = c.x;
      y = c.y;
    } else r.push({ t: 'Z' });
  }
  return r;
}

export function lerPrograma(bytes: Uint8Array, formato: 'sfnt' | 'cff'): ResultadoPrograma {
  try {
    let sfnt = bytes;
    let tipo: Programa['tipo'] = 'truetype';
    if (formato === 'cff') {
      const topo = lerTopoCff(bytes);
      if (!topo) return { erro: 'CFF ilegível' };
      sfnt = embrulharCff(bytes, topo.numGlifos, topo.unidadesPorEm);
      tipo = 'cff';
    } else if (bytes.length >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === 'OTTO') tipo = 'cff';
    const font = opentype.parse(sfnt.buffer.slice(sfnt.byteOffset, sfnt.byteOffset + sfnt.byteLength) as ArrayBuffer);

    const porNome = new Map<string, number>();
    const porCid = new Map<number, number>();
    const charset = font.cffEncoding?.charset;
    if (tipo === 'cff' && charset) {
      charset.forEach((n, gid) => {
        if (font.isCIDFont && typeof n === 'string' && n.startsWith('cid')) porCid.set(parseInt(n.slice(3), 10), gid);
        else if (font.isCIDFont && typeof n === 'number') porCid.set(n, gid);
        else if (typeof n === 'string' && !porNome.has(n)) porNome.set(n, gid);
      });
    } else {
      for (let i = 0; i < font.numGlyphs; i++) {
        const nome = font.glyphs.get(i).name;
        if (nome && !porNome.has(nome)) porNome.set(nome, i);
      }
    }
    const enc = font.cffEncoding?.encoding;

    return {
      ok: {
        tipo,
        unidadesPorEm: font.unitsPerEm,
        numGlifos: font.numGlyphs,
        contorno: (gid) => (gid >= 0 && gid < font.numGlyphs ? paraCubicas(font.glyphs.get(gid).path.commands) : []),
        porNome: (n) => porNome.get(n),
        porCid: (c) => porCid.get(c),
        eCid: !!font.isCIDFont,
        cmaps: tipo === 'truetype' || formato === 'sfnt' ? lerCmaps(sfnt) : [],
        codificacaoCff: (c) => {
          const nome = Array.isArray(enc) ? enc[c] : enc?.[c];
          return nome ? porNome.get(nome) : undefined;
        },
      },
    };
  } catch (e) {
    return { erro: `fonte ilegível (${(e as Error).message})` };
  }
}
