// Copia os recursos estáticos do pdf.js (fontes standard, cmaps, perfis ICC, wasm)
// para public/pdfjs, para o preview renderizar bem fontes não incorporadas.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const origem = join(raiz, 'node_modules', 'pdfjs-dist');
const destino = join(raiz, 'public', 'pdfjs');

if (!existsSync(origem)) {
  console.warn('pdfjs-dist não instalado, a saltar cópia.');
  process.exit(0);
}
rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
for (const pasta of ['standard_fonts', 'cmaps', 'iccs', 'wasm']) {
  if (existsSync(join(origem, pasta))) cpSync(join(origem, pasta), join(destino, pasta), { recursive: true });
}
console.log('Recursos do pdf.js copiados para public/pdfjs');
