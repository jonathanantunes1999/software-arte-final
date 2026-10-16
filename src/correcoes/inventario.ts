import { acharOverprint } from '../alertas/overprint';
import type { ConfigAlertas } from '../alertas/tipos';
import type { AnaliseDocumento } from '../analise/analisador';
import { chaveSpot, eNomeDeSpot, ehBranco } from '../analise/cores';
import { pinturas } from '../alertas/comum';
import type { FonteInventariada } from '../texto/inventario-fontes';

/**
 * O que há para corrigir num ficheiro, para o painel de correções: spots (com sugestão de junção),
 * cores de processo usadas em traços (candidatas a faca ou vincos) e contagens de overprint.
 */

export interface SpotInventariada {
  nome: string;
  objetos: number;
  paginas: number[];
}

export interface CorDeTraco {
  /** C, M, Y, K de 0 a 1 */
  valores: [number, number, number, number];
  objetos: number;
  /** Espessura mais frequente em pt, para reconhecer linhas de faca */
  espessuraMediaPt: number;
}

export interface Inventario {
  spots: SpotInventariada[];
  /** Pares de junção sugeridos: o nome menos usado passa ao mais usado do mesmo grupo */
  juncoesSugeridas: { de: string; para: string }[];
  coresDeTraco: CorDeTraco[];
  overprint: { branco: number; pretoTexto: number; pretoLinha: number; spotsTecnicas: number };
  /** Fontes usadas em texto e se se convertem em curvas (preenchido pelo worker, que tem o PDF aberto) */
  fontes: FonteInventariada[];
  /** Objetos em RGB: cores de vetores e texto (sem o branco, que não custa nada) e imagens */
  rgb: { vetores: number; imagens: number };
}

const MAX_CORES = 12;

export function inventariar(analise: AnaliseDocumento, cfg: ConfigAlertas): Inventario {
  const usos = new Map<string, { objetos: number; paginas: Set<number> }>();
  const cores = new Map<string, { valores: [number, number, number, number]; objetos: number; soma: number }>();
  const overprint = { branco: 0, pretoTexto: 0, pretoLinha: 0, spotsTecnicas: 0 };
  const rgb = { vetores: 0, imagens: 0 };

  for (const pg of analise.paginas) {
    for (const e of pg.ir.eventos) {
      if (e.tipo === 'texto' && e.texto?.invisivel) continue;
      const nomes = new Set<string>();
      if (e.tipo === 'imagem') {
        if (e.imagem?.espacoCor === 'RGB') rgb.imagens++;
      } else if (pinturas(e).some((c) => c.familia === 'RGB' && !ehBranco(c))) rgb.vetores++;
      if (e.tipo === 'imagem') for (const n of e.imagem?.nomes ?? []) if (eNomeDeSpot(n)) nomes.add(n);
      for (const c of pinturas(e)) for (const n of c.nomes ?? []) if (eNomeDeSpot(n)) nomes.add(n);
      for (const n of nomes) {
        const u = usos.get(n) ?? usos.set(n, { objetos: 0, paginas: new Set() }).get(n)!;
        u.objetos++;
        u.paginas.add(pg.info.indice);
      }
      if (e.tipo === 'forma' && e.traca && e.corTraco?.familia === 'CMYK' && e.corTraco.valores.length === 4) {
        const v = e.corTraco.valores.map((x) => Math.round(x * 1000) / 1000) as [number, number, number, number];
        const chave = v.join(',');
        const u = cores.get(chave) ?? cores.set(chave, { valores: v, objetos: 0, soma: 0 }).get(chave)!;
        u.objetos++;
        u.soma += e.espessuraTraco ?? 0;
      }
    }
    for (const a of acharOverprint(pg.ir.eventos, cfg)) {
      if (a.tipo === 'branco') overprint.branco++;
      else if (a.tipo === 'preto-texto') overprint.pretoTexto++;
      else if (a.tipo === 'preto-linha') overprint.pretoLinha++;
      else overprint.spotsTecnicas++;
    }
  }

  const spots = [...usos].map(([nome, u]) => ({ nome, objetos: u.objetos, paginas: [...u.paginas].sort((a, b) => a - b) })).sort((a, b) => b.objetos - a.objetos || a.nome.localeCompare(b.nome));

  const grupos = new Map<string, SpotInventariada[]>();
  for (const s of spots) (grupos.get(chaveSpot(s.nome)) ?? grupos.set(chaveSpot(s.nome), []).get(chaveSpot(s.nome))!).push(s);
  const juncoesSugeridas: Inventario['juncoesSugeridas'] = [];
  for (const g of grupos.values()) if (g.length > 1) for (const s of g.slice(1)) juncoesSugeridas.push({ de: s.nome, para: g[0].nome });

  const coresDeTraco = [...cores.values()]
    .sort((a, b) => b.objetos - a.objetos)
    .slice(0, MAX_CORES)
    .map((c) => ({ valores: c.valores, objetos: c.objetos, espessuraMediaPt: Math.round((c.soma / c.objetos) * 100) / 100 }));

  return { spots, juncoesSugeridas, coresDeTraco, overprint, fontes: [], rgb };
}
