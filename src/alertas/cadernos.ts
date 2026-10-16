import type { AnaliseDocumento } from '../analise/analisador';
import type { Alerta, ConfigAlertas } from './tipos';

/**
 * Cadernos: um livro ou catálogo imprime-se em folhas dobradas, por isso o nº de páginas tem de ser
 * múltiplo de 4 (ou de 8, 16... conforme a gráfica). Só se avisa com mais de 4 páginas: um flyer de
 * 2 ou 3 páginas não é um caderno.
 */
export function alertaCadernos(analise: AnaliseDocumento, cfg: ConfigAlertas): Alerta[] {
  const m = Math.round(cfg.multiploPaginas);
  const n = analise.paginas.length;
  if (m < 2 || n <= 4 || n % m === 0) return [];
  const faltam = m - (n % m);
  return [
    {
      id: 'cadernos-multiplo',
      gravidade: 'aviso',
      titulo: `Nº de páginas não é múltiplo de ${m}`,
      detalhe: `O ficheiro tem ${n} páginas. Um caderno pede múltiplos de ${m}: faltam ${faltam} ${faltam === 1 ? 'página' : 'páginas'} (ou sobram ${n % m}). Acrescenta páginas em branco, de notas ou de guarda.`,
      pagina: n - 1,
    },
  ];
}
