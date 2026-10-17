/** As secções do painel lateral: uma de cada vez, escolhidas na barra da esquerda */
export type Seccao = 'alertas' | 'correcoes' | 'separacoes' | 'layers' | 'caixas';

export interface InfoSeccao {
  id: Seccao;
  nome: string;
  /** Uma frase que diz para que serve */
  dica: string;
}

export const SECCOES: InfoSeccao[] = [
  { id: 'alertas', nome: 'Alertas', dica: 'O que está mal no ficheiro' },
  { id: 'correcoes', nome: 'Correções', dica: 'Corrigir numa cópia' },
  { id: 'separacoes', nome: 'Separações', dica: 'Ver cada tinta em separado' },
  { id: 'layers', nome: 'Layers', dica: 'Ligar e desligar camadas' },
  { id: 'caixas', nome: 'Caixas', dica: 'Corte, sangria e margens' },
];

export const GRUPOS: { titulo: string; ids: Seccao[] }[] = [
  { titulo: 'Rever', ids: ['alertas', 'caixas', 'layers', 'separacoes'] },
  { titulo: 'Corrigir', ids: ['correcoes'] },
];
