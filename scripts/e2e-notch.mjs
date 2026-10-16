// Verificação do modo notch com o Electron real. Precisa de playwright-core (npm i --no-save playwright-core)
// e, em Linux sem ecrã, de xvfb-run:
//   xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/e2e-notch.mjs <pasta-de-saída> <um.pdf>
// O cursor e o botão do rato são simulados por dentro (ARTE_FINAL_TESTE=1): não há rato num ecrã virtual.
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
  env: { ...process.env, ARTE_FINAL_NOTCH: '1', ARTE_FINAL_TESTE: '1', ...(process.env.SIMULAR_NOTCH ? { ARTE_FINAL_SIMULAR_NOTCH: '1' } : {}) },
});
const janelas = () =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => ({ pilula: w.webContents.getURL().includes('notch=1'), vis: w.isVisible(), b: w.getBounds(), op: w.getOpacity(), topo: w.isAlwaysOnTop() })),
  );
const pilulaB = async () => (await janelas()).find((j) => j.pilula);
const principalB = async () => (await janelas()).find((j) => !j.pilula);
/** Põe o cursor e o botão onde o teste quer */
const rato = (x, y, botao) => app.evaluate((_, r) => { globalThis.__arteRato = r; }, { x, y, botao });
const ecra = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().bounds);
const centroX = ecra.x + ecra.width / 2;
const LONGE = [300, 600];
const PERTO = [centroX + 80, 110];

await esperar(2500);
const pilula = app.windows().find((w) => w.url().includes('notch=1'));
const principal = () => app.windows().find((w) => !w.url().includes('notch=1'));
const erros = [];
for (const w of app.windows()) {
  w.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 200)));
  w.on('pageerror', (e) => erros.push('PAGEERROR ' + e.message.slice(0, 200)));
}
const arrastar = (tipo, nome = 'a.pdf', mime = 'application/pdf') =>
  pilula.evaluate(([t, n, m]) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], n, { type: m }));
    window.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [tipo, nome, mime]);
/** Aproxima um ficheiro da notch: carrega longe, arrasta para a zona */
async function aproximar() {
  await rato(...LONGE, false);
  await esperar(120);
  await rato(...LONGE, true);
  await esperar(150);
  await rato(...PERTO, true);
  await esperar(500);
}

console.log('1. Arranque: a janelinha só mostra a dica nos primeiros arranques');
let p = await pilulaB();
confere(p.topo, 'a janelinha está sempre por cima');
confere(p.vis && p.b.height > 40 && p.b.height < 100, `mostra a dica (${p.b.width}×${p.b.height})`);
confere((await pilula.locator('.texto-dica').innerText()).includes('Arrasta um PDF'), 'a dica diz o que fazer');
confere((await principalB()).vis === false, 'a janela principal está escondida');
await esperar(5600);
confere((await pilulaB()).vis === false, 'depois da dica NÃO FICA NADA À VISTA (a janelinha está escondida)');

console.log('2. Fora dos arrastos não há nada');
await rato(centroX, 5, false);
await esperar(600);
confere((await pilulaB()).vis === false, 'o cursor no topo, sem arrastar, não faz nada');
await rato(...LONGE, true);
await esperar(150);
await rato(...PERTO, true);
await esperar(80);
confere((await pilulaB()).vis === false, 'passar a correr pela zona não a abre (precisa de uns instantes)');
await rato(...LONGE, false);
await esperar(900);
await rato(...PERTO, true);
await esperar(1500);
confere((await pilulaB()).vis === false, 'carregar DENTRO da zona (clicar, arrastar uma janela) não a abre');
await rato(...LONGE, false);
await esperar(900);
// um ficheiro que já estava no topo (junto à notch): arrastá-lo abre a janelinha
await rato(...PERTO, false);
await esperar(150);
await rato(...PERTO, true);
await esperar(150);
await rato(PERTO[0] - 120, PERTO[1] + 50, true);
await esperar(500);
confere((await pilulaB()).vis, 'um ficheiro que JÁ ESTAVA no topo (como no ambiente de trabalho): arrastá-lo abre a janelinha');
await rato(...LONGE, false);
await esperar(1500);

console.log('3. Aproximar um ficheiro da notch: a janelinha sai ao encontro');
await aproximar();
p = await pilulaB();
confere(p.vis && p.b.height > 150, `aparece (${p.b.width}×${p.b.height} em y=${p.b.y})`);
confere((await pilula.locator('.largar strong').innerText()) === 'Coloca aqui o PDF', 'diz "Coloca aqui o PDF"');
await pilula.screenshot({ path: `${S}/n-aberta.png` });
await arrastar('dragenter');
await esperar(200);
confere((await pilula.locator('.largar strong').innerText()) === 'Larga para abrir', 'com o ficheiro por cima diz "Larga para abrir"');
await pilula.screenshot({ path: `${S}/n-sobre.png` });
await arrastar('dragleave');

console.log('4. Desistir');
await rato(...PERTO, false);
await esperar(1300);
confere((await pilulaB()).vis === false, 'ao largar o rato sem ficheiro, desaparece');
await rato(...LONGE, false);
await aproximar();
confere((await pilulaB()).vis, 'volta a aparecer ao aproximar outra vez');
await rato(centroX, 700, true);
await esperar(1200);
confere((await pilulaB()).vis === false, 'afastar o ficheiro (para longe da zona) esconde-a');
await rato(...LONGE, false);
await esperar(1500);

console.log('5. Largar um PDF');
await aproximar();
await arrastar('dragenter');
const bytes = [...readFileSync(pdf)];
await pilula.evaluate(async (b) => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array(b)], 'cartaz.pdf', { type: 'application/pdf' }));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, bytes);
await rato(...PERTO, false); // largou-se o ficheiro: o botão está solto
const amostras = [];
for (let k = 0; k < 7; k++) {
  await esperar(60);
  amostras.push(await principalB());
}
console.log('   crescimento:', amostras.map((j) => `${j.vis ? 'V' : 'h'} ${j.b.width}×${j.b.height} op${j.op.toFixed(2)}`).join(' | '));
confere(amostras.some((j) => j.vis && j.b.width < 900), 'a janela principal nasce pequena, a partir do topo');
await esperar(1600);
const final = await principalB();
confere(final.vis && final.b.width > 1000 && final.op === 1, `termina grande e opaca (${final.b.width}×${final.b.height})`);
await principal().locator('header .valor').waitFor({ timeout: 40000 });
confere((await principal().locator('header .nome').innerText()) === 'cartaz.pdf', 'o PDF abriu na janela principal');
confere((await pilulaB()).vis === false, 'a janelinha desapareceu');
await rato(...LONGE, false);

console.log('6. Recolher e voltar');
await principal().getByRole('button', { name: 'Recolher para a notch' }).click();
await esperar(800);
confere((await principalB()).vis === false, 'a janela recolheu e escondeu-se');
confere((await pilulaB()).vis === false, 'e continua sem haver nada à vista');
await app.evaluate(({ app: a }) => a.emit('activate'));
await esperar(900);
const volta = await principalB();
confere(volta.vis && volta.b.width > 1000, 'clicar no ícone da app (Dock) traz a janela de volta');
confere((await principal().locator('header .nome').innerText()) === 'cartaz.pdf', 'com o mesmo ficheiro');

console.log('7. Ficheiro que não é PDF');
await rato(...LONGE, false);
await esperar(1500);
await aproximar();
await arrastar('dragenter');
await pilula.evaluate(() => {
  const dt = new DataTransfer();
  dt.items.add(new File(['isto não é um pdf'], 'foto.png', { type: 'image/png' }));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await esperar(300);
confere((await pilula.locator('.largar strong').innerText()) === 'Só PDFs', 'avisa "Só PDFs"');
await esperar(1500);

console.log('8. Erros nas páginas');
confere(erros.length === 0, `sem erros ${erros.length ? JSON.stringify(erros) : ''}`);
await app.close();
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTudo certo.');
process.exit(falhas.length ? 1 : 0);
