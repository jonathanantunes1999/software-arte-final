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

/**
 * macOS, variante A: NSEvent.pressedMouseButtons. Escrita à defesa: em algumas versões do macOS a API aparece
 * como método em vez de propriedade, e o `delay` do StandardAdditions nem sempre existe (por isso dorme-se
 * com o NSThread). Qualquer erro sai como "ERRO …" e o programa termina, para a variante B tomar o lugar.
 */
const JXA_NSEVENT = `
ObjC.import('AppKit');
function botaoEsquerdo() {
  let v = $.NSEvent.pressedMouseButtons;
  if (typeof v === 'function') v = v.call($.NSEvent);
  return (Number(v) & 1) ? 1 : 0;
}
try {
  let ultimo = botaoEsquerdo();
  console.log('PRONTO');
  console.log('B' + ultimo);
  for (;;) {
    const e = botaoEsquerdo();
    if (e !== ultimo) { ultimo = e; console.log('B' + e); }
    $.NSThread.sleepForTimeInterval(0.03);
  }
} catch (erro) {
  console.log('ERRO NSEvent: ' + erro);
  throw erro;
}
`;

/** macOS, variante B: CGEventSourceButtonState (CoreGraphics), a mesma informação por outro caminho */
const JXA_COREGRAPHICS = `
ObjC.import('CoreGraphics');
ObjC.import('Foundation');
function botaoEsquerdo() {
  return $.CGEventSourceButtonState(0, 0) ? 1 : 0;
}
try {
  let ultimo = botaoEsquerdo();
  console.log('PRONTO');
  console.log('B' + ultimo);
  for (;;) {
    const e = botaoEsquerdo();
    if (e !== ultimo) { ultimo = e; console.log('B' + e); }
    $.NSThread.sleepForTimeInterval(0.03);
  }
} catch (erro) {
  console.log('ERRO CoreGraphics: ' + erro);
  throw erro;
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

/** Programas que se tentam por ordem neste sistema (o primeiro que arranca fica) */
export function comandosDoRato(plataforma) {
  if (plataforma === 'darwin') {
    return [
      { nome: 'NSEvent', cmd: '/usr/bin/osascript', args: ['-l', 'JavaScript', '-e', JXA_NSEVENT] },
      { nome: 'CoreGraphics', cmd: '/usr/bin/osascript', args: ['-l', 'JavaScript', '-e', JXA_COREGRAPHICS] },
    ];
  }
  if (plataforma === 'win32') return [{ nome: 'PowerShell', cmd: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_WINDOWS] }];
  return [];
}

/**
 * Arranca o monitor, a tentar as variantes por ordem. Devolve { botao(), pronto(), variante(), erros(), parar() }
 * ou null se o sistema não suporta. `aoProblema(texto)` só é chamado quando TODAS as variantes falharam
 * (o texto inclui o que o sistema escreveu), ou se o programa morre mais tarde.
 */
export function iniciarMonitorDoRato({ plataforma = process.platform, comandos, esperaMs = 4000, aoProblema = () => {}, aoLinha = () => {} } = {}) {
  const lista = comandos ?? comandosDoRato(plataforma);
  if (!lista.length) return null;
  let indice = 0;
  let carregado = false;
  let pronto = false;
  let parado = false;
  let proc = null;
  let temporizador = null;
  /** O que o sistema escreveu que não é do nosso protocolo (mensagens de erro, avisos) */
  const erros = [];

  const falhou = (porque) => {
    if (parado) return;
    if (!pronto && indice + 1 < lista.length) {
      try {
        proc?.kill();
      } catch {
        /* já tinha saído */
      }
      indice++;
      arrancar();
      return;
    }
    parado = true;
    clearTimeout(temporizador);
    aoProblema(`${porque}${erros.length ? ` — o sistema disse: ${erros.slice(-3).join(' | ')}` : ''} (tentei: ${lista.slice(0, indice + 1).map((c) => c.nome).join(', ')})`);
  };

  function arrancar() {
    const c = lista[indice];
    clearTimeout(temporizador);
    let meu;
    try {
      meu = spawn(c.cmd, c.args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      erros.push(String(e.message));
      falhou('não consegui arrancar o programa do sistema');
      return;
    }
    proc = meu;
    const ler = (fluxo) => {
      let resto = '';
      fluxo.on('data', (d) => {
        resto += d.toString();
        let i;
        while ((i = resto.indexOf('\n')) >= 0) {
          const linha = resto.slice(0, i);
          resto = resto.slice(i + 1);
          if (meu !== proc) continue; // de uma variante já abandonada
          aoLinha(linha);
          const ev = interpretarLinha(linha);
          if (ev?.tipo === 'pronto') pronto = true;
          else if (ev?.tipo === 'botao') carregado = ev.carregado;
          else if (linha.trim()) erros.push(linha.trim().slice(0, 300));
        }
      });
    };
    // o osascript escreve o console.log do JavaScript para Automação no stderr
    ler(meu.stdout);
    ler(meu.stderr);
    meu.on('error', (e) => {
      if (meu === proc) {
        erros.push(String(e.message));
        falhou('o programa do sistema falhou');
      }
    });
    meu.on('exit', (code) => {
      if (meu === proc && !parado) falhou(`o programa do sistema terminou (código ${code})`);
    });
    temporizador = setTimeout(() => {
      if (meu === proc && !pronto && !parado) falhou(`o programa do sistema não respondeu em ${esperaMs / 1000} segundos`);
    }, esperaMs);
  }

  arrancar();
  return {
    botao: () => carregado,
    /** O programa do sistema já disse que está a postos */
    pronto: () => pronto,
    /** Qual das variantes está a correr */
    variante: () => lista[Math.min(indice, lista.length - 1)].nome,
    erros: () => erros.slice(-6),
    parar: () => {
      parado = true;
      clearTimeout(temporizador);
      try {
        proc?.kill();
      } catch {
        /* já tinha saído */
      }
    },
  };
}
