// Verificação dos separadores com o Electron real. Precisa de playwright-core (npm i --no-save playwright-core) e,
// em Linux sem ecrã, de xvfb-run:
//   xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/e2e-separadores.mjs <um.pdf> <outro.pdf>
// Os ficheiros chegam pelo caminho do "largar no ícone" (ARTE_FINAL_TESTE=1), que passa pelo mesmo sítio que o duplo clique.
import { _electron as electron } from 'playwright-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [pdf1, pdf2] = process.argv.slice(2);
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
await esperar(2500);
const w = app.windows()[0];
const erros = [];
w.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 200)));
w.on('pageerror', (e) => erros.push('PAGEERROR ' + e.message.slice(0, 200)));
const soltar = (f) => app.evaluate((_, c) => globalThis.__arteBandeja.soltar([c]), f);
const nomes = async () => (await w.locator('[role=tab]').allInnerTexts()).map((t) => t.trim());
const aFrente = () => w.locator('.app:not(.oculto) header .nome').first().innerText();

console.log('1. Ecrã inicial: sem barra');
confere((await w.locator('[role=tablist]').count()) === 0, 'a barra de separadores não aparece com o ecrã inicial sozinho');

console.log('2. Abrir dois PDFs');
await soltar(pdf1);
await w.locator('.app:not(.oculto) header .nome').first().waitFor({ timeout: 40000 });
await esperar(1500);
confere((await nomes()).length === 1, 'o primeiro abre no ecrã inicial (1 separador)');
await soltar(pdf2);
await esperar(3500);
const dois = await nomes();
confere(dois.length === 2, `o segundo abre noutro separador (${dois.join(' | ')})`);
confere((await aFrente()) === dois[1], 'e fica à frente');

console.log('3. O mesmo ficheiro não se abre duas vezes');
await soltar(pdf1);
await esperar(1200);
confere((await nomes()).length === 2, 'continua com 2 separadores');
confere((await aFrente()) === dois[0], 'mas o primeiro passou para a frente');

console.log('4. Mudar de separador guarda o estado');
await w.locator('.app:not(.oculto) .doca button', { hasText: '100%' }).click();
await esperar(600);
const zoom = await w.locator('.app:not(.oculto) .doca .zoom').innerText();
await w.locator('[role=tab]').nth(1).click();
await esperar(500);
await w.locator('[role=tab]').nth(0).click();
await esperar(900);
confere((await w.locator('.app:not(.oculto) .doca .zoom').innerText()) === zoom, `o zoom do primeiro (${zoom}) ficou como estava`);

console.log('5. Cmd/Ctrl+W (vem do menu) fecha o separador à frente');
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('arte:fechar-separador'));
await esperar(700);
const um = await nomes();
confere(um.length === 1 && um[0] === dois[1], `ficou o outro (${um.join(' | ')})`);
confere((await aFrente()) === dois[1], 'e passou para a frente');

console.log('6. Fechar o último deixa o ecrã inicial');
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('arte:fechar-separador'));
await esperar(900);
confere((await w.locator('[role=tablist]').count()) === 0, 'a barra desaparece');
confere((await w.locator('text=Experimentar com um exemplo').count()) > 0, 'e volta o ecrã inicial');

console.log('Erros nas páginas');
confere(erros.length === 0, `sem erros (${erros.slice(0, 3).join(' | ')})`);
await app.close().catch(() => {});
console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\nTudo certo.');
process.exit(falhas.length ? 1 : 0);
