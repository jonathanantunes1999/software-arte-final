import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Mascote from '../../src/interface/Mascote.svelte';
import { ACESSORIOS, PERFIL_OMISSAO, type Acessorio } from '../../src/mascote/personalizacao';

const desenhar = (acessorio: Acessorio, extra: Record<string, unknown> = {}) =>
  render(Mascote, { props: { perfil: { ...PERFIL_OMISSAO, acessorio }, interativa: false, configuravel: false, ...extra } }).body;

describe('mascote: cada acessório da lista é mesmo desenhado', () => {
  const comAcessorio = ACESSORIOS.filter((a) => a.valor !== 'nenhum');

  it('sem acessório não desenha nenhum grupo de acessório', () => {
    expect(desenhar('nenhum')).not.toMatch(/class="acc[ "]/);
  });

  for (const a of comAcessorio) {
    it(`${a.nome}: aparece no desenho`, () => {
      expect(desenhar(a.valor)).toMatch(/class="acc[ "]/);
    });
  }

  it('cada acessório desenha um grupo próprio (dois acessórios nunca dão o mesmo desenho)', () => {
    const vistos = new Map<string, Acessorio>();
    for (const a of comAcessorio) {
      const svg = desenhar(a.valor).replace(/masc[a-z0-9]{6}/g, 'm');
      expect(vistos.has(svg), `${a.valor} igual a ${vistos.get(svg)}`).toBe(false);
      vistos.set(svg, a.valor);
    }
  });

  it('só um acessório de cada vez', () => {
    for (const a of comAcessorio) expect(desenhar(a.valor).match(/class="acc[ "]/g)?.length).toBe(1);
  });

  it('os auscultadores tiram as bolas de trás dos flancos, onde ficam os copos', () => {
    const normal = desenhar('nenhum');
    const fones = desenhar('auscultadores');
    const repouso = (svg: string, n: number) => /--rx:\s*(\d+)px/.exec(svg.split(`bola-${n}`)[1])?.[1];
    expect(repouso(normal, 0)).toBe('214');
    expect(repouso(fones, 0)).not.toBe('214');
    expect(repouso(fones, 1)).toBe(repouso(normal, 1)); // as da frente ficam como estão
  });
});
