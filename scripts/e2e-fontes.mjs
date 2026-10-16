// Verificação do texto em curvas com fontes não incorporadas, no Electron real:
//   xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/e2e-fontes.mjs <pasta-de-saída>
// Usa as fontes que o sistema onde corre tiver instaladas.
import { _electron as electron } from 'playwright-core';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PDFName } from 'pdf-lib';

const S = process.argv[2] ?? tmpdir();
const R = fileURLToPath(new URL('..', import.meta.url));
const dados = mkdtempSync(join(tmpdir(), 'arte-final-'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const falhas = [];
const confere = (ok, texto) => {
  console.log(ok ? '  ✓' : '  ✗', texto);
  if (!ok) falhas.push(texto);
};

// --- uma fatura como a da clínica: fontes simples, nenhuma incorporada
const pdf = await PDFDocument.create();
const ctx = pdf.context;
const larguras = Array.from({ length: 224 }, () => 556);
const fonte = (base, subtype, extra = {}) => ctx.register(ctx.obj({ Type: 'Font', Subtype: subtype, BaseFont: base, FirstChar: 32, LastChar: 255, Widths: larguras, Encoding: 'WinAnsiEncoding', ...extra }));
const pagina = pdf.addPage([595, 842]);
pagina.node.set(PDFName.of('Resources'), ctx.obj({
  Font: {
    F1: fonte('Helvetica', 'Type1'),
    F2: fonte('Helvetica-Bold', 'Type1'),
    F3: fonte('Verdana', 'TrueType'),
    F4: fonte('CenturyGothic,Bold', 'TrueType'),
  },
}));
pagina.node.set(PDFName.of('Contents'), ctx.register(ctx.stream(
  'BT /F2 18 Tf 50 780 Td (Fatura n\\272 53754) Tj ET ' +
  'BT /F1 11 Tf 50 740 Td (Cl\\355nica S\\343o Jos\\351 - consulta de rotina) Tj ET ' +
  'BT /F3 10 Tf 50 710 Td (Total a pagar: 45,00 EUR) Tj ET ' +
  'BT /F4 12 Tf 50 680 Td (Obrigado pela prefer\\352ncia) Tj ET',
)));
const caminhoPdf = join(S, 'fatura-sem-fontes.pdf');
writeFileSync(caminhoPdf, await pdf.save());

const app = await electron.launch({
  executablePath: `${R}/node_modules/electron/dist/electron`,
  args: ['--no-sandbox', `--user-data-dir=${dados}`, R, caminhoPdf],
  cwd: R,
  env: { ...process.env, ARTE_FINAL_TESTE: '1' },
});
await esperar(2500);
const w = app.windows().find((x) => !x.url().includes('notch=1')) ?? app.windows()[0];
const erros = [];
w.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 200)));
w.on('pageerror', (e) => erros.push('PAGEERROR ' + e.message.slice(0, 200)));
await w.setViewportSize({ width: 1500, height: 950 }).catch(() => {});

console.log('1. Abrir a fatura e ir às correções');
await w.locator('button', { hasText: 'Correções' }).first().click({ timeout: 20000 });
await w.waitForSelector('#corr-curvas .fontes li', { timeout: 20000 });
await esperar(1500); // a procura no computador
const itens = await w.locator('#corr-curvas .fontes li').allInnerTexts();
console.log(itens.map((t) => '    ' + t.replace(/\n/g, ' | ')).join('\n'));
confere(itens.length === 4, `4 fontes listadas (${itens.length})`);
const principal = w.locator('#corr-curvas > label').first().locator('input');
const geral = await w.locator('#corr-curvas > label').first().innerText();
console.log('    ' + geral.replace(/\n/g, ' '));
await w.screenshot({ path: join(S, 'fontes-1-painel.png') });

const algumaInstalada = itens.some((t) => t.includes('instalada neste computador') || t.includes('equivalente'));
confere(algumaInstalada || itens.every((t) => t.includes('não está instalada')), 'cada fonte diz se foi encontrada ou não');
if (await principal.isEnabled()) {
  console.log('2. Converter');
  await principal.check();
  await esperar(200);
  await w.screenshot({ path: join(S, 'fontes-2-marcado.png') });
  await w.locator('.barra-aplicar button').first().click();
  await w.waitForSelector('.resultado', { timeout: 30000 });
  const res = await w.locator('.resultado').innerText();
  console.log(res.split('\n').map((l) => '    ' + l).join('\n'));
  confere(/convertidos? em curvas/.test(res), 'o resumo diz quantos textos passaram a curvas');
  confere(/fontes instaladas no computador/.test(res), 'o resumo diz que usou fontes instaladas');
  await w.screenshot({ path: join(S, 'fontes-3-resultado.png') });
  await w.locator('.resultado button', { hasText: 'Comparar' }).click();
  await esperar(2500);
  await w.screenshot({ path: join(S, 'fontes-4-comparar.png') });
} else {
  console.log('2. (nenhuma das fontes existe neste computador: a opção fica desligada, como esperado)');
}
confere(erros.length === 0, `sem erros na consola ${erros.join(' ; ')}`);
await app.close();
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK');
process.exit(falhas.length ? 1 : 0);
