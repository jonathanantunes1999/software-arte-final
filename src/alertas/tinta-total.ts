import type { AnaliseDocumento } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import { descreverCor } from '../analise/cores';
import { formatarPaginas } from '../analise/resumo';
import { mmParaPt } from '../comum/unidades';
import { pinturas } from './comum';
import { agruparCaixas } from './geometria';
import type { Alerta, ConfigAlertas, Local } from './tipos';

const FOLGA_MANCHA_MM = 5;
const LIMITE_LOCAIS = 400;
const LIMITE_LINHAS = 5;

/** Soma de C+M+Y+K em %, ou null se a cor não é CMYK de quatro componentes */
export function tintaTotal(valores: number[]): number | null {
  return valores.length === 4 ? Math.round((valores[0] + valores[1] + valores[2] + valores[3]) * 1000) / 10 : null;
}

/**
 * Tinta a mais: cores CMYK cuja soma passa o limite (300% por omissão) secam mal e podem
 * manchar o verso. Só olha para vetores e texto: imagens e degradés não se leem aqui.
 */
export function alertasTintaTotal(analise: AnaliseDocumento, cfg: ConfigAlertas): Alerta[] {
  const limite = cfg.tintaTotalMaxPercent;
  if (!(limite > 0)) return [];

  const grupos = new Map<string, { cor: string; total: number; n: number; paginas: Set<number> }>();
  const locais: Local[] = [];
  let maximo = 0;
  let n = 0;

  for (const pg of analise.paginas) {
    const manchas: Caixa[] = [];
    for (const e of pg.ir.eventos) {
      if (e.tipo === 'texto' && e.texto?.invisivel) continue;
      if (e.tipo === 'imagem' || e.tipo === 'shading') continue;
      let acima = false;
      for (const c of pinturas(e)) {
        const t = c.familia === 'CMYK' ? tintaTotal(c.valores) : null;
        if (t === null || t <= limite) continue;
        acima = true;
        maximo = Math.max(maximo, t);
        const chave = descreverCor(c);
        const g = grupos.get(chave) ?? grupos.set(chave, { cor: chave, total: t, n: 0, paginas: new Set() }).get(chave)!;
        g.n++;
        g.paginas.add(pg.info.indice);
      }
      if (acima) {
        n++;
        manchas.push(e.bbox);
      }
    }
    for (const caixa of agruparCaixas(manchas, mmParaPt(FOLGA_MANCHA_MM))) locais.push({ pagina: pg.info.indice, caixa });
  }
  if (!n) return [];

  const linhas = [...grupos.values()]
    .sort((a, b) => b.total - a.total)
    .map((g) => `${g.cor}: ${g.total.toString().replace('.', ',')}% em ${g.n} ${g.n === 1 ? 'objeto' : 'objetos'} (${formatarPaginas([...g.paginas], 6)})`);
  const lista = linhas.length > LIMITE_LINHAS ? [...linhas.slice(0, LIMITE_LINHAS), `…e mais ${linhas.length - LIMITE_LINHAS}`] : linhas;

  return [
    {
      id: 'tinta-total',
      gravidade: maximo >= limite + 100 ? 'erro' : 'aviso',
      titulo: 'Tinta a mais',
      detalhe: [
        `Acima de ${limite.toString().replace('.', ',')}% de tinta total a secagem falha e a tinta pode manchar. Reduz as cores ou usa um preto mais pobre. As imagens não se verificam aqui.`,
        ...lista,
      ].join('\n'),
      locais: locais.sort((a, b) => a.pagina - b.pagina).slice(0, LIMITE_LOCAIS),
    },
  ];
}
