import { PDFName, PDFRawStream, type PDFDict, type PDFObject } from 'pdf-lib';
import type { Leitor } from '../analise/leitor';
import { MacRomanEncoding, StandardEncoding, WinAnsiEncoding, LISTA_GLIFOS } from './tabelas';
import { lerPrograma, type Cmd, type Programa } from './programa';

/**
 * Uma fonte do PDF vista como "código → contorno do glifo". Cobre o que está incorporado em
 * TrueType, OpenType e CFF (simples e compostas com Identity-H). O resto devolve o motivo.
 */

export interface FonteConvertivel {
  composta: boolean;
  /** Contorno normalizado a 1 em (1 = o tamanho da fonte), y para cima; null se o código não tem glifo */
  glifo(codigo: number): Cmd[] | null;
}

export type ResultadoFonte = { ok: FonteConvertivel } | { erro: string; jaVetorial?: boolean };

const ENCODINGS: Record<string, string[]> = { WinAnsiEncoding, MacRomanEncoding, StandardEncoding };

function bytesDe(l: Leitor, s: PDFObject | undefined): Uint8Array | null {
  const st = l.stream(s);
  if (!st) return null;
  try {
    return l.bytes(st);
  } catch {
    return null;
  }
}

/** Nome de glifo → Unicode: lista AGL, uniXXXX e uXXXX[XX] */
export function unicodeDoNome(nome: string): number | undefined {
  const direto = LISTA_GLIFOS[nome];
  if (direto !== undefined) return direto;
  const base = nome.split('.')[0];
  if (LISTA_GLIFOS[base] !== undefined) return LISTA_GLIFOS[base];
  let m = /^uni([0-9A-Fa-f]{4})/.exec(base);
  if (m) return parseInt(m[1], 16);
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(base);
  if (m) return parseInt(m[1], 16);
  return undefined;
}

/** Tabela código → nome de glifo de uma fonte simples: codificação base e /Differences */
function nomesDaCodificacao(l: Leitor, fonte: PDFDict, simbolica: boolean): { nomes: (string | undefined)[]; temEncoding: boolean } {
  const enc = l.res(fonte.get(PDFName.of('Encoding')));
  const nomes: (string | undefined)[] = new Array(256).fill(undefined);
  let base: string[] | undefined;
  let temEncoding = false;
  const nomeEnc = l.nome(enc);
  if (nomeEnc) {
    base = ENCODINGS[nomeEnc];
    temEncoding = !!base;
  } else if (l.dict(enc)) {
    const d = l.dict(enc)!;
    const b = l.nome(l.get(d, 'BaseEncoding'));
    base = b ? ENCODINGS[b] : undefined;
    temEncoding = true;
    if (!base && !simbolica) base = StandardEncoding;
    const dif = l.itens(l.get(d, 'Differences'));
    let codigo = 0;
    if (base) base.forEach((n, i) => (nomes[i] = n || undefined));
    for (const x of dif) {
      const num = l.num(x);
      if (num !== undefined) codigo = num;
      else {
        const n = l.nome(x);
        if (n !== undefined && codigo >= 0 && codigo < 256) nomes[codigo++] = n;
      }
    }
    return { nomes, temEncoding };
  }
  if (base) base.forEach((n, i) => (nomes[i] = n || undefined));
  return { nomes, temEncoding };
}

function contornoNormalizado(p: Programa, gid: number | undefined): Cmd[] | null {
  if (gid === undefined || gid <= 0) return null;
  const cmds = p.contorno(gid);
  if (!cmds.length) return null;
  const k = 1 / p.unidadesPorEm;
  return cmds.map((c) => {
    if (c.t === 'Z') return c;
    if (c.t === 'C') return { t: 'C', x1: c.x1 * k, y1: c.y1 * k, x2: c.x2 * k, y2: c.y2 * k, x: c.x * k, y: c.y * k };
    return { t: c.t, x: c.x * k, y: c.y * k };
  });
}

/** Programa da fonte a partir do FontDescriptor */
function programaDoDescritor(l: Leitor, desc: PDFDict | undefined): { ok: Programa } | { erro: string } {
  if (!desc) return { erro: 'fonte sem FontDescriptor (não incorporada)' };
  if (desc.get(PDFName.of('FontFile'))) return { erro: 'fonte Type 1 (FontFile)' };
  const f2 = desc.get(PDFName.of('FontFile2'));
  const f3 = desc.get(PDFName.of('FontFile3'));
  if (f2) {
    const b = bytesDe(l, f2);
    return b ? lerPrograma(b, 'sfnt') : { erro: 'não consegui ler a fonte incorporada' };
  }
  if (f3) {
    const sub = l.nome(l.get(l.dict(f3), 'Subtype'));
    const b = bytesDe(l, f3);
    if (!b) return { erro: 'não consegui ler a fonte incorporada' };
    if (sub === 'OpenType') return lerPrograma(b, 'sfnt');
    if (sub === 'Type1C' || sub === 'CIDFontType0C') return lerPrograma(b, 'cff');
    return { erro: `fonte incorporada de tipo ${sub ?? 'desconhecido'}` };
  }
  return { erro: 'fonte não incorporada' };
}

export function abrirFontePdf(l: Leitor, fonte: PDFDict): ResultadoFonte {
  const subtype = l.nome(l.get(fonte, 'Subtype'));
  if (subtype === 'Type3') return { erro: 'fonte Type 3 (já é vetorial)', jaVetorial: true };

  // --- composta (Type0)
  if (subtype === 'Type0') {
    const enc = l.res(fonte.get(PDFName.of('Encoding')));
    const nomeEnc = l.nome(enc);
    if (nomeEnc === 'Identity-V') return { erro: 'escrita vertical' };
    if (nomeEnc !== 'Identity-H') return { erro: 'CMap que não é Identity-H' };
    const desc = l.dict(l.itens(l.get(fonte, 'DescendantFonts'))[0]);
    if (!desc) return { erro: 'fonte composta sem descendente' };
    const prog = programaDoDescritor(l, l.dict(l.get(desc, 'FontDescriptor')));
    if ('erro' in prog) return prog;
    const p = prog.ok;
    const tipoCid = l.nome(l.get(desc, 'Subtype'));
    let mapaGid: Uint8Array | null = null;
    const c2g = l.res(desc.get(PDFName.of('CIDToGIDMap')));
    if (c2g instanceof PDFRawStream || l.stream(c2g)) mapaGid = bytesDe(l, c2g);
    const cache = new Map<number, Cmd[] | null>();
    return {
      ok: {
        composta: true,
        glifo(cid) {
          if (cache.has(cid)) return cache.get(cid)!;
          let gid: number | undefined;
          if (tipoCid === 'CIDFontType2' || p.tipo === 'truetype') gid = mapaGid ? ((mapaGid[2 * cid] ?? 0) << 8) | (mapaGid[2 * cid + 1] ?? 0) : cid;
          else gid = p.eCid ? p.porCid(cid) : cid;
          const r = contornoNormalizado(p, gid);
          cache.set(cid, r);
          return r;
        },
      },
    };
  }

  // --- simples
  const desc = l.dict(l.get(fonte, 'FontDescriptor'));
  const prog = programaDoDescritor(l, desc);
  if ('erro' in prog) return prog;
  const p = prog.ok;
  const flags = l.num(l.get(desc, 'Flags')) ?? 0;
  const simbolica = (flags & 4) !== 0 && (flags & 32) === 0;
  const { nomes, temEncoding } = nomesDaCodificacao(l, fonte, simbolica);
  const cache = new Map<number, Cmd[] | null>();

  const gidTrueType = (codigo: number): number | undefined => {
    const c31 = p.cmaps.find((s) => s.plataforma === 3 && s.codificacao === 1) ?? p.cmaps.find((s) => s.plataforma === 3 && s.codificacao === 10) ?? p.cmaps.find((s) => s.plataforma === 0);
    const c30 = p.cmaps.find((s) => s.plataforma === 3 && s.codificacao === 0);
    const c10 = p.cmaps.find((s) => s.plataforma === 1 && s.codificacao === 0);
    const nome = nomes[codigo];
    if (temEncoding && !simbolica && nome) {
      const u = unicodeDoNome(nome);
      if (c31 && u !== undefined) {
        const g = c31.procurar(u);
        if (g) return g;
      }
      if (c10) {
        const mac = MacRomanEncoding.indexOf(nome);
        if (mac >= 0) {
          const g = c10.procurar(mac);
          if (g) return g;
        }
      }
      const g = p.porNome(nome);
      if (g) return g;
    }
    if (c30) {
      for (const base of [0, 0xf000, 0xf100, 0xf200]) {
        const g = c30.procurar(base + codigo);
        if (g) return g;
      }
    }
    if (c10) {
      const g = c10.procurar(codigo);
      if (g) return g;
    }
    if (c31) {
      const g = c31.procurar(codigo);
      if (g) return g;
    }
    // fonte sem cmap utilizável (subsets): os glifos costumam seguir a ordem dos códigos
    return nome ? p.porNome(nome) : undefined;
  };

  const gidCff = (codigo: number): number | undefined => {
    const nome = nomes[codigo];
    if (nome) {
      const g = p.porNome(nome);
      if (g !== undefined) return g;
    }
    return p.codificacaoCff(codigo);
  };

  return {
    ok: {
      composta: false,
      glifo(codigo) {
        if (cache.has(codigo)) return cache.get(codigo)!;
        const gid = p.tipo === 'truetype' ? gidTrueType(codigo) : gidCff(codigo);
        const r = contornoNormalizado(p, gid);
        cache.set(codigo, r);
        return r;
      },
    },
  };
}
