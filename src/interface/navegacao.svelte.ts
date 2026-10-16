/**
 * Pedidos que partem de um sítio da interface e abrem outro (ex.: botão direito na mascote → Definições,
 * separador da mascote). `n` muda a cada pedido, para repetir o mesmo pedido também funcionar.
 */
export type SeparadorDefinicoes = 'verificacoes' | 'formatos' | 'relatorio' | 'mascote';

export const pedidoDefinicoes = $state<{ separador: SeparadorDefinicoes; n: number }>({ separador: 'verificacoes', n: 0 });

export function abrirDefinicoes(separador: SeparadorDefinicoes = 'verificacoes'): void {
  pedidoDefinicoes.separador = separador;
  pedidoDefinicoes.n++;
}
