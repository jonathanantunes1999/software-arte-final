import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos: é o código da casca, partilhado com o teste
import { comandosDoRato, interpretarLinha, iniciarMonitorDoRato } from '../electron/rato.mjs';

describe('estado do botão do rato (programa do sistema)', () => {
  it('interpreta as linhas que o programa escreve e ignora o resto', () => {
    expect(interpretarLinha('PRONTO')).toEqual({ tipo: 'pronto' });
    expect(interpretarLinha('B1\n')).toEqual({ tipo: 'botao', carregado: true });
    expect(interpretarLinha('  B0  ')).toEqual({ tipo: 'botao', carregado: false });
    expect(interpretarLinha('')).toBeNull();
    expect(interpretarLinha('2026-10-16 aviso qualquer do sistema')).toBeNull();
    expect(interpretarLinha('B2')).toBeNull();
    expect(interpretarLinha(undefined)).toBeNull();
  });

  it('no macOS há duas variantes (NSEvent e CoreGraphics), no Windows uma, e nos outros sistemas nenhuma', () => {
    const mac = comandosDoRato('darwin');
    expect(mac.map((c: { nome: string }) => c.nome)).toEqual(['NSEvent', 'CoreGraphics']);
    for (const c of mac) {
      expect(c.cmd).toBe('/usr/bin/osascript');
      expect(c.args.slice(0, 2)).toEqual(['-l', 'JavaScript']);
    }
    const win = comandosDoRato('win32');
    expect(win).toHaveLength(1);
    expect(win[0].cmd).toBe('powershell.exe');
    expect(win[0].args).toContain('-NoProfile');
    expect(comandosDoRato('linux')).toEqual([]);
  });

  it('os programas escrevem exatamente o que a casca espera ler', () => {
    const [a, b] = comandosDoRato('darwin').map((c: { args: string[] }) => c.args[3]);
    for (const s of [a, b]) {
      expect(s).toContain("console.log('PRONTO')");
      expect(s).toContain("console.log('B' + ");
      // erros saem como texto (para o aviso os mostrar) e o programa termina para a variante seguinte
      expect(s).toContain("console.log('ERRO ");
      expect(s).toContain('throw erro');
      // dormem com o NSThread: não dependem do StandardAdditions
      expect(s).toContain('sleepForTimeInterval');
      expect(s).not.toContain('includeStandardAdditions');
      // nada que peça permissões
      expect(s).not.toMatch(/addGlobalMonitor|CGEventTap|Accessibility/i);
    }
    expect(a).toContain('pressedMouseButtons');
    expect(b).toContain('CGEventSourceButtonState');
    const win = comandosDoRato('win32')[0].args.at(-1) as string;
    expect(win).toContain("WriteLine('PRONTO')");
    expect(win).toContain("'B' + $e");
    expect(win).toContain('GetAsyncKeyState(1)');
  });
});

/** Um "programa do sistema" falso: corre um pedaço de JavaScript com o Node */
const falso = (nome: string, js: string) => ({ nome, cmd: process.execPath, args: ['-e', js] });
const esperarPor = async (cond: () => boolean, ms = 4000) => {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 20));
  return cond();
};

describe('monitor do rato: cadeia de variantes', () => {
  it('se a primeira variante falha, tenta a segunda e fica com ela', async () => {
    const problemas: string[] = [];
    const m = iniciarMonitorDoRato({
      comandos: [
        falso('A', "console.error('ERRO NSEvent: Error: não existe'); process.exit(1)"),
        falso('B', "console.error('PRONTO'); console.error('B0'); setTimeout(() => console.error('B1'), 100); setInterval(() => {}, 1000)"),
      ],
      aoProblema: (x: string) => problemas.push(x),
    });
    expect(await esperarPor(() => m.pronto())).toBe(true);
    expect(m.variante()).toBe('B');
    expect(await esperarPor(() => m.botao())).toBe(true);
    expect(problemas).toEqual([]);
    m.parar();
  });

  it('se todas falham, avisa UMA vez com o que o sistema disse e o que se tentou', async () => {
    const problemas: string[] = [];
    const m = iniciarMonitorDoRato({
      comandos: [
        falso('A', "console.error('ERRO NSEvent: Error: primeira'); process.exit(1)"),
        falso('B', "console.error('ERRO CoreGraphics: Error: segunda'); process.exit(1)"),
      ],
      aoProblema: (x: string) => problemas.push(x),
    });
    expect(await esperarPor(() => problemas.length > 0)).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('código 1');
    expect(problemas[0]).toContain('segunda');
    expect(problemas[0]).toContain('tentei: A, B');
    expect(m.pronto()).toBe(false);
    m.parar();
  });

  it('um programa que não responde a tempo conta como falha e passa à variante seguinte', async () => {
    const m = iniciarMonitorDoRato({
      esperaMs: 300,
      comandos: [falso('A', 'setInterval(() => {}, 1000)'), falso('B', "console.error('PRONTO'); setInterval(() => {}, 1000)")],
    });
    expect(await esperarPor(() => m.pronto())).toBe(true);
    expect(m.variante()).toBe('B');
    m.parar();
  });

  it('o botão passa de carregado a solto', async () => {
    const m = iniciarMonitorDoRato({
      comandos: [falso('A', "console.error('PRONTO'); console.error('B1'); setTimeout(() => console.error('B0'), 150); setInterval(() => {}, 1000)")],
    });
    expect(await esperarPor(() => m.botao())).toBe(true);
    expect(await esperarPor(() => !m.botao())).toBe(true);
    m.parar();
  });

  it('um sistema sem programa devolve null', () => {
    expect(iniciarMonitorDoRato({ plataforma: 'linux' })).toBeNull();
  });
});
