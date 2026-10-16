import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos: é o código da casca, partilhado com o teste
import { criarDetetor, dentro, expandir } from '../electron/aproximacao.mjs';
// @ts-expect-error idem
import { boundsNotch, zonaDeAproximacao } from '../electron/notch.mjs';

const ecra = { x: 0, y: 0, width: 1512, height: 982 };
const zona = zonaDeAproximacao(ecra);
const centro = { x: 756, y: 60 };
const longe = { x: 300, y: 500 };
const junto = { x: 756 + 100, y: 120 };

/** Simula medições a cada 20 ms */
function correr(d: ReturnType<typeof criarDetetor>, passos: { p: { x: number; y: number }; botao: boolean; ms: number }[], t0 = 1000) {
  const eventos: [number, string][] = [];
  let t = t0;
  for (const { p, botao, ms } of passos) {
    for (let k = 0; k < ms; k += 20) {
      const e = d.atualizar(p, botao, t);
      if (e) eventos.push([t - t0, e]);
      t += 20;
    }
  }
  return { eventos, fim: t };
}

describe('zona de aproximação', () => {
  it('é generosa e fica centrada no topo, à volta da notch', () => {
    expect(zona.width).toBeGreaterThanOrEqual(500);
    expect(zona.height).toBeGreaterThanOrEqual(150);
    expect(zona.y).toBe(0);
    expect(zona.x + zona.width / 2).toBe(756);
    // a janelinha COBRE a zona toda (com ou sem notch): onde quer que o cursor esteja quando ela abre, está por cima dela.
    // (Quando era mais baixa, o ficheiro era largado por baixo do bordo e a largada perdia-se.)
    for (const notch of [true, false]) {
      const aberta = boundsNotch(ecra, notch, 'aberto');
      expect(aberta.x).toBeLessThanOrEqual(zona.x);
      expect(aberta.x + aberta.width).toBeGreaterThanOrEqual(zona.x + zona.width);
      expect(aberta.y).toBeLessThanOrEqual(zona.y);
      expect(aberta.y + aberta.height).toBeGreaterThanOrEqual(zona.y + zona.height);
    }
  });

  it('acompanha o ecrã (segundo monitor)', () => {
    const z = zonaDeAproximacao({ x: 1920, y: -100, width: 2560, height: 1440 });
    expect(z.y).toBe(-100);
    expect(z.x + z.width / 2).toBe(1920 + 1280);
  });

  it('dentro e expandir', () => {
    expect(dentro({ x: 5, y: 5 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(true);
    expect(dentro({ x: 11, y: 5 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
    expect(expandir({ x: 10, y: 10, width: 20, height: 20 }, 5)).toEqual({ x: 5, y: 5, width: 30, height: 30 });
  });
});

describe('detetar um ficheiro a aproximar-se da notch', () => {
  it('carregar longe, arrastar para a zona e ficar um instante: mostra a janelinha', () => {
    const d = criarDetetor({ zona });
    const { eventos } = correr(d, [
      { p: longe, botao: false, ms: 100 },
      { p: longe, botao: true, ms: 200 },
      { p: junto, botao: true, ms: 400 },
    ]);
    expect(eventos.map((e) => e[1])).toEqual(['mostrar']);
    expect(d.estado()).toBe('visivel');
  });

  it('só atravessar a zona depressa (menos que a espera) não mostra nada', () => {
    const d = criarDetetor({ zona });
    const { eventos } = correr(d, [
      { p: longe, botao: true, ms: 100 },
      { p: junto, botao: true, ms: 60 },
      { p: longe, botao: true, ms: 200 },
    ]);
    expect(eventos).toEqual([]);
  });

  it('sem o botão carregado (rato solto) não faz nada, por muito que se aproxime', () => {
    const d = criarDetetor({ zona });
    expect(correr(d, [{ p: junto, botao: false, ms: 2000 }]).eventos).toEqual([]);
  });

  it('um clique dentro da zona, sem arrastar (num separador, no ecrã), não abre nada', () => {
    const d = criarDetetor({ zona });
    expect(correr(d, [{ p: junto, botao: true, ms: 2000 }]).eventos).toEqual([]);
    // nem um arrasto minúsculo (a mão a tremer)
    const d2 = criarDetetor({ zona });
    expect(correr(d2, [{ p: junto, botao: true, ms: 100 }, { p: { x: junto.x + 20, y: junto.y + 5 }, botao: true, ms: 2000 }]).eventos).toEqual([]);
  });

  it('um ficheiro que já estava lá em cima (ambiente de trabalho, junto à notch): arrastá-lo abre a janelinha', () => {
    const d = criarDetetor({ zona });
    const { eventos } = correr(d, [
      { p: junto, botao: true, ms: 100 },
      { p: { x: junto.x - 90, y: junto.y + 40 }, botao: true, ms: 400 },
    ]);
    expect(eventos.map((e) => e[1])).toEqual(['mostrar']);
  });

  it('e se carregou dentro e levou o ficheiro para longe e voltou, também abre', () => {
    const d = criarDetetor({ zona });
    const { eventos } = correr(d, [{ p: centro, botao: true, ms: 200 }, { p: longe, botao: true, ms: 200 }, { p: junto, botao: true, ms: 400 }]);
    expect(eventos.map((e) => e[1])).toEqual(['mostrar']);
  });

  it('largar o rato fecha-a, depois de dar tempo ao evento de largar chegar', () => {
    const d = criarDetetor({ zona });
    const { eventos } = correr(d, [
      { p: longe, botao: true, ms: 100 },
      { p: junto, botao: true, ms: 300 },
      { p: junto, botao: false, ms: 1000 },
    ]);
    expect(eventos.map((e) => e[1])).toEqual(['mostrar', 'esconder']);
    // não fecha logo ao largar: 700 ms de tolerância
    const tMostrar = eventos[0][0];
    const tEsconder = eventos[1][0];
    const tSoltou = 100 + 300;
    expect(tEsconder - tSoltou).toBeGreaterThanOrEqual(700);
    expect(tEsconder).toBeGreaterThan(tMostrar);
  });

  it('afastar-se com o ficheiro (para lá da margem) fecha-a, e não reabre logo a seguir', () => {
    const d = criarDetetor({ zona });
    const { eventos } = correr(d, [
      { p: longe, botao: true, ms: 100 },
      { p: junto, botao: true, ms: 300 },
      { p: longe, botao: true, ms: 600 },
      { p: junto, botao: true, ms: 500 }, // volta cedo demais: ainda em pausa
    ]);
    expect(eventos.map((e) => e[1])).toEqual(['mostrar', 'esconder']);
  });

  it('passado o tempo de pausa, voltar a aproximar mostra-a outra vez', () => {
    const d = criarDetetor({ zona });
    const { eventos } = correr(d, [
      { p: longe, botao: true, ms: 100 },
      { p: junto, botao: true, ms: 300 },
      { p: longe, botao: true, ms: 600 },
      { p: longe, botao: true, ms: 1200 },
      { p: junto, botao: true, ms: 400 },
    ]);
    expect(eventos.map((e) => e[1])).toEqual(['mostrar', 'esconder', 'mostrar']);
  });

  it('mexer um pouco para fora da zona mas dentro da margem não a fecha', () => {
    const d = criarDetetor({ zona, margem: 90 });
    const pertoDoBordo = { x: zona.x + zona.width + 40, y: 100 }; // fora da zona, dentro da margem
    const { eventos } = correr(d, [
      { p: longe, botao: true, ms: 100 },
      { p: junto, botao: true, ms: 300 },
      { p: pertoDoBordo, botao: true, ms: 1500 },
    ]);
    expect(eventos.map((e) => e[1])).toEqual(['mostrar']);
  });

  it('depois de largar um ficheiro, não reabre enquanto o botão não for solto (nem passada a pausa)', () => {
    const d = criarDetetor({ zona });
    const { eventos } = correr(d, [
      { p: longe, botao: true, ms: 100 },
      { p: junto, botao: true, ms: 300 },
    ]);
    expect(eventos.map((e) => e[1])).toEqual(['mostrar']);
    expect(d.terminar(10_000)).toBe('esconder');
    // o botão continua carregado e o cursor na zona, muito para além da pausa de 900 ms
    const depois = correr(d, [{ p: junto, botao: true, ms: 3000 }], 10_100);
    expect(depois.eventos).toEqual([]);
    // solto o botão, um novo arrasto volta a funcionar
    const outra = correr(d, [{ p: longe, botao: false, ms: 100 }, { p: longe, botao: true, ms: 100 }, { p: junto, botao: true, ms: 400 }], 14_000);
    expect(outra.eventos.map((e) => e[1])).toEqual(['mostrar']);
  });

  it('terminar() fecha já quando o ficheiro foi largado, e é inofensivo se não há nada aberto', () => {
    const d = criarDetetor({ zona });
    expect(d.terminar(0)).toBeNull();
    correr(d, [{ p: longe, botao: true, ms: 100 }, { p: junto, botao: true, ms: 300 }]);
    expect(d.terminar(5000)).toBe('esconder');
    expect(d.estado()).toBe('inativo');
    expect(d.terminar(5001)).toBeNull();
  });
});
