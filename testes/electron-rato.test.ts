import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos: é o código da casca, partilhado com o teste
import { comandoDoRato, interpretarLinha } from '../electron/rato.mjs';

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

  it('há programa para macOS e Windows, e não há para os outros sistemas', () => {
    const mac = comandoDoRato('darwin');
    expect(mac.cmd).toBe('/usr/bin/osascript');
    expect(mac.args.slice(0, 2)).toEqual(['-l', 'JavaScript']);
    const win = comandoDoRato('win32');
    expect(win.cmd).toBe('powershell.exe');
    expect(win.args).toContain('-NoProfile');
    expect(comandoDoRato('linux')).toBeNull();
  });

  it('os programas escrevem exatamente o que a casca espera ler', () => {
    const mac = comandoDoRato('darwin').args[3] as string;
    expect(mac).toContain("console.log('PRONTO')");
    expect(mac).toContain("'B' + e");
    expect(mac).toContain('pressedMouseButtons');
    const win = comandoDoRato('win32').args.at(-1) as string;
    expect(win).toContain("WriteLine('PRONTO')");
    expect(win).toContain("'B' + $e");
    expect(win).toContain('GetAsyncKeyState(1)');
    // não pedem nada que precise de permissões (nem tocam em teclas)
    expect(mac).not.toMatch(/addGlobalMonitor|CGEventTap|Accessibility/i);
  });
});
