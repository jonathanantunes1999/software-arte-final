import { describe, expect, it } from 'vitest';
import type { TipoCorrecao } from '../../src/alertas/correcao-sugerida';
import { CATEGORIAS, categoriaDe, contarPorCategoria } from '../../src/correcoes/categorias';
import type { Inventario } from '../../src/correcoes/inventario';

const inv = (parcial: Partial<Inventario> = {}): Inventario => ({
  spots: [],
  juncoesSugeridas: [],
  coresDeTraco: [],
  overprint: { branco: 0, pretoTexto: 0, pretoLinha: 0, spotsTecnicas: 0 },
  fontes: [],
  rgb: { vetores: 0, imagens: 0 },
  ...parcial,
});

describe('categorias de correções', () => {
  it('há "Tudo" e quatro categorias, pela ordem em que aparecem na barra', () => {
    expect(CATEGORIAS.map((c) => c.id)).toEqual(['tudo', 'cor', 'overprint', 'pagina', 'texto']);
    for (const c of CATEGORIAS) expect(c.dica.length).toBeGreaterThan(5);
  });

  it('cada correção pertence a uma categoria (e a de "tudo" é Tudo)', () => {
    const esperado: Record<TipoCorrecao, string> = {
      'rgb-cmyk': 'cor',
      'juntar-spots': 'cor',
      'faca-em-spot': 'cor',
      'overprint-branco': 'overprint',
      'overprint-preto': 'overprint',
      'overprint-spots': 'overprint',
      sangria: 'pagina',
      marcas: 'pagina',
      curvas: 'texto',
    };
    for (const [tipo, cat] of Object.entries(esperado)) expect(categoriaDe(tipo as TipoCorrecao)).toBe(cat);
    expect(categoriaDe('tudo')).toBe('tudo');
  });

  it('conta o que há para corrigir em cada categoria', () => {
    const n = contarPorCategoria(
      inv({
        rgb: { vetores: 3, imagens: 1 },
        juncoesSugeridas: [{ de: 'a', para: 'b' }],
        coresDeTraco: [{ valores: [0, 1, 0, 0], objetos: 2, espessuraMedia: 0.5 }] as never,
        overprint: { branco: 2, pretoTexto: 1, pretoLinha: 1, spotsTecnicas: 0 },
        fontes: [{ id: '1 0 R', nome: 'Arial', convertivel: true }, { id: '2 0 R', nome: 'Arial', convertivel: true }, { id: '3 0 R', nome: 'Gotham', convertivel: false }] as never,
      }),
      2,
      1,
    );
    expect(n.cor).toBe(3 + 1 + 1 + 1);
    expect(n.overprint).toBe(4);
    expect(n.pagina).toBe(3);
    // as fontes contam-se por nome (um ficheiro tem dezenas de subconjuntos da mesma)
    expect(n.texto).toBe(1);
    expect(n.tudo).toBe(n.cor + n.overprint + n.pagina + n.texto);
  });

  it('sem inventário (a analisar) só se contam as páginas', () => {
    expect(contarPorCategoria(null, 1, 2)).toEqual({ tudo: 3, cor: 0, overprint: 0, pagina: 3, texto: 0 });
  });
});
