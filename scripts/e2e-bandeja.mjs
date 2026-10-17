// Verificação do ícone da bandeja com o Electron real. Precisa de playwright-core (npm i --no-save playwright-core)
// e, em Linux sem ecrã, de xvfb-run:
//   xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/e2e-bandeja.mjs <um.pdf>
// Um ecrã virtual não tem barra de menus nem relógio: o clique no ícone faz-se por dentro (ARTE_FINAL_TESTE=1).
import { _electron as electron } from 'playwright-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pdf = process.argv[2];
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
  env: { ...process.env, ARTE_FINAL_TESTE: '1', ARTE_FINAL_NOTCH: '0' },
});
const b = (cod) => app.evaluate((_, c) => eval(c), cod);
const janelas = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => ({ vis: w.isVisible(), destruida: w.isDestroyed(), foco: w.isFocused() })));
const traz = () => app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); });
await esperar(2500);
const erros = [];
for (const w of app.windows()) {
  w.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 200)));
  w.on('pageerror', (e) => erros.push('PAGEERROR ' + e.message.slice(0, 200)));
}

console.log('1. O ícone existe');
confere(await b('globalThis.__arteBandeja.existe()'), 'a bandeja foi criada (o ícone carregou)');
const menu0 = await b('globalThis.__arteBandeja.menu()');
confere(menu0.slice(1).join('|') === 'Abrir PDF…|-|Fechar a janela deixa a app na bandeja|-|Sair do Arte Final' && /Arte Final$/.test(menu0[0]), 'o menu tem os itens esperados');

console.log('2. Clicar no ícone alterna a janela');
await traz();
await esperar(400);
confere((await janelas())[0].vis, 'a janela está à vista');
confere(await b('globalThis.__arteBandeja.emUso()'), 'e à frente');
await b('globalThis.__arteBandeja.clicar()');
await esperar(500);
confere(!(await janelas())[0].vis, 'um clique com a janela à frente esconde-a');
confere((await b('globalThis.__arteBandeja.menu()'))[0] === 'Abrir o Arte Final', 'e o menu passa a dizer "Abrir o Arte Final"');
await b('globalThis.__arteBandeja.clicar()');
await esperar(700);
confere((await janelas())[0].vis, 'outro clique traz a janela de volta');

console.log('3. Fechar a janela deixa a app a correr');
confere(await b('globalThis.__arteBandeja.manter()'), 'por omissão fechar a janela mantém a app na bandeja');
const antes = (await janelas()).length;
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
await esperar(600);
const depois = await janelas();
confere(depois.length === antes && !depois[0].destruida, 'a janela não foi destruída');
confere(!depois[0].vis, 'só ficou escondida');
await b('globalThis.__arteBandeja.clicar()');
await esperar(700);
confere((await janelas())[0].vis, 'e o ícone traz tudo de volta, outra vez');

if (pdf) {
  console.log('4. Largar um PDF no ícone (macOS) abre-o');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  await esperar(300);
  await b(`globalThis.__arteBandeja.soltar(['/tmp/nao-e-pdf.txt', ${JSON.stringify(pdf)}])`);
  await esperar(2500);
  const w = app.windows()[0];
  confere((await janelas())[0].vis, 'a janela apareceu');
  await w.locator('header .nome').waitFor({ timeout: 40000 });
  confere((await w.locator('header .nome').innerText()).toLowerCase().endsWith('.pdf'), 'com o PDF aberto');
}

console.log('5. Sair a sério');
await app.evaluate(({ app: a }) => a.quit()).catch(() => {});
await esperar(500);

console.log('Erros nas páginas');
confere(erros.length === 0, `sem erros (${erros.slice(0, 3).join(' | ')})`);
await app.close().catch(() => {});
console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\nTudo certo.');
process.exit(falhas.length ? 1 : 0);
