import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { embrulharCff, lerCmaps, lerPrograma, type Cmd, type Programa } from '../../src/texto/programa';

const ler = (f: string) => new Uint8Array(readFileSync(new URL(`../fixtures/fontes/${f}`, import.meta.url)));
const ok = (r: ReturnType<typeof lerPrograma>): Programa => {
  if (!('ok' in r)) throw new Error(r.erro);
  return r.ok;
};
const pontos = (c: Cmd[]) => c.filter((x) => x.t !== 'Z').map((x) => (x.t === 'C' ? [x.x, x.y] : [(x as { x: number }).x, (x as { y: number }).y]));

describe('programas de fonte', () => {
  const ttf = ok(lerPrograma(ler('teste.ttf'), 'sfnt'));
  const otf = ok(lerPrograma(ler('teste.otf'), 'sfnt'));
  const cff = ok(lerPrograma(ler('teste.cff'), 'cff'));

  it('TrueType: tipo, unidades por em, nº de glifos e nomes', () => {
    expect(ttf.tipo).toBe('truetype');
    expect(ttf.unidadesPorEm).toBe(1000);
    expect(ttf.numGlifos).toBe(6);
    expect(ttf.porNome('A')).toBe(2);
    expect(ttf.porNome('Z')).toBeUndefined();
  });

  it('contorno de um retângulo (TrueType, com a direção própria da fonte)', () => {
    const c = ttf.contorno(ttf.porNome('A')!);
    expect(pontos(c).slice(0, 4)).toEqual([[100, 700], [100, 0], [600, 0], [600, 700]]);
  });

  it('anel: dois contornos (exterior e buraco)', () => {
    const c = ttf.contorno(ttf.porNome('O')!);
    expect(c.filter((x) => x.t === 'M')).toHaveLength(2);
    expect(c.filter((x) => x.t === 'Z')).toHaveLength(2);
  });

  it('curvas quadráticas do TrueType passam a cúbicas (e acabam no mesmo ponto)', () => {
    const c = ttf.contorno(ttf.porNome('C')!);
    expect(c.some((x) => x.t === 'C')).toBe(true);
    expect(c.filter((x) => x.t === 'M')).toHaveLength(1);
    // todas as curvas ficam dentro da caixa do círculo (50..550)
    for (const [x, y] of pontos(c)) {
      expect(x).toBeGreaterThanOrEqual(49);
      expect(x).toBeLessThanOrEqual(551);
      expect(y).toBeGreaterThanOrEqual(49);
      expect(y).toBeLessThanOrEqual(551);
    }
  });

  it('OpenType com CFF: contornos cúbicos e o mesmo desenho', () => {
    expect(otf.tipo).toBe('cff');
    const c = otf.contorno(otf.porNome('C')!);
    expect(c.filter((x) => x.t === 'C')).toHaveLength(4);
    expect(pontos(otf.contorno(otf.porNome('B')!))[0]).toEqual([0, 0]);
  });

  it('CFF "nu" (o que o PDF guarda): embrulhado, lê-se como o OpenType', () => {
    expect(cff.tipo).toBe('cff');
    expect(cff.unidadesPorEm).toBe(1000);
    expect(cff.numGlifos).toBe(6);
    expect(cff.porNome('A')).toBe(2);
    expect(pontos(cff.contorno(2))).toEqual(pontos(otf.contorno(2)));
  });

  it('cmap do TrueType: unicode → glifo; o que não existe dá 0', () => {
    const sub = ttf.cmaps.find((s) => s.plataforma === 3 && s.codificacao === 1)!;
    expect(sub.procurar(0x41)).toBe(2);
    expect(sub.procurar(0x4f)).toBe(4);
    expect(sub.procurar(0x5a)).toBe(0);
    expect(sub.procurar(0x20)).toBe(1);
  });

  it('o OpenType/CFF "nu" não tem cmap; o contorno de um gid fora do intervalo é vazio', () => {
    expect(cff.cmaps).toEqual([]);
    expect(ttf.contorno(99)).toEqual([]);
    expect(ttf.contorno(-1)).toEqual([]);
  });

  it('lerCmaps num ficheiro sem cmap devolve vazio', () => {
    expect(lerCmaps(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toEqual([]);
  });

  it('dados que não são uma fonte: erro, sem rebentar', () => {
    expect('erro' in lerPrograma(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 'sfnt')).toBe(true);
    expect('erro' in lerPrograma(new Uint8Array([1, 2, 3]), 'cff')).toBe(true);
  });

  it('o embrulho tem as tabelas que o opentype.js pede', () => {
    const w = embrulharCff(ler('teste.cff'), 6, 1000);
    expect(String.fromCharCode(...w.subarray(0, 4))).toBe('OTTO');
    expect(w.length % 4).toBe(0);
  });
});
