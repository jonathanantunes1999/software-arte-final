import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Fontes instaladas no computador, para desenhar em curvas o texto de PDFs que não trazem a fonte
 * incorporada. Só lê o essencial (a tabela 'name' de cada ficheiro) e só carrega a fonte escolhida.
 * Código puro de Node, sem Electron, para se poder testar.
 */

const EXTENSOES = new Set(['.ttf', '.otf', '.ttc', '.otc']);

// --- leitura binária

/** Lê `n` bytes a partir de `pos` num ficheiro aberto */
function ler(fd, pos, n) {
  const b = Buffer.alloc(n);
  const lidos = readSync(fd, b, 0, n, pos);
  return lidos === n ? b : b.subarray(0, lidos);
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function textoDoNome(b, plataforma) {
  if (plataforma === 1) return b.toString('latin1');
  // Windows e Unicode: UTF-16 big-endian
  let s = '';
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
  return s;
}

/** Lê a tabela 'name' de uma fonte que começa em `inicio` no ficheiro */
function nomesDaFace(fd, inicio) {
  const cab = ler(fd, inicio, 12);
  if (cab.length < 12) return null;
  const n = cab.readUInt16BE(4);
  if (n === 0 || n > 200) return null;
  const dir = ler(fd, inicio + 12, n * 16);
  let tabela = null;
  for (let i = 0; i + 16 <= dir.length; i += 16) {
    if (dir.toString('latin1', i, i + 4) === 'name') tabela = { pos: dir.readUInt32BE(i + 8), tam: dir.readUInt32BE(i + 12) };
  }
  if (!tabela || tabela.tam < 6 || tabela.tam > 4_000_000) return null;
  const t = ler(fd, tabela.pos, tabela.tam);
  if (t.length < 6) return null;
  const contagem = t.readUInt16BE(2);
  const armazenamento = t.readUInt16BE(4);
  const nomes = {};
  for (let i = 0; i < contagem; i++) {
    const o = 6 + i * 12;
    if (o + 12 > t.length) break;
    const plataforma = t.readUInt16BE(o);
    const id = t.readUInt16BE(o + 6);
    const comp = t.readUInt16BE(o + 8);
    const desl = armazenamento + t.readUInt16BE(o + 10);
    if (![1, 2, 4, 6, 16, 17].includes(id) || desl + comp > t.length) continue;
    // 3 = Windows (Unicode), 1 = Mac; o Windows ganha
    if (plataforma !== 3 && plataforma !== 1 && plataforma !== 0) continue;
    const valor = textoDoNome(t.subarray(desl, desl + comp), plataforma);
    if (!valor) continue;
    if (nomes[id] === undefined || plataforma === 3) nomes[id] = valor;
  }
  const familia = nomes[16] ?? nomes[1];
  if (!familia) return null;
  return {
    familia,
    estilo: nomes[17] ?? nomes[2] ?? 'Regular',
    completo: nomes[4] ?? '',
    postscript: nomes[6] ?? '',
    familiaCompat: nomes[1] ?? familia,
  };
}

/** Faces de um ficheiro de fonte (um TTF/OTF tem uma, um TTC/OTC várias) */
export function lerFacesDoFicheiro(caminho) {
  let fd;
  try {
    fd = openSync(caminho, 'r');
    const cab = ler(fd, 0, 12);
    if (cab.length < 12) return [];
    const marca = cab.toString('latin1', 0, 4);
    if (marca === 'ttcf') {
      const n = Math.min(cab.readUInt32BE(8), 64);
      const deslocamentos = ler(fd, 12, n * 4);
      const faces = [];
      for (let i = 0; i < n; i++) {
        const nomes = nomesDaFace(fd, deslocamentos.readUInt32BE(i * 4));
        if (nomes) faces.push({ caminho, indice: i, ...nomes });
      }
      return faces;
    }
    if (marca === '\x00\x01\x00\x00' || marca === 'OTTO' || marca === 'true') {
      const nomes = nomesDaFace(fd, 0);
      return nomes ? [{ caminho, indice: 0, ...nomes }] : [];
    }
    return [];
  } catch {
    return [];
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* nada a fazer */
      }
    }
  }
}

/**
 * Uma face de um TTC como fonte autónoma: o ficheiro .ttc partilha tabelas entre faces, por isso copiam-se
 * as tabelas desta para um sfnt normal (que é o que o leitor de fontes da app percebe).
 */
export function extrairFace(bytes, indice) {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const marca = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (marca !== 'ttcf') return bytes;
  const n = d.getUint32(8);
  if (indice < 0 || indice >= n) throw new Error('índice de fonte inválido');
  const inicio = d.getUint32(12 + indice * 4);
  const numTabelas = d.getUint16(inicio + 4);
  const tabelas = [];
  for (let i = 0; i < numTabelas; i++) {
    const o = inicio + 12 + i * 16;
    tabelas.push({ tag: bytes.subarray(o, o + 4), soma: d.getUint32(o + 4), pos: d.getUint32(o + 8), tam: d.getUint32(o + 12) });
  }
  let total = 12 + numTabelas * 16;
  for (const t of tabelas) total += (t.tam + 3) & ~3;
  const saida = new Uint8Array(total);
  const s = new DataView(saida.buffer);
  saida.set(bytes.subarray(inicio, inicio + 4), 0);
  s.setUint16(4, numTabelas);
  // searchRange, entrySelector, rangeShift
  s.setUint16(6, d.getUint16(inicio + 6));
  s.setUint16(8, d.getUint16(inicio + 8));
  s.setUint16(10, d.getUint16(inicio + 10));
  let pos = 12 + numTabelas * 16;
  tabelas.forEach((t, i) => {
    const o = 12 + i * 16;
    saida.set(t.tag, o);
    s.setUint32(o + 4, t.soma);
    s.setUint32(o + 8, pos);
    s.setUint32(o + 12, t.tam);
    saida.set(bytes.subarray(t.pos, t.pos + t.tam), pos);
    pos += (t.tam + 3) & ~3;
  });
  return saida;
}

// --- pastas

/** Pastas onde cada sistema guarda fontes */
export function pastasDeFontes(plataforma = process.platform, env = process.env, casa = os.homedir()) {
  if (plataforma === 'darwin') {
    return ['/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts', path.join(casa, 'Library', 'Fonts')];
  }
  if (plataforma === 'win32') {
    const windir = env.WINDIR || env.SystemRoot || 'C:\\Windows';
    return [path.join(windir, 'Fonts'), path.join(env.LOCALAPPDATA || path.join(casa, 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts')];
  }
  return ['/usr/share/fonts', '/usr/local/share/fonts', path.join(casa, '.fonts'), path.join(casa, '.local', 'share', 'fonts')];
}

function ficheirosDeFontes(pasta, profundidade = 0, saida = []) {
  if (profundidade > 5 || saida.length > 20000) return saida;
  let itens;
  try {
    itens = readdirSync(pasta, { withFileTypes: true });
  } catch {
    return saida;
  }
  for (const it of itens) {
    const p = path.join(pasta, it.name);
    let eDir = it.isDirectory();
    let eFicheiro = it.isFile();
    if (it.isSymbolicLink()) {
      try {
        const st = statSync(p);
        eDir = st.isDirectory();
        eFicheiro = st.isFile();
      } catch {
        continue;
      }
    }
    // Linux: /usr/share/fonts pode ter ligações que voltam atrás; a profundidade limita
    if (eDir) ficheirosDeFontes(p, profundidade + 1, saida);
    else if (eFicheiro && EXTENSOES.has(path.extname(it.name).toLowerCase())) saida.push(p);
  }
  return saida;
}

/** Lista as faces de todas as fontes instaladas */
export function indexarFontes(pastas = pastasDeFontes()) {
  const faces = [];
  const vistos = new Set();
  for (const pasta of pastas) {
    for (const f of ficheirosDeFontes(pasta)) {
      if (vistos.has(f)) continue;
      vistos.add(f);
      faces.push(...lerFacesDoFicheiro(f));
    }
  }
  return faces;
}

// --- escolher a fonte para um nome do PDF

const RE_NEGRITO = /bold|black|heavy|demi|semibold|negrito/;
const RE_ITALICO = /italic|oblique|ital|obl|cursiva/;
/** Palavras de estilo que fazem da face uma variante "especial" (preferimos a normal) */
const RE_ESPECIAL = /light|thin|ultra|extra|condensed|narrow|cond|compressed|expanded|wide|medium|semi|demi|book|display|rounded|outline|shadow|caption|smallcap|sc\b/;

/** "Helvetica-BoldOblique", "CenturyGothic,Bold", "Arial-BoldMT", "TimesNewRomanPS-ItalicMT" → família + estilo */
export function analisarNome(baseFont) {
  const sem = baseFont.replace(/^[A-Z]{6}\+/, '');
  const [bruta, ...resto] = sem.split(/[-,]/);
  let estilo = resto.join('').toLowerCase();
  let familia = bruta;
  // "ArialMT", "TimesNewRomanPSMT": o sufixo não é parte do nome da família
  familia = familia.replace(/(PS)?MT$|PS$/, '');
  // "ArialBold" (estilo colado à família)
  if (!estilo) {
    const m = /^(.*?)(bold|italic|oblique|boldItalic|boldOblique)$/i.exec(familia);
    if (m && m[1].length >= 3) {
      familia = m[1];
      estilo = m[2].toLowerCase();
    }
  }
  estilo = estilo.replace(/(ps)?mt$/, '');
  return {
    familia: norm(familia),
    negrito: RE_NEGRITO.test(estilo),
    italico: RE_ITALICO.test(estilo),
    completo: norm(sem),
  };
}

/** Fontes com métricas iguais ou quase às de uma que não existe no computador */
const EQUIVALENTES = {
  helvetica: ['arial', 'liberationsans', 'arimo', 'nimbussans', 'nimbussansl', 'freesans'],
  arial: ['helvetica', 'liberationsans', 'arimo', 'nimbussans', 'nimbussansl', 'freesans'],
  times: ['timesnewroman', 'liberationserif', 'tinos', 'nimbusroman', 'nimbusromanno9l', 'freeserif'],
  timesnewroman: ['times', 'liberationserif', 'tinos', 'nimbusroman', 'nimbusromanno9l', 'freeserif'],
  courier: ['couriernew', 'liberationmono', 'cousine', 'nimbusmono', 'nimbusmonops', 'freemono'],
  couriernew: ['courier', 'liberationmono', 'cousine', 'nimbusmono', 'nimbusmonops', 'freemono'],
};

/** Fontes parecidas (mesmo género, outro desenho): só quando não há original nem equivalente de métricas */
const PARECIDAS = {
  // Century Gothic segue as proporções da Avant Garde; Futura e Avenir são do mesmo género geométrico
  centurygothic: ['urwgothic', 'itcavantgardegothic', 'avantgarde', 'futura', 'avenirnext', 'avenir', 'montserrat', 'poppins', 'questrial'],
  verdana: ['tahoma', 'dejavusans', 'lucidagrande', 'trebuchetms'],
  tahoma: ['verdana', 'dejavusans', 'lucidagrande'],
  calibri: ['carlito', 'helveticaneue', 'lucidagrande'],
  cambria: ['caladea', 'georgia', 'timesnewroman'],
  georgia: ['timesnewroman', 'times'],
};

/** Último recurso, pelo género: sem serifas, com serifas, monoespaçada */
const GENERICAS = {
  sans: ['helvetica', 'arial', 'liberationsans', 'dejavusans', 'freesans'],
  serifa: ['timesnewroman', 'times', 'liberationserif', 'dejavuserif', 'freeserif'],
  mono: ['courier', 'couriernew', 'liberationmono', 'dejavusansmono', 'freemono'],
};

function estiloDaFace(face) {
  const e = face.estilo.toLowerCase();
  return { negrito: RE_NEGRITO.test(e), italico: RE_ITALICO.test(e), especial: RE_ESPECIAL.test(e) };
}

function melhorDaFamilia(faces, familia, negrito, italico) {
  const candidatas = faces.filter((f) => norm(f.familia) === familia || norm(f.familiaCompat) === familia);
  let melhor = null;
  let melhorNota = Infinity;
  for (const f of candidatas) {
    const e = estiloDaFace(f);
    if (e.negrito !== negrito || e.italico !== italico) continue;
    // a mais simples ganha: "Bold" antes de "Bold Condensed"
    const nota = (e.especial ? 100 : 0) + f.estilo.length;
    if (nota < melhorNota) {
      melhor = f;
      melhorNota = nota;
    }
  }
  return melhor;
}

/**
 * A face instalada que corresponde a um nome de fonte do PDF.
 * `pistas` vem do descritor do PDF (negrito/itálico) para nomes que não dizem o estilo.
 * Devolve { face, aproximada }: `aproximada` quando se usou uma fonte equivalente (Arial por Helvetica).
 */
export function escolherFace(faces, baseFont, pistas = {}) {
  const a = analisarNome(baseFont);
  const negrito = a.negrito || !!pistas.negrito;
  const italico = a.italico || !!pistas.italico;

  // 1. o nome PostScript exato é o mais fiável
  const ps = norm(baseFont.replace(/^[A-Z]{6}\+/, ''));
  // (a não ser que o descritor peça um estilo que o nome não tem: "Verdana" com FontWeight 700)
  const pedeMais = (pistas.negrito && !a.negrito) || (pistas.italico && !a.italico);
  const exata = pedeMais ? undefined : faces.find((f) => f.postscript && norm(f.postscript) === ps);
  if (exata) return { face: exata, aproximada: false, grau: 'exata' };

  // 2. família + estilo
  const mesma = melhorDaFamilia(faces, a.familia, negrito, italico);
  if (mesma) return { face: mesma, aproximada: false, grau: 'exata' };

  // 3. nome completo ("Century Gothic Bold")
  const completa = faces.find((f) => f.completo && norm(f.completo) === a.completo);
  if (completa) return { face: completa, aproximada: false, grau: 'exata' };

  // 4. equivalentes de métricas (o desenho é praticamente o mesmo)
  for (const alt of EQUIVALENTES[a.familia] ?? []) {
    const f = melhorDaFamilia(faces, alt, negrito, italico);
    if (f) return { face: f, aproximada: true, grau: 'metricas' };
  }
  // 5. parecidas (outro desenho do mesmo género)
  for (const alt of PARECIDAS[a.familia] ?? []) {
    const f = melhorDaFamilia(faces, alt, negrito, italico);
    if (f) return { face: f, aproximada: true, grau: 'parecida' };
  }
  // 6. genérica pelo género da fonte (diz o descritor, ou o nome)
  const genero = pistas.mono || /courier|mono|consolas|typewriter/.test(a.completo) ? 'mono' : pistas.serifa || /times|georgia|garamond|palatino|minion|bookman|cambria|serif(?!a)/.test(a.completo) ? 'serifa' : 'sans';
  for (const alt of GENERICAS[genero]) {
    const f = melhorDaFamilia(faces, alt, negrito, italico);
    if (f) return { face: f, aproximada: true, grau: 'generica' };
  }
  return null;
}

/** Os bytes de uma face como fonte autónoma (sfnt) */
export function carregarFace(face) {
  if (statSync(face.caminho).size > 120 * 1024 * 1024) throw new Error('ficheiro de fonte demasiado grande');
  const b = new Uint8Array(readFileSync(face.caminho));
  return extrairFace(b, face.indice);
}

/**
 * Responde ao pedido da página: para cada fonte pedida, a instalada que lhe corresponde (ou null).
 * Valida tudo o que vem da página: é ela que manda os nomes.
 */
export function procurarFontes(faces, pedidos, carregar = carregarFace) {
  if (!Array.isArray(pedidos)) return [];
  const cache = new Map();
  return pedidos.slice(0, 300).map((p) => {
    if (!p || typeof p.nomeBase !== 'string' || p.nomeBase.length === 0 || p.nomeBase.length > 200) return null;
    const r = escolherFace(faces, p.nomeBase, { negrito: p.negrito === true, italico: p.italico === true, serifa: p.serifa === true, mono: p.mono === true });
    if (!r) return null;
    try {
      const chave = `${r.face.caminho}#${r.face.indice}`;
      if (!cache.has(chave)) cache.set(chave, carregar(r.face));
      return { nome: r.face.completo || r.face.postscript || r.face.familia, aproximada: r.aproximada, grau: r.grau, bytes: cache.get(chave) };
    } catch {
      return null;
    }
  });
}
