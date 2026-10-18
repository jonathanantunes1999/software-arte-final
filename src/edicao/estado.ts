import type { Caixa } from '../analise/caixas';
import type { Cor } from '../analise/ir';
import { distanciaAoTraco, pontoNoPreenchimento } from '../analise/inspecao';
import { aplicarAoPonto, IDENTIDADE, inversa, produto, transformarCaixa, type Matriz } from './matriz';
import type { Cmyk, Edicao, ObjetoEditavel } from './tipos';

/**
 * O estado dos objetos de uma página depois das edições feitas até agora: onde está cada um, se foi apagado, que cor tem.
 * A interface usa-o para desenhar a seleção e para saber em que se clica, sem esperar que o PDF editado volte a ser desenhado.
 */
export interface ObjetoVivo extends ObjetoEditavel {
  /** A caixa de agora (a original, transformada) */
  bbox: Caixa;
  /** A caixa de partida, do ficheiro original */
  original: Caixa;
  /** Tudo o que se lhe fez no espaço da página, composto */
  matriz: Matriz;
  apagado: boolean;
}

const emCor = (c: Cmyk): Cor => ({ familia: 'CMYK', valores: [...c] });

export function estadoDosObjetos(objetos: ObjetoEditavel[], edicoes: Edicao[], pagina: number): ObjetoVivo[] {
  const m = new Map<number, { matriz: Matriz; apagado: boolean; fill?: Cmyk; traco?: Cmyk }>();
  for (const e of edicoes) {
    if (e.pagina !== pagina) continue;
    const s = m.get(e.objeto) ?? m.set(e.objeto, { matriz: IDENTIDADE, apagado: false }).get(e.objeto)!;
    if (e.tipo === 'apagar') s.apagado = true;
    else if (e.tipo === 'transformar') s.matriz = produto(s.matriz, e.matriz);
    else {
      if (e.preenchimento) s.fill = e.preenchimento;
      if (e.traco) s.traco = e.traco;
    }
  }
  return objetos.map((o) => {
    const s = m.get(o.id);
    if (!s) return { ...o, original: o.bbox, matriz: IDENTIDADE, apagado: false };
    return {
      ...o,
      original: o.bbox,
      bbox: transformarCaixa(o.bbox, s.matriz),
      matriz: s.matriz,
      apagado: s.apagado,
      cor: s.fill && o.preenche ? emCor(s.fill) : o.cor,
      corTraco: s.traco && o.traca ? emCor(s.traco) : o.corTraco,
    };
  });
}

/** O objeto que está por cima no ponto (x, y) da página, ou null. `tolerancia` (pt) deixa apanhar linhas finas com o rato. */
export function objetoEm(objetos: ObjetoVivo[], x: number, y: number, tolerancia = 1): ObjetoVivo | null {
  for (let i = objetos.length - 1; i >= 0; i--) {
    const o = objetos[i];
    if (o.apagado) continue;
    const b = o.bbox;
    if (x < b.x0 - tolerancia || x > b.x1 + tolerancia || y < b.y0 - tolerancia || y > b.y1 + tolerancia) continue;
    if (o.tipo !== 'forma' || !o.geometria) {
      if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return o;
      continue;
    }
    // no desenho original: o ponto traz-se de volta pela inversa do que se lhe fez
    const inv = inversa(o.matriz);
    if (!inv) continue;
    const [ox, oy] = aplicarAoPonto(inv, x, y);
    const escala = Math.sqrt(Math.abs(o.matriz[0] * o.matriz[3] - o.matriz[1] * o.matriz[2])) || 1;
    if (o.preenche && pontoNoPreenchimento(o.geometria, ox, oy)) return o;
    const folga = Math.max((o.espessuraTraco ?? 0) / 2, tolerancia / escala);
    if (o.traca && distanciaAoTraco(o.geometria, ox, oy) <= folga) return o;
  }
  return null;
}

/**
 * Junta a edição nova à última se for do mesmo tipo e do mesmo objeto, e tiver sido feita logo a seguir (empurrar com as
 * setas várias vezes é uma só alteração para desfazer). Devolve a lista nova e se se juntou.
 */
export function fundirSeguida(edicoes: Edicao[], nova: Edicao, passouMs: number, janelaMs = 700): { edicoes: Edicao[]; fundiu: boolean } {
  const ultima = edicoes[edicoes.length - 1];
  if (ultima && passouMs <= janelaMs && ultima.tipo === 'transformar' && nova.tipo === 'transformar' && ultima.pagina === nova.pagina && ultima.objeto === nova.objeto) {
    return { edicoes: [...edicoes.slice(0, -1), { ...ultima, matriz: produto(ultima.matriz, nova.matriz) }], fundiu: true };
  }
  return { edicoes: [...edicoes, nova], fundiu: false };
}
