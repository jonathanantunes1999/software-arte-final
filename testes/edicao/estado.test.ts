import { describe, expect, it } from 'vitest';
import { estadoDosObjetos, fundirSeguida, objetoEm } from '../../src/edicao/estado';
import { escalaEm, translacao } from '../../src/edicao/matriz';
import type { Edicao, ObjetoEditavel } from '../../src/edicao/tipos';

const quadrado = (id: number, x0: number, y0: number, x1: number, y1: number): ObjetoEditavel => ({
  id,
  tipo: 'forma',
  bbox: { x0, y0, x1, y1 },
  preenche: true,
  traca: false,
  geometria: { contornos: [Float32Array.from([x0, y0, x1, y0, x1, y1, x0, y1])], fechados: [true], parImpar: false },
});
const OBJ = [quadrado(0, 0, 0, 100, 100), quadrado(1, 20, 20, 40, 40), { ...quadrado(2, 60, 60, 80, 80), tipo: 'imagem' as const, geometria: undefined }];

describe('estado dos objetos depois das edições', () => {
  it('sem edições, tudo como está', () => {
    const v = estadoDosObjetos(OBJ, [], 0);
    expect(v.map((o) => o.bbox)).toEqual(OBJ.map((o) => o.bbox));
    expect(v.every((o) => !o.apagado)).toBe(true);
  });

  it('mover e mudar o tamanho refletem-se na caixa; só as da página pedida contam', () => {
    const ed: Edicao[] = [
      { tipo: 'transformar', pagina: 0, objeto: 1, matriz: translacao(10, 5) },
      { tipo: 'transformar', pagina: 0, objeto: 1, matriz: escalaEm(2, 2, 30, 25) },
      { tipo: 'transformar', pagina: 1, objeto: 2, matriz: translacao(99, 99) },
    ];
    const v = estadoDosObjetos(OBJ, ed, 0);
    expect(v[1].bbox).toEqual({ x0: 30, y0: 25, x1: 70, y1: 65 });
    expect(v[2].bbox).toEqual(OBJ[2].bbox);
  });

  it('apagar marca; cor muda a cor que se mostra (só onde há preenchimento)', () => {
    const v = estadoDosObjetos(OBJ, [{ tipo: 'apagar', pagina: 0, objeto: 0 }, { tipo: 'cor', pagina: 0, objeto: 1, preenchimento: [1, 0, 0, 0] }], 0);
    expect(v[0].apagado).toBe(true);
    expect(v[1].cor).toEqual({ familia: 'CMYK', valores: [1, 0, 0, 0] });
  });
});

describe('em que objeto se clica', () => {
  it('o que está por cima ganha; o fundo apanha-se onde não há mais nada', () => {
    const v = estadoDosObjetos(OBJ, [], 0);
    expect(objetoEm(v, 30, 30)?.id).toBe(1);
    expect(objetoEm(v, 70, 70)?.id).toBe(2);
    expect(objetoEm(v, 5, 5)?.id).toBe(0);
    expect(objetoEm(v, 200, 200)).toBeNull();
  });

  it('um objeto apagado já não se apanha (apanha-se o que estava por baixo)', () => {
    const v = estadoDosObjetos(OBJ, [{ tipo: 'apagar', pagina: 0, objeto: 1 }], 0);
    expect(objetoEm(v, 30, 30)?.id).toBe(0);
  });

  it('depois de mover, apanha-se no sítio novo e já não no antigo', () => {
    const v = estadoDosObjetos(OBJ, [{ tipo: 'transformar', pagina: 0, objeto: 1, matriz: translacao(50, 0) }], 0);
    expect(objetoEm(v, 80, 30)?.id).toBe(1);
    expect(objetoEm(v, 30, 30)?.id).toBe(0);
  });

  it('uma forma com buraco: dentro do buraco apanha-se o que está por baixo', () => {
    const moldura: ObjetoEditavel = {
      id: 3,
      tipo: 'forma',
      bbox: { x0: 0, y0: 0, x1: 100, y1: 100 },
      preenche: true,
      traca: false,
      geometria: {
        contornos: [Float32Array.from([0, 0, 100, 0, 100, 100, 0, 100]), Float32Array.from([30, 30, 30, 70, 70, 70, 70, 30])],
        fechados: [true, true],
        parImpar: true,
      },
    };
    const v = estadoDosObjetos([OBJ[0], moldura], [], 0);
    expect(objetoEm(v, 10, 10)?.id).toBe(3);
    expect(objetoEm(v, 50, 50)?.id).toBe(0);
  });

  it('uma linha apanha-se com tolerância', () => {
    const linha: ObjetoEditavel = {
      id: 0,
      tipo: 'forma',
      bbox: { x0: 0, y0: 49, x1: 100, y1: 51 },
      preenche: false,
      traca: true,
      espessuraTraco: 0.5,
      geometria: { contornos: [Float32Array.from([0, 50, 100, 50])], fechados: [false], parImpar: false },
    };
    const v = estadoDosObjetos([linha], [], 0);
    expect(objetoEm(v, 50, 50.8, 1)?.id).toBe(0);
    expect(objetoEm(v, 50, 53, 1)).toBeNull();
  });
});

describe('juntar edições seguidas (setas)', () => {
  const t = (dx: number): Edicao => ({ tipo: 'transformar', pagina: 0, objeto: 1, matriz: translacao(dx, 0) });

  it('duas seguidas ao mesmo objeto, logo a seguir, são uma só', () => {
    const r = fundirSeguida([t(1)], t(2), 100);
    expect(r.fundiu).toBe(true);
    expect(r.edicoes).toHaveLength(1);
    const e = r.edicoes[0];
    expect(e.tipo === 'transformar' && e.matriz[4]).toBe(3);
  });

  it('demasiado tempo depois, ou outro objeto, ou outro tipo: ficam à parte', () => {
    expect(fundirSeguida([t(1)], t(2), 5000).fundiu).toBe(false);
    expect(fundirSeguida([t(1)], { ...t(2), objeto: 7 }, 100).fundiu).toBe(false);
    expect(fundirSeguida([{ tipo: 'apagar', pagina: 0, objeto: 1 }], t(2), 100).fundiu).toBe(false);
  });
});
