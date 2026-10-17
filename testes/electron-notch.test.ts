import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos: é o código da casca, partilhado com o teste
import { MAX_DICAS, PALCO, boundsPalco, boundsPalcoEscuro, boundsFinal, boundsNotch, ehEstadoNotch, interpolar, opacidadeDaAnimacao, sanearPrefs, suave, temNotchNoMac, TAMANHOS } from '../electron/notch.mjs';

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

  it('respeita ecrãs que não começam em 0,0 (segundo monitor)', () => {
    const segundo = { x: 1920, y: -200, width: 2560, height: 1440 };
    const b = boundsNotch(segundo, false, 'estado');
    expect(b.y).toBe(-200 + 8);
    expect(boundsNotch(segundo, false, 'aberto').y).toBe(-200);
    
    expect(b.x + b.width / 2).toBe(1920 + 1280);
  });

  it('estado desconhecido cai na zona de largar flutuante em vez de rebentar', () => {
    expect(boundsNotch(ecra, true, 'inventado').width).toBe(TAMANHOS.flutuante.aberto.w);
  });

  it('a zona de largar é a maior de todas', () => {
    for (const k of ['notch', 'flutuante'] as const) {
      const t = TAMANHOS[k];
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
    for (const e of ['estado', 'dica', 'aberto']) expect(ehEstadoNotch(e)).toBe(true);
    for (const e of ['repouso', '', 'enorme', null, undefined, 3, {}, '__proto__']) expect(ehEstadoNotch(e)).toBe(false);
  });

  it('preferências: modo notch ligado por omissão, e lixo não estraga nada', () => {
    expect(sanearPrefs(undefined)).toEqual({ modoNotch: true, dicasVistas: 0, manterNaBandeja: true, animacaoNotch: true });
    expect(sanearPrefs({ modoNotch: false })).toEqual({ modoNotch: false, dicasVistas: 0, manterNaBandeja: true, animacaoNotch: true });
    expect(sanearPrefs({ modoNotch: 'sim' })).toEqual({ modoNotch: true, dicasVistas: 0, manterNaBandeja: true, animacaoNotch: true });
    expect(sanearPrefs('texto')).toEqual({ modoNotch: true, dicasVistas: 0, manterNaBandeja: true, animacaoNotch: true });
    expect(sanearPrefs({ outra: 1 })).toEqual({ modoNotch: true, dicasVistas: 0, manterNaBandeja: true, animacaoNotch: true });
  });

  it('a dica de arranque só se mostra nos primeiros arranques', () => {
    expect(MAX_DICAS).toBe(3);
    expect(sanearPrefs({ dicasVistas: 2 }).dicasVistas).toBe(2);
    expect(sanearPrefs({ dicasVistas: -5 }).dicasVistas).toBe(0);
    expect(sanearPrefs({ dicasVistas: 1e9 }).dicasVistas).toBe(99);
    expect(sanearPrefs({ dicasVistas: 'x' }).dicasVistas).toBe(0);
  });
});

describe('modo notch: palco da animação de entrada', () => {
  const ecra = { x: 0, y: 0, width: 1512, height: 982 };

  it('o palco da janelinha fica centrado e encostado ao topo, e o palco escuro (de onde nasce a janela principal) dentro dele', () => {
    const janela = boundsPalco(ecra);
    expect(janela).toEqual({ x: (1512 - PALCO.janela.w) / 2, y: 0, width: PALCO.janela.w, height: PALCO.janela.h });
    const escuro = boundsPalcoEscuro(ecra);
    expect(escuro.x + escuro.width / 2).toBe(janela.x + janela.width / 2);
    expect(escuro.y).toBe(janela.y);
    expect(escuro.width).toBeLessThan(janela.width);
    expect(escuro.height).toBeLessThan(janela.height);
  });

  it('o palco escuro cresce a partir da pílula (é maior do que a zona de largar)', () => {
    expect(PALCO.escuro.w).toBeGreaterThan(360);
    expect(PALCO.escuro.h).toBeGreaterThan(100);
  });

  it('acompanha o ecrã (outro monitor, com origem diferente)', () => {
    const b = boundsPalco({ x: 1512, y: 40, width: 1920, height: 1080 });
    expect(b.x).toBe(1512 + (1920 - PALCO.janela.w) / 2);
    expect(b.y).toBe(40);
  });

  it('a animação liga-se e desliga-se nas preferências (ligada por omissão, à prova de lixo)', () => {
    expect(sanearPrefs({ animacaoNotch: false }).animacaoNotch).toBe(false);
    expect(sanearPrefs({ animacaoNotch: 'não' }).animacaoNotch).toBe(true);
    expect(sanearPrefs(undefined).animacaoNotch).toBe(true);
  });
});
