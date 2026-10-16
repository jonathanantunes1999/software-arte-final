import { _electron as electron } from 'playwright-core';
import { readFileSync } from 'node:fs';
// Verificação do modo notch com o Electron real. Precisa de playwright-core (npm i --no-save playwright-core)
// e, em Linux sem ecrã, de xvfb-run:  xvfb-run -a node scripts/e2e-notch.mjs <pasta-de-saída> <um.pdf>
import { fileURLToPath } from 'node:url';
const S = process.argv[2];
const R = fileURLToPath(new URL('..', import.meta.url));
const pdf = process.argv[3];
const app = await electron.launch({ executablePath: `${R}/node_modules/electron/dist/electron`, args: ['--no-sandbox', R], cwd: R, env: { ...process.env, ARTE_FINAL_NOTCH: '1' } });
const info = () => app.evaluate(({ BrowserWindow, screen }) => ({
  ecra: screen.getPrimaryDisplay().bounds,
  janelas: BrowserWindow.getAllWindows().map((w) => ({ url: w.webContents.getURL().replace(/^.*\/\//, ''), vis: w.isVisible(), b: w.getBounds(), op: w.getOpacity(), topo: w.isAlwaysOnTop() })),
}));
await new Promise((r) => setTimeout(r, 2500));
let i = await info();
console.log('ecrã:', i.ecra, '\njanelas no arranque:', JSON.stringify(i.janelas));
const win = () => app.windows();
const pilula = win().find((w) => w.url().includes('notch=1'));
const erros = []; for (const w of win()) { w.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 200))); w.on('pageerror', (e) => erros.push('PAGEERROR ' + e.message.slice(0, 200))); }
console.log('pílula tem ponte:', await pilula.evaluate(() => !!window.arteFinal?.notch));
console.log('texto de arranque:', await pilula.locator('.texto').innerText());
// 1) arrastar um ficheiro por cima: a pílula pede tamanho 'aberto'
await pilula.evaluate(() => {
  const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
  window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await new Promise((r) => setTimeout(r, 700));
i = await info();
console.log('a arrastar → pílula:', JSON.stringify(i.janelas.find((j) => j.url.includes('notch=1')).b), '| texto:', (await pilula.locator('.largar').innerText()).replace(/\n+/g, ' / '));
await pilula.screenshot({ path: `${S}/n-1.png` });
// 2) largar um PDF a sério (bytes): a janela principal cresce a partir da pílula
const bytes = [...readFileSync(pdf)];
await pilula.evaluate(async (b) => {
  const f = new File([new Uint8Array(b)], 'rgb.pdf', { type: 'application/pdf' });
  const dt = new DataTransfer(); dt.items.add(f);
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, bytes);
const amostras = [];
for (let k = 0; k < 8; k++) { await new Promise((r) => setTimeout(r, 60)); const j = (await info()).janelas.find((x) => !x.url.includes('notch=1')); amostras.push(`${j.vis ? 'V' : 'h'} ${j.b.width}x${j.b.height}@${j.b.y} op${j.op.toFixed(2)}`); }
console.log('crescimento:', amostras.join(' | '));
await new Promise((r) => setTimeout(r, 1500));
i = await info();
const principal = i.janelas.find((j) => !j.url.includes('notch=1'));
console.log('janela principal final:', JSON.stringify(principal));
const app1 = win().find((w) => !w.url().includes('notch=1'));
await app1.locator('header .valor').waitFor({ timeout: 40000 });
console.log('PDF aberto na janela principal:', await app1.locator('header .nome').innerText());
await app1.waitForFunction(() => !document.querySelector('.progresso'), null, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
console.log('pílula mostra:', (await pilula.locator('.meio').innerText()).trim(), '| tamanho:', JSON.stringify((await info()).janelas.find((j) => j.url.includes('notch=1')).b));
await pilula.screenshot({ path: `${S}/n-2.png` });
// 3) recolher
await app1.getByRole('button', { name: 'Recolher para a notch' }).click();
await new Promise((r) => setTimeout(r, 700));
const depois = (await info()).janelas.find((j) => !j.url.includes('notch=1'));
console.log('depois de recolher: visível =', depois.vis, '| bounds repostos:', JSON.stringify(depois.b));
// 4) clicar na pílula traz de volta, com o mesmo ficheiro
await pilula.locator('.pilula').click();
await new Promise((r) => setTimeout(r, 900));
const volta = (await info()).janelas.find((j) => !j.url.includes('notch=1'));
console.log('clicar na pílula: visível =', volta.vis, JSON.stringify(volta.b), '| ficheiro ainda:', await app1.locator('header .nome').innerText());
// 5) PDF inválido
await pilula.evaluate(() => {
  const dt = new DataTransfer(); dt.items.add(new File(['isto não é um pdf'], 'foto.png', { type: 'image/png' }));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await new Promise((r) => setTimeout(r, 400));
console.log('ficheiro que não é PDF:', (await pilula.locator('.largar').innerText()).replace(/\n+/g, ' / '));
console.log('erros:', erros.length ? erros : 'nenhum');
await app.close();
