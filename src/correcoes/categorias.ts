import type { TipoCorrecao } from '../alertas/correcao-sugerida';
import type { Inventario } from './inventario';

/**
 * As correções agrupadas por assunto, para a barra lateral as mostrar por baixo de "Correções":
 * Cor (RGB, spots), Overprint, Página (sangria e marcas) e Texto (curvas). "Tudo" é a lista inteira.
 */
export type Categoria = 'tudo' | 'cor' | 'overprint' | 'pagina' | 'texto';

export const CATEGORIAS: { id: Categoria; nome: string; dica: string }[] = [
  { id: 'tudo', nome: 'Tudo', dica: 'Tudo o que dá para corrigir neste ficheiro' },
  { id: 'cor', nome: 'Cor', dica: 'RGB para CMYK, spots e cores de faca' },
  { id: 'overprint', nome: 'Overprint', dica: 'Brancos, pretos e spots técnicas' },
  { id: 'pagina', nome: 'Página', dica: 'Sangria e marcas de corte' },
  { id: 'texto', nome: 'Texto', dica: 'Texto em curvas' },
];

/** A que categoria pertence cada correção (e o "corrigir tudo") */
export function categoriaDe(tipo: TipoCorrecao | 'tudo'): Categoria {
  switch (tipo) {
    case 'rgb-cmyk':
    case 'juntar-spots':
    case 'faca-em-spot':
      return 'cor';
    case 'overprint-branco':
    case 'overprint-preto':
    case 'overprint-spots':
      return 'overprint';
    case 'sangria':
    case 'marcas':
      return 'pagina';
    case 'curvas':
      return 'texto';
    default:
      return 'tudo';
  }
}

/**
 * Quantas coisas há para corrigir em cada categoria (os mesmos números que o painel mostra ao lado de cada opção).
 * Sem inventário (a analisar) tudo a zeros.
 */
export function contarPorCategoria(inv: Inventario | null, paginasSemSangria: number, paginasSemMarcas: number): Record<Categoria, number> {
  const cor = inv ? inv.rgb.vetores + inv.rgb.imagens + inv.juncoesSugeridas.length + inv.coresDeTraco.length : 0;
  const overprint = inv ? inv.overprint.branco + inv.overprint.pretoTexto + inv.overprint.pretoLinha + inv.overprint.spotsTecnicas : 0;
  const pagina = paginasSemSangria + paginasSemMarcas;
  const texto = inv ? new Set(inv.fontes.filter((f) => f.convertivel || f.substituivel).map((f) => f.nome)).size : 0;
  return { tudo: cor + overprint + pagina + texto, cor, overprint, pagina, texto };
}
