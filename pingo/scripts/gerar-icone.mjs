import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * O ícone da bandeja: a silhueta da mascote, preta com alfa, que é o que o macOS pede a
 * uma "template image" (ele próprio a pinta de claro ou escuro conforme a barra).
 * Escrito à mão para não trazer nenhuma dependência de imagem.
 *
 * node scripts/gerar-icone.mjs
 */

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pasta = path.join(raiz, 'assets');
// A pasta pode não existir: o git não guarda pastas vazias
mkdirSync(pasta, { recursive: true });

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function pedaco(tipo, dados) {
  const comprimento = Buffer.alloc(4);
  comprimento.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([comprimento, corpo, crc]);
}

/**
 * Cobertura do corpo no ponto (u, v), ambos em 0..1, por supersampling 4×4.
 * É a mesma superelipse da mascote (|x/rx|ⁿ + |y/ry|ⁿ = 1, n = 2,55), para o ícone
 * da bandeja ser a silhueta dela e não um desenho à parte.
 */
function cobertura(u, v, passo) {
  const N = 2.55;
  const RX = 0.44;
  const RY = 0.35;
  let dentro = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const x = (u + ((i + 0.5) / 4) * passo - 0.5) / RX;
      const y = (v + ((j + 0.5) / 4) * passo - 0.5) / RY;
      if (Math.abs(x) ** N + Math.abs(y) ** N <= 1) dentro++;
    }
  }
  return dentro / 16;
}

function png(lado) {
  const passo = 1 / lado;
  // Cada linha leva um byte de filtro (0) à frente
  const cru = Buffer.alloc(lado * (1 + lado * 4));
  let p = 0;
  for (let y = 0; y < lado; y++) {
    cru[p++] = 0;
    for (let x = 0; x < lado; x++) {
      const a = Math.round(cobertura(x * passo, y * passo, passo) * 255);
      cru[p++] = 0;
      cru[p++] = 0;
      cru[p++] = 0;
      cru[p++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', ihdr),
    pedaco('IDAT', deflateSync(cru, { level: 9 })),
    pedaco('IEND', Buffer.alloc(0)),
  ]);
}

for (const [nome, lado] of [
  ['bandeja.png', 18],
  ['bandeja@2x.png', 36],
]) {
  const destino = path.join(pasta, nome);
  writeFileSync(destino, png(lado));
  console.log(`${nome}: ${lado}×${lado}`);
}
