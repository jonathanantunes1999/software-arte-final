import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos: é o código da casca, partilhado com o teste
import { mesmoCaminho, pareceUmPdf, pdfsDosArgumentos, resolverCaminho, tipoDe } from '../electron/caminhos.mjs';

const RAIZ = path.resolve('/app/dist');
const dentro = (...p: string[]) => path.join(RAIZ, ...p);

describe('casca desktop: servir o dist', () => {
  it('resolve ficheiros normais e a raiz', () => {
    expect(resolverCaminho(RAIZ, '/assets/app.js')).toBe(dentro('assets', 'app.js'));
    expect(resolverCaminho(RAIZ, '/')).toBe(dentro('index.html'));
    expect(resolverCaminho(RAIZ, '')).toBe(dentro('index.html'));
    expect(resolverCaminho(RAIZ, '/pdfjs/cmaps/')).toBe(dentro('pdfjs', 'cmaps', 'index.html'));
    expect(resolverCaminho(RAIZ, '/nome%20com%20espa%C3%A7o.png')).toBe(dentro('nome com espaço.png'));
  });

  it.each(['/../package.json', '/%2e%2e/package.json', '/assets/../../segredo', '/a/%2E%2E/%2E%2E/b', '/\\..\\x', '/x\0y', '/%00', '/%E0%A4%A'])('recusa %j', (p) => {
    expect(resolverCaminho(RAIZ, p)).toBeNull();
  });

  it('um irmão com o mesmo prefixo não conta como dentro (dist-secreto)', () => {
    expect(resolverCaminho(RAIZ, '/../dist-secreto/x')).toBeNull();
  });

  it('tipos de ficheiro: wasm tem de ser application/wasm', () => {
    expect(tipoDe('a.wasm')).toBe('application/wasm');
    expect(tipoDe('a.js')).toContain('javascript');
    expect(tipoDe('A.HTML')).toContain('text/html');
    expect(tipoDe('x.desconhecido')).toBe('application/octet-stream');
  });
});

describe('casca desktop: ficheiros', () => {
  it('só aceita bytes que começam por %PDF-', () => {
    expect(pareceUmPdf(new TextEncoder().encode('%PDF-1.7\n1 0 obj'))).toBe(true);
    expect(pareceUmPdf(new TextEncoder().encode('MZ executável xxxxxxxx'))).toBe(false);
    expect(pareceUmPdf(new TextEncoder().encode('%PDF-'))).toBe(false);
    expect(pareceUmPdf('%PDF-1.7 texto')).toBe(false);
    expect(pareceUmPdf(null)).toBe(false);
  });

  it('o original nunca é o destino: compara caminhos, com maiúsculas só onde não contam', () => {
    expect(mesmoCaminho('/a/b/x.pdf', '/a/b/../b/x.pdf', 'linux')).toBe(true);
    expect(mesmoCaminho('/a/b/x.pdf', '/a/b/X.pdf', 'linux')).toBe(false);
    expect(mesmoCaminho('/a/b/x.pdf', '/a/b/X.PDF', 'darwin')).toBe(true);
    expect(mesmoCaminho('/a/b/x.pdf', '/a/c/x.pdf', 'win32')).toBe(false);
  });

  it('PDFs da linha de comandos: ignora opções e o que não é .pdf', () => {
    // sem empacotar: [electron, pasta-da-app, ...args]
    expect(pdfsDosArgumentos(['electron', '.', '/x/a.pdf', '--flag', '/x/b.txt', 'C:\\y\\C.PDF'], false)).toEqual(['/x/a.pdf', 'C:\\y\\C.PDF']);
    // empacotado: [exe, ...args]
    expect(pdfsDosArgumentos(['ArteFinal.exe', '/x/a.pdf'], true)).toEqual(['/x/a.pdf']);
    expect(pdfsDosArgumentos(['ArteFinal.exe'], true)).toEqual([]);
  });
});
