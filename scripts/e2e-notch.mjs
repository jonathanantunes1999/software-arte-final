// Verificação do modo notch com o Electron real. Precisa de playwright-core (npm i --no-save playwright-core)
// e, em Linux sem ecrã, de xvfb-run:
//   xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/e2e-notch.mjs <pasta-de-saída> <um.pdf>
import { _electron as electron } from 'playwright-core';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = process.argv[2];
const pdf = process.argv[3];
const R = fileURLToPath(new URL('..', import.meta.url));
const dados = mkdtempSync(join(tmpdir(), 'arte-final-'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const falhas = [];
const confere = (ok, texto) => {
  console.log(ok ? '  ✓' : '  ✗', texto);
  if (!ok) falhas.push(texto);
};

const app = await electron.launch({
  executablePath: `${R}/node_modules/electron/dist/electron`,
  args: ['--no-sandbox', `--user-data-dir=${dados}`, R],
  cwd: R,
  env: { ...process.env, ARTE_FINAL_NOTCH: '1', ...(process.env.SIMULAR_NOTCH ? { ARTE_FINAL_SIMULAR_NOTCH: '1' } : {}) },
});
const janelas = () =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => ({ pilula: w.webContents.getURL().includes('notch=1'), vis: w.isVisible(), b: w.getBounds(), op: w.getOpacity(), topo: w.isAlwaysOnTop() })),
  );
const pilulaB = async () => (await janelas()).find((j) => j.pilula);
const principalB = async () => (await janelas()).find((j) => !j.pilula);

await esperar(2500);
const pilula = app.windows().find((w) => w.url().includes('notch=1'));
const principal = () => app.windows().find((w) => !w.url().includes('notch=1'));
const erros = [];
for (const w of app.windows()) {
  w.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 200)));
  w.on('pageerror', (e) => erros.push('PAGEERROR ' + e.message.slice(0, 200)));
}

console.log('1. Arranque (primeira vez: mostra a dica)');
let p = await pilulaB();
confere(p.topo && p.vis, 'a janela da pílula existe, está visível e por cima de tudo');
confere((await principalB()).vis === false, 'a janela principal está escondida');
confere(p.b.height > 40, `mostra a dica (${p.b.width}×${p.b.height})`);
confere((await pilula.locator('.texto-dica').innerText()).includes('Arrasta um PDF'), 'a dica diz o que fazer');
await esperar(5600);
p = await pilulaB();
confere(p.b.height <= 14 && p.b.y === 0, `a dica desaparece e fica a faixa invisível no topo (${p.b.width}×${p.b.height} em y=${p.b.y})`);
confere((await pilula.locator('.zona').count()) === 0, 'em repouso não há nada desenhado');
await pilula.evaluate(() => document.querySelector('.zona') === null);

console.log('2. Arrastar um ficheiro para o topo');
const arrastar = (tipo, nome = 'a.pdf', mime = 'application/pdf') =>
  pilula.evaluate(([t, n, m]) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], n, { type: m }));
    window.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [tipo, nome, mime]);
await arrastar('dragenter');
await esperar(600);
p = await pilulaB();
confere(p.b.height > 150, `abre a zona de largar (${p.b.width}×${p.b.height})`);
confere((await pilula.locator('.largar strong').innerText()) === 'Coloca aqui o PDF', 'diz "Coloca aqui o PDF"');
await pilula.screenshot({ path: `${S}/n-aberta.png` });
await arrastar('dragleave');
await esperar(500);
p = await pilulaB();
confere(p.b.height <= 14, 'ao afastar o ficheiro volta a esconder-se');
await arrastar('dragenter');
await esperar(300);
confere((await pilulaB()).b.height <= 14, 'e não reabre logo a seguir (o cursor ainda está por cima da faixa)');
await esperar(900);

console.log('3. Largar um PDF');
const bytes = [...readFileSync(pdf)];
await arrastar('dragenter');
await pilula.evaluate(async (b) => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array(b)], 'cartaz.pdf', { type: 'application/pdf' }));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, bytes);
const amostras = [];
for (let k = 0; k < 7; k++) {
  await esperar(60);
  const j = await principalB();
  amostras.push(j);
}
console.log('   crescimento:', amostras.map((j) => `${j.vis ? 'V' : 'h'} ${j.b.width}×${j.b.height} op${j.op.toFixed(2)}`).join(' | '));
confere(amostras.some((j) => j.vis && j.b.width < 900), 'a janela principal nasce pequena, a partir do topo');
await esperar(1600);
const final = await principalB();
confere(final.vis && final.b.width > 1000 && final.op === 1, `termina grande e opaca (${final.b.width}×${final.b.height})`);
await principal().locator('header .valor').waitFor({ timeout: 40000 });
confere((await principal().locator('header .nome').innerText()) === 'cartaz.pdf', 'o PDF abriu na janela principal');
await esperar(1200);
p = await pilulaB();
confere(p.b.height <= 14, 'a zona de largar desapareceu (outra vez invisível)');

console.log('4. Recolher e voltar');
await principal().getByRole('button', { name: 'Recolher para a notch' }).click();
await esperar(800);
confere((await principalB()).vis === false, 'a janela recolheu e escondeu-se');
await app.evaluate(({ app: a }) => a.emit('activate'));
await esperar(900);
const volta = await principalB();
confere(volta.vis && volta.b.width > 1000, 'clicar no ícone da app (Dock) traz a janela de volta');
confere((await principal().locator('header .nome').innerText()) === 'cartaz.pdf', 'com o mesmo ficheiro');

console.log('5. Ficheiro que não é PDF');
await arrastar('dragenter');
await pilula.evaluate(() => {
  const dt = new DataTransfer();
  dt.items.add(new File(['isto não é um pdf'], 'foto.png', { type: 'image/png' }));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await esperar(400);
confere((await pilula.locator('.largar strong').innerText()) === 'Só PDFs', 'avisa "Só PDFs"');
await esperar(2400);

console.log('6. Erros nas páginas');
confere(erros.length === 0, `sem erros nas páginas ${erros.length ? JSON.stringify(erros) : ''}`);
await app.close();
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTudo certo.');
process.exit(falhas.length ? 1 : 0);
