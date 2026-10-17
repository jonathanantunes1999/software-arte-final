// Gera os ícones da app a partir do desenho da mascote (SVG escrito aqui). O Chromium desenha o SVG e grava o
// PNG com fundo transparente. Precisa de playwright-core (npm i --no-save playwright-core), como os scripts e2e:
//   node scripts/gerar-icones.mjs        (CHROMIUM=/caminho/do/chromium se não for o do Playwright)
// Os PNG gerados estão no repositório: só se volta a correr isto ao mudar o desenho.
//
// Saídas:
//   electron/icones/bandeja-Template.png (+@2x)  macOS, barra de menus: só preto e transparência, o sistema pinta-o
//   electron/icones/bandeja-win.png (+@2x)       Windows, área de notificação: a cores
//   build/icon.png                               ícone da app (1024), de onde o electron-builder faz o .icns e o .ico
import playwright from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A superelipse do corpo da mascote (a mesma de src/mascote/personalizacao.ts) */
function superelipse(cx, cy, rx, ry, n = 2.55, passos = 96) {
  const p = [];
  for (let i = 0; i < passos; i++) {
    const t = (i / passos) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    p.push(`${i === 0 ? 'M' : 'L'}${(cx + rx * Math.sign(c) * Math.abs(c) ** (2 / n)).toFixed(2)} ${(cy + ry * Math.sign(s) * Math.abs(s) ** (2 / n)).toFixed(2)}`);
  }
  return `${p.join(' ')} Z`;
}

const CORPO = superelipse(120, 140, 88, 70);

/** Barra de menus do macOS: corpo cheio e olhos recortados, tudo preto (template image) */
const bandejaMac = (px) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="26 40 188 188">
  <defs><mask id="m"><rect x="0" y="0" width="240" height="260" fill="#fff"/><ellipse cx="90" cy="138" rx="13.5" ry="18" fill="#000"/><ellipse cx="150" cy="138" rx="13.5" ry="18" fill="#000"/></mask></defs>
  <path d="${CORPO}" fill="#000" mask="url(#m)"/>
</svg>`;

/** Windows: corpo com o degradé da marca, olhos escuros e um ponto magenta (uma pista das tintas) */
const bandejaWin = (px) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="14 36 212 212">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ee0ff"/><stop offset="1" stop-color="#8b7bff"/></linearGradient>
  </defs>
  <path d="${CORPO}" fill="url(#g)"/>
  <ellipse cx="90" cy="138" rx="14" ry="19" fill="#1a1426"/><ellipse cx="150" cy="138" rx="14" ry="19" fill="#1a1426"/>
  <circle cx="52" cy="196" r="26" fill="#ec008c" stroke="#fff" stroke-width="7"/>
</svg>`;

/** Ícone da app: quadrado arredondado com a marca por baixo e a mascote (a cores) à frente */
const icone = (px) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ee0ff"/><stop offset="1" stop-color="#8b7bff"/></linearGradient>
    <radialGradient id="corpo" cx="0.34" cy="0.26" r="0.95"><stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#f6f1fb"/><stop offset="1" stop-color="#cfc6dc"/></radialGradient>
    <radialGradient id="b0" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#7fe3ff"/><stop offset="1" stop-color="#009fe3"/></radialGradient>
    <radialGradient id="b1" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#ff6fc0"/><stop offset="1" stop-color="#d4007f"/></radialGradient>
    <radialGradient id="b2" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff27a"/><stop offset="1" stop-color="#f5c400"/></radialGradient>
    <radialGradient id="b3" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#6b6b78"/><stop offset="1" stop-color="#15151c"/></radialGradient>
    <filter id="sombra" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#1a1040" flood-opacity="0.35"/></filter>
    <filter id="sombraIcone" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity="0.28"/></filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#fundo)" filter="url(#sombraIcone)"/>
  <g transform="translate(512 540) scale(3.05) translate(-120 -140)">
    <circle cx="208" cy="100" r="19" fill="url(#b0)"/>
    <circle cx="60" cy="64" r="11" fill="url(#b2)"/>
    <path d="${CORPO}" fill="url(#corpo)" filter="url(#sombra)"/>
    <ellipse cx="84" cy="100" rx="30" ry="13" transform="rotate(-20 84 100)" fill="#fff" opacity="0.7"/>
    <ellipse cx="92" cy="140" rx="10.5" ry="13" fill="#2a2234"/><ellipse cx="148" cy="140" rx="10.5" ry="13" fill="#2a2234"/>
    <circle cx="44" cy="182" r="21" fill="url(#b1)"/>
    <circle cx="206" cy="198" r="12" fill="url(#b3)"/>
  </g>
</svg>`;

const SAIDAS = [
  ['electron/icones/bandeja-Template.png', 18, bandejaMac],
  ['electron/icones/bandeja-Template@2x.png', 36, bandejaMac],
  ['electron/icones/bandeja-win.png', 16, bandejaWin],
  ['electron/icones/bandeja-win@2x.png', 32, bandejaWin],
  ['build/icon.png', 1024, icone],
];

const chromium = process.env.CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const navegador = await playwright.chromium.launch({ executablePath: chromium, args: ['--no-sandbox'] });
for (const [saida, px, desenho] of SAIDAS) {
  const pagina = await navegador.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
  await pagina.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>${desenho(px)}`);
  const destino = join(raiz, saida);
  mkdirSync(dirname(destino), { recursive: true });
  // omitBackground: o fundo fica transparente (é o que um ícone de barra de menus precisa)
  writeFileSync(destino, await pagina.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } }));
  console.log(`${saida}  ${px}×${px}`);
  await pagina.close();
}
await navegador.close();
