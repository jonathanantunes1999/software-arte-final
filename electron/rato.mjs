import { spawn } from 'node:child_process';

/**
 * Estado do botão esquerdo do rato, em qualquer aplicação. O Electron não o sabe: precisamos dele
 * para perceber que se está a arrastar algo (a janelinha só deve sair ao encontro de um arrasto).
 * Usa um pequeno programa do próprio sistema, que fica a correr e escreve uma linha quando o botão
 * muda; nada é instalado e não pede permissões (é o estado do botão, não os toques nas teclas).
 *
 * macOS: JavaScript para Automação (osascript) com NSEvent.pressedMouseButtons.
 * Windows: PowerShell com GetAsyncKeyState.
 * Outros sistemas: não há; o modo notch fica indisponível.
 */

const JXA_MACOS = `
ObjC.import('AppKit');
const app = Application.currentApplication();
app.includeStandardAdditions = true;
console.log('PRONTO');
let ultimo = -1;
for (;;) {
  const e = (Number($.NSEvent.pressedMouseButtons) & 1) ? 1 : 0;
  if (e !== ultimo) { ultimo = e; console.log('B' + e); }
  app.delay(0.03);
}
`;

const PS_WINDOWS = `
Add-Type 'using System.Runtime.InteropServices; public class ArteRato { [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int k); }'
[Console]::Out.WriteLine('PRONTO'); [Console]::Out.Flush()
$u = -1
while ($true) {
  $e = if (([ArteRato]::GetAsyncKeyState(1) -band 0x8000) -ne 0) { 1 } else { 0 }
  if ($e -ne $u) { $u = $e; [Console]::Out.WriteLine('B' + $e); [Console]::Out.Flush() }
  Start-Sleep -Milliseconds 30
}
`;

/** Interpreta o que o programa escreve: 'PRONTO', 'B0', 'B1' (ignora o resto, como avisos do sistema) */
export function interpretarLinha(linha) {
  const l = String(linha).trim();
  if (l === 'PRONTO') return { tipo: 'pronto' };
  if (l === 'B1') return { tipo: 'botao', carregado: true };
  if (l === 'B0') return { tipo: 'botao', carregado: false };
  return null;
}

/** Comando e argumentos do programa para este sistema, ou null se não há */
export function comandoDoRato(plataforma) {
  if (plataforma === 'darwin') return { cmd: '/usr/bin/osascript', args: ['-l', 'JavaScript', '-e', JXA_MACOS] };
  if (plataforma === 'win32') return { cmd: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_WINDOWS] };
  return null;
}

/**
 * Arranca o monitor. Devolve { botao(), parar() } ou null se o sistema não suporta.
 * `aoProblema(texto)` é chamado se o programa não arranca, morre ou não responde.
 */
export function iniciarMonitorDoRato({ plataforma = process.platform, aoProblema = () => {}, aoLinha = () => {} } = {}) {
  const c = comandoDoRato(plataforma);
  if (!c) return null;
  let carregado = false;
  let pronto = false;
  let parado = false;
  let proc;
  try {
    proc = spawn(c.cmd, c.args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (e) {
    aoProblema(`não consegui arrancar o programa do sistema (${e.message})`);
    return null;
  }
  const ler = (fluxo) => {
    let resto = '';
    fluxo.on('data', (d) => {
      resto += d.toString();
      let i;
      while ((i = resto.indexOf('\n')) >= 0) {
        const linha = resto.slice(0, i);
        resto = resto.slice(i + 1);
        aoLinha(linha);
        const ev = interpretarLinha(linha);
        if (ev?.tipo === 'pronto') pronto = true;
        else if (ev?.tipo === 'botao') carregado = ev.carregado;
      }
    });
  };
  // o osascript escreve o console.log do JavaScript para Automação no stderr
  ler(proc.stdout);
  ler(proc.stderr);
  proc.on('error', (e) => aoProblema(`o programa do sistema falhou (${e.message})`));
  proc.on('exit', (code) => {
    if (!parado) aoProblema(`o programa do sistema terminou (código ${code})`);
  });
  const temporizador = setTimeout(() => {
    if (!pronto && !parado) aoProblema('o programa do sistema não respondeu em 4 segundos');
  }, 4000);
  return {
    botao: () => carregado,
    /** O programa do sistema já disse que está a postos */
    pronto: () => pronto,
    parar: () => {
      parado = true;
      clearTimeout(temporizador);
      try {
        proc.kill();
      } catch {
        /* já tinha saído */
      }
    },
  };
}
