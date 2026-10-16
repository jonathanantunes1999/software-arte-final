import { describe, expect, it } from 'vitest';
import { ACESSORIOS, CORES, espiral, estrela, PERFIL_OMISSAO, luminancia, misturar, normalizarCor, sanearPerfil, superelipse, tons } from '../../src/mascote/personalizacao';

describe('mascote: cores', () => {
  it('normaliza #abc, sem # e maiúsculas; recusa o que não é cor', () => {
    expect(normalizarCor('#ABC')).toBe('#aabbcc');
    expect(normalizarCor('ffd2ad')).toBe('#ffd2ad');
    expect(normalizarCor(' #FFD2AD ')).toBe('#ffd2ad');
    for (const mau of ['', '#12', '#12345', '#gggggg', 'red', 42, null, undefined, {}]) expect(normalizarCor(mau)).toBeNull();
  });

  it('misturar: extremos e meio', () => {
    expect(misturar('#000000', '#ffffff', 0)).toBe('#000000');
    expect(misturar('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(misturar('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('os tons dão volume: luz mais clara que a base, e a base mais clara que a sombra, para todas as cores da paleta', () => {
    for (const { cor } of CORES) {
      const t = tons(cor);
      expect(luminancia(t.luz)).toBeGreaterThan(luminancia(t.base));
      expect(luminancia(t.base)).toBeGreaterThan(luminancia(t.sombra));
      expect(t.base).toBe(cor);
    }
  });

  it('corpo escuro leva olhos claros e corpo claro leva olhos escuros', () => {
    expect(tons('#4a4f62').tinta).toBe('#f6f3ff');
    expect(tons('#f1eee8').tinta).toBe('#2a2230');
    expect(luminancia(tons('#4a4f62').luz)).toBeGreaterThan(luminancia('#4a4f62'));
  });

  it('uma cor muito escura ou muito clara escolhida à mão também dá tons válidos', () => {
    for (const c of ['#000000', '#ffffff', '#123456']) {
      const t = tons(c);
      for (const v of Object.values(t)) expect(normalizarCor(v)).toBe(v);
    }
  });
});

describe('mascote: perfil guardado', () => {
  it('sem nada (ou lixo) dá o perfil por omissão', () => {
    expect(sanearPerfil(undefined)).toEqual(PERFIL_OMISSAO);
    expect(sanearPerfil('x')).toEqual(PERFIL_OMISSAO);
    expect(sanearPerfil(null)).toEqual(PERFIL_OMISSAO);
    expect(sanearPerfil([])).toEqual(PERFIL_OMISSAO);
  });

  it('aproveita o que é válido e troca só o que está estragado', () => {
    const p = sanearPerfil({ visivel: false, cor: '#ABCDEF', acessorio: 'chapeu-de-bruxa', bolas: 'sim' });
    expect(p).toEqual({ ...PERFIL_OMISSAO, visivel: false, cor: '#abcdef' });
    expect(sanearPerfil({ bolas: false }).bolas).toBe(false);
    expect(sanearPerfil({ inicio: false, alertas: false, animada: false })).toMatchObject({ inicio: false, alertas: false, animada: false });
    expect(sanearPerfil({ inicio: 'não', animada: 0 })).toMatchObject({ inicio: true, animada: true });
  });

  it('aceita todas as opções oferecidas', () => {
    for (const a of ACESSORIOS) expect(sanearPerfil({ acessorio: a.valor }).acessorio).toBe(a.valor);
    // um perfil guardado numa versão antiga (com orelhas) continua a abrir
    expect(sanearPerfil({ orelhas: 'coelho', cor: '#ffd2ad' })).toMatchObject({ cor: '#ffd2ad', visivel: true });
  });

  it('uma cor com código injetado não passa', () => {
    expect(sanearPerfil({ cor: '#fff;" onload="x' }).cor).toBe(PERFIL_OMISSAO.cor);
    expect(sanearPerfil({ cor: 'url(#x)' }).cor).toBe(PERFIL_OMISSAO.cor);
  });
});

describe('mascote: superelipse', () => {
  const pontos = (d: string) => [...d.matchAll(/[ML]([-\d.]+) ([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

  it('fecha, tem os pontos pedidos e cabe na caixa rx × ry', () => {
    const d = superelipse(100, 50, 80, 60, 2.7, 96);
    expect(d.endsWith('Z')).toBe(true);
    const p = pontos(d);
    expect(p).toHaveLength(96);
    for (const [x, y] of p) {
      expect(x).toBeGreaterThanOrEqual(100 - 80 - 0.01);
      expect(x).toBeLessThanOrEqual(100 + 80 + 0.01);
      expect(y).toBeGreaterThanOrEqual(50 - 60 - 0.01);
      expect(y).toBeLessThanOrEqual(50 + 60 + 0.01);
    }
    // toca nos quatro lados
    expect(Math.max(...p.map((q) => q[0]))).toBeCloseTo(180, 1);
    expect(Math.min(...p.map((q) => q[1]))).toBeCloseTo(-10, 1);
  });

  it('n = 2 é uma elipse e n maior enche mais os cantos', () => {
    const diag = (n: number) => {
      const p = pontos(superelipse(0, 0, 100, 100, n, 8)); // o ponto 1 está a 45°
      return Math.hypot(p[1][0], p[1][1]);
    };
    expect(diag(2)).toBeCloseTo(100, 1);
    expect(diag(2.7)).toBeGreaterThan(diag(2));
    expect(diag(4.5)).toBeGreaterThan(diag(2.7));
    expect(diag(4.5)).toBeLessThanOrEqual(141.5);
  });

  it('é simétrica', () => {
    const p = pontos(superelipse(0, 0, 90, 70, 2.7, 96));
    const soma = p.reduce((a, q) => [a[0] + q[0], a[1] + q[1]], [0, 0]);
    expect(soma[0]).toBeCloseTo(0, 0);
    expect(soma[1]).toBeCloseTo(0, 0);
  });
});

describe('mascote: formas dos olhos', () => {
  const pts = (d: string) => [...d.matchAll(/[ML]([-\d.]+) ([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

  it('a espiral começa no centro, cresce até ao raio máximo e nunca passa dele', () => {
    const p = pts(espiral(10, 2.5, 64));
    expect(p).toHaveLength(65);
    expect(p[0]).toEqual([0, 0]);
    const raios = p.map(([x, y]) => Math.hypot(x, y));
    expect(raios[raios.length - 1]).toBeCloseTo(10, 1);
    expect(Math.max(...raios)).toBeLessThanOrEqual(10.01);
    for (let i = 1; i < raios.length; i++) expect(raios[i]).toBeGreaterThanOrEqual(raios[i - 1] - 1e-9);
  });

  it('a estrela tem 2n pontos alternando entre o raio exterior e o interior, e a primeira ponta aponta para cima', () => {
    const p = pts(estrela(10, 4, 5));
    expect(p).toHaveLength(10);
    expect(p[0][0]).toBeCloseTo(0, 5);
    expect(p[0][1]).toBeCloseTo(-10, 5);
    p.forEach(([x, y], i) => expect(Math.hypot(x, y)).toBeCloseTo(i % 2 === 0 ? 10 : 4, 1));
  });

  it('todos os acessórios têm nome e id únicos', () => {
    expect(new Set(ACESSORIOS.map((a) => a.valor)).size).toBe(ACESSORIOS.length);
    expect(ACESSORIOS.length).toBeGreaterThanOrEqual(10);
  });
});
