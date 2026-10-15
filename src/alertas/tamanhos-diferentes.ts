import type { MedidaPagina } from '../analise/caixas';
import { agruparTamanhos, formatarPaginas } from '../analise/resumo';
import { formatarMm } from '../comum/unidades';
import type { Alerta } from './tipos';

/** Aviso quando as páginas não têm todas a mesma medida final. */
export function alertaTamanhosDiferentes(
  paginas: Pick<MedidaPagina, 'larguraMm' | 'alturaMm'>[],
  toleranciaMm: number,
): Alerta[] {
  const grupos = agruparTamanhos(paginas, toleranciaMm);
  if (grupos.length < 2) return [];

  return [
    {
      id: 'tamanhos-diferentes',
      gravidade: 'aviso',
      titulo: 'As páginas não têm todas o mesmo tamanho',
      detalhe: grupos
        .map((g) => `${formatarMm(g.larguraMm)} × ${formatarMm(g.alturaMm)} mm: ${formatarPaginas(g.paginas)}`)
        .join('\n'),
      // salta para a primeira página que foge ao tamanho da página 1
      pagina: grupos[1].paginas[0],
    },
  ];
}
