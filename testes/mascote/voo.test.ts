import { describe, expect, it } from 'vitest';
import { calcularVoo } from '../../src/mascote/voo';

const num = (t: string, nome: string) => Number(new RegExp(`${nome}\\(([-\\d.]+)`).exec(t)![1]);

describe('mascote: trajeto de voo', () => {
  it('a ida: o sentido é o da direção (para a direita se o palco está à esquerda do destino), e acaba exatamente no destino', () => {
    const v = calcularVoo(-300, -80, 1.7, true);
    expect(v.sentido).toBe(1);
    const ultimo = v.frames.at(-1)!;
    expect(ultimo.offset).toBe(1);
    expect(ultimo.transform).toBe('translate(0px, 0px) rotate(0deg) scale(1, 1)');
    expect(ultimo.opacity).toBe(1);
    // começa em cima do palco, grande
    expect(num(v.frames[0].transform, 'translate')).toBeCloseTo(-300, 0);
    expect(num(v.frames[0].transform, 'scale')).toBeGreaterThan(1.5);
  });

  it('a volta vai para o outro lado: o sentido inverte-se e chega ao palco', () => {
    const ida = calcularVoo(-300, -80, 1.7, true);
    const volta = calcularVoo(-300, -80, 1.7, false);
    expect(ida.sentido).toBe(1);
    expect(volta.sentido).toBe(-1);
    expect(volta.frames[0].transform).toContain('translate(0px, 0px)');
    const fim = volta.frames.at(-2)!;
    expect(num(fim.transform, 'translate')).toBeCloseTo(-300, -1);
    expect(volta.frames.at(-1)!.opacity).toBe(0);
  });

  it('se o palco estiver à direita do destino, a ida é para a esquerda', () => {
    expect(calcularVoo(250, 10, 1.5, true).sentido).toBe(-1);
    expect(calcularVoo(250, 10, 1.5, false).sentido).toBe(1);
  });

  it('os offsets sobem sempre (nunca voltam atrás) e ficam entre 0 e 1', () => {
    for (const ida of [true, false]) {
      const o = calcularVoo(-280, -60, 1.6, ida).frames.map((x) => x.offset);
      expect(o[0]).toBe(0);
      expect(o.at(-1)).toBe(1);
      for (let i = 1; i < o.length; i++) expect(o[i]).toBeGreaterThanOrEqual(o[i - 1]);
    }
  });

  it('inclina-se para onde vai mas sem exagero (até 24°), e o esticão é pequeno', () => {
    const v = calcularVoo(-400, 120, 1.7, true);
    for (const fr of v.frames) {
      const ang = Math.abs(num(fr.transform, 'rotate'));
      expect(ang).toBeLessThanOrEqual(24.01);
    }
    const escalas = v.frames.slice(0, -10).map((fr) => /scale\(([-\d.]+), ([-\d.]+)\)/.exec(fr.transform)!).map((m) => Number(m[1]) / Number(m[2]));
    for (const r of escalas) {
      expect(r).toBeGreaterThanOrEqual(0.99);
      expect(r).toBeLessThan(1.25);
    }
  });

  it('o arco sobe antes de descer: a meio do caminho está acima da reta entre os dois pontos', () => {
    const v = calcularVoo(-300, 0, 1.6, true);
    const meio = v.frames[Math.floor(v.frames.length / 3)];
    expect(num(meio.transform, 'translate') > -300).toBe(true);
    const y = Number(/translate\([-\d.]+px, ([-\d.]+)px\)/.exec(meio.transform)![1]);
    expect(y).toBeLessThan(-15);
  });

  it('a aterragem assenta: os saltinhos finais diminuem', () => {
    const v = calcularVoo(-300, -80, 1.7, true);
    const fim = v.frames.slice(-10).map((fr) => Math.abs(Number(/translate\(([-\d.]+)px/.exec(fr.transform)![1])));
    expect(fim.at(-1)).toBe(0);
    expect(Math.max(...fim.slice(5))).toBeLessThan(Math.max(...fim.slice(0, 5)) + 1e-6);
  });

  it('distâncias tontas (zero, enormes) não dão NaN', () => {
    for (const [dx, dy] of [[0, 0], [-5000, 3000], [1, -1]] as const) {
      for (const ida of [true, false]) for (const fr of calcularVoo(dx, dy, 2, ida).frames) expect(fr.transform).not.toMatch(/NaN|Infinity/);
    }
  });
});
