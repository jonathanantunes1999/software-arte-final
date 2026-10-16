import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos: é o código da casca, partilhado com o teste
import { MAX_DICAS, boundsFinal, boundsNotch, ehEstadoNotch, interpolar, opacidadeDaAnimacao, sanearPrefs, suave, temNotchNoMac, TAMANHOS } from '../electron/notch.mjs';

const ecra = { x: 0, y: 0, width: 1512, height: 982 };

describe('modo notch: geometria', () => {
  it('só há notch num Mac com a barra de menus mais alta (37 pt contra 24)', () => {
    expect(temNotchNoMac('darwin', ecra, { x: 0, y: 37, width: 1512, height: 945 })).toBe(true);
    expect(temNotchNoMac('darwin', ecra, { x: 0, y: 24, width: 1512, height: 958 })).toBe(false);
    expect(temNotchNoMac('win32', ecra, { x: 0, y: 40, width: 1512, height: 942 })).toBe(false);
    expect(temNotchNoMac('linux', ecra, { x: 0, y: 0, width: 1512, height: 982 })).toBe(false);
  });

  it('a pílula fica centrada no topo: encostada ao topo na notch, com margem quando flutua', () => {
    const n = boundsNotch(ecra, true, 'estado');
    expect(n).toEqual({ x: Math.round((1512 - TAMANHOS.notch.estado.w) / 2), y: 0, width: TAMANHOS.notch.estado.w, height: TAMANHOS.notch.estado.h });
    const f = boundsNotch(ecra, false, 'estado');
    expect(f.y).toBe(8);
    expect(f.x + f.width / 2).toBeCloseTo(756, 0);
  });

  it('em repouso é uma faixa fina, invisível e encostada ao topo, com ou sem notch', () => {
    for (const notch of [true, false]) {
      const b = boundsNotch(ecra, notch, 'repouso');
      expect(b.y).toBe(0);
      expect(b.height).toBeLessThanOrEqual(14); // a janela invisível rouba cliques: tem de ser fina
      expect(b.width).toBeLessThanOrEqual(320);
      expect(b.x + b.width / 2).toBe(756);
    }
  });

  it('respeita ecrãs que não começam em 0,0 (segundo monitor)', () => {
    const segundo = { x: 1920, y: -200, width: 2560, height: 1440 };
    const b = boundsNotch(segundo, false, 'aberto');
    expect(b.y).toBe(-200 + 8);
    expect(boundsNotch(segundo, false, 'repouso').y).toBe(-200);
    expect(b.x + b.width / 2).toBe(1920 + 1280);
  });

  it('estado desconhecido cai no repouso flutuante em vez de rebentar', () => {
    expect(boundsNotch(ecra, true, 'inventado').width).toBe(TAMANHOS.flutuante.repouso.w);
  });

  it('a janela só cresce do repouso para os outros estados, e a zona de largar é a maior', () => {
    for (const k of ['notch', 'flutuante'] as const) {
      const t = TAMANHOS[k];
      for (const e of ['estado', 'dica', 'aberto'] as const) expect(t[e].h).toBeGreaterThan(t.repouso.h);
      expect(t.aberto.w * t.aberto.h).toBeGreaterThan(t.dica.w * t.dica.h);
      expect(t.aberto.w * t.aberto.h).toBeGreaterThan(t.estado.w * t.estado.h);
    }
  });

  it('a janela final cabe sempre na área de trabalho e fica centrada', () => {
    for (const w of [{ x: 0, y: 37, width: 1512, height: 945 }, { x: 0, y: 0, width: 1280, height: 720 }, { x: 0, y: 0, width: 3840, height: 2160 }]) {
      const b = boundsFinal(w);
      expect(b.x).toBeGreaterThanOrEqual(w.x);
      expect(b.y).toBeGreaterThanOrEqual(w.y);
      expect(b.x + b.width).toBeLessThanOrEqual(w.x + w.width);
      expect(b.y + b.height).toBeLessThanOrEqual(w.y + w.height);
      expect(b.width).toBeLessThanOrEqual(1440);
      expect(b.height).toBeLessThanOrEqual(920);
      expect(b.x - w.x).toBeCloseTo(w.x + w.width - (b.x + b.width), -1);
    }
  });

  it('a animação vai da pílula ao tamanho final, sem saltos nas pontas', () => {
    const de = boundsNotch(ecra, true, 'estado');
    const para = boundsFinal({ x: 0, y: 37, width: 1512, height: 945 });
    expect(interpolar(de, para, 0)).toEqual(de);
    expect(interpolar(de, para, 1)).toEqual(para);
    const meio = interpolar(de, para, 0.5);
    expect(meio.width).toBeGreaterThan(de.width);
    expect(meio.width).toBeLessThan(para.width);
    expect(suave(0)).toBe(0);
    expect(suave(1)).toBe(1);
    expect(suave(0.5)).toBeGreaterThan(0.5); // arranca depressa e assenta
    expect(suave(-3)).toBe(0);
    expect(suave(7)).toBe(1);
  });

  it('a opacidade só sobe quando a janela já tem tamanho para se ver', () => {
    expect(opacidadeDaAnimacao(0)).toBe(0);
    expect(opacidadeDaAnimacao(0.1)).toBe(0);
    expect(opacidadeDaAnimacao(0.32)).toBeCloseTo(0.5, 1);
    expect(opacidadeDaAnimacao(0.6)).toBe(1);
    expect(opacidadeDaAnimacao(1)).toBe(1);
  });
});

describe('modo notch: o que a página pode pedir', () => {
  it('só aceita os estados conhecidos', () => {
    for (const e of ['repouso', 'estado', 'dica', 'aberto']) expect(ehEstadoNotch(e)).toBe(true);
    for (const e of ['', 'enorme', null, undefined, 3, {}, '__proto__']) expect(ehEstadoNotch(e)).toBe(false);
  });

  it('preferências: modo notch ligado por omissão, e lixo não estraga nada', () => {
    expect(sanearPrefs(undefined)).toEqual({ modoNotch: true, dicasVistas: 0 });
    expect(sanearPrefs({ modoNotch: false })).toEqual({ modoNotch: false, dicasVistas: 0 });
    expect(sanearPrefs({ modoNotch: 'sim' })).toEqual({ modoNotch: true, dicasVistas: 0 });
    expect(sanearPrefs('texto')).toEqual({ modoNotch: true, dicasVistas: 0 });
    expect(sanearPrefs({ outra: 1 })).toEqual({ modoNotch: true, dicasVistas: 0 });
  });

  it('a dica de arranque só se mostra nos primeiros arranques', () => {
    expect(MAX_DICAS).toBe(3);
    expect(sanearPrefs({ dicasVistas: 2 }).dicasVistas).toBe(2);
    expect(sanearPrefs({ dicasVistas: -5 }).dicasVistas).toBe(0);
    expect(sanearPrefs({ dicasVistas: 1e9 }).dicasVistas).toBe(99);
    expect(sanearPrefs({ dicasVistas: 'x' }).dicasVistas).toBe(0);
  });
});
