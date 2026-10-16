import path from 'node:path';

/**
 * Transforma o caminho de um pedido (arte://app/assets/x.js) num ficheiro dentro de `raiz`.
 * Devolve null se o pedido tentar sair da pasta (../, caminhos absolutos, barras invertidas…).
 */
export function resolverCaminho(raiz, caminhoUrl) {
  let relativo;
  try {
    relativo = decodeURIComponent(caminhoUrl);
  } catch {
    return null;
  }
  if (relativo.includes('\0') || relativo.includes('\\')) return null;
  if (relativo === '' || relativo.endsWith('/')) relativo += 'index.html';
  const base = path.resolve(raiz);
  const alvo = path.resolve(base, `.${relativo.startsWith('/') ? '' : '/'}${relativo}`);
  return alvo === base || alvo.startsWith(base + path.sep) ? alvo : null;
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.icc': 'application/octet-stream',
};

export function tipoDe(ficheiro) {
  return TIPOS[path.extname(ficheiro).toLowerCase()] ?? 'application/octet-stream';
}

/** Começa por %PDF- (a especificação deixa até 1024 bytes de lixo antes, o que aqui não se aceita) */
export function pareceUmPdf(bytes) {
  return bytes instanceof Uint8Array && bytes.length > 8 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
}

/** Caminhos iguais? (no Windows e no macOS as maiúsculas não contam) */
export function mesmoCaminho(a, b, plataforma = process.platform) {
  const n = (p) => {
    const r = path.resolve(p);
    return plataforma === 'win32' || plataforma === 'darwin' ? r.toLowerCase() : r;
  };
  return n(a) === n(b);
}

/** Ficheiros .pdf que vêm na linha de comandos (o primeiro argumento é o executável) */
export function pdfsDosArgumentos(argv, empacotado) {
  return argv
    .slice(empacotado ? 1 : 2)
    .filter((a) => !a.startsWith('-') && a.toLowerCase().endsWith('.pdf'));
}
