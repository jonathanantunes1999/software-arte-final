export type Gravidade = 'erro' | 'aviso' | 'info';

export interface Alerta {
  /** Estável entre execuções, para a lista não "saltar" quando se recalcula */
  id: string;
  gravidade: Gravidade;
  /** Descrição curta, em português simples */
  titulo: string;
  detalhe?: string;
  /** Página (0-based) para onde saltar ao clicar */
  pagina?: number;
}
