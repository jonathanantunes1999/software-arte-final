/**
 * Que correção automática resolve cada alerta. A interface usa isto para mostrar o botão
 * "Corrigir" no alerta e levar o utilizador ao painel Correções já preparado.
 */
export type TipoCorrecao = 'sangria' | 'overprint-branco' | 'overprint-preto' | 'overprint-spots' | 'juntar-spots' | 'faca-em-spot' | 'curvas' | 'rgb-cmyk' | 'marcas';

export interface CorrecaoSugerida {
  tipo: TipoCorrecao;
  /** Texto do botão */
  rotulo: string;
}

const MAPA: Record<string, CorrecaoSugerida> = {
  'sangria-ausente': { tipo: 'sangria', rotulo: 'Gerar sangria' },
  'sangria-curta': { tipo: 'sangria', rotulo: 'Gerar sangria' },
  'overprint-branco': { tipo: 'overprint-branco', rotulo: 'Corrigir overprint' },
  'overprint-preto-desligado': { tipo: 'overprint-preto', rotulo: 'Ligar overprint' },
  'overprint-spots-tecnicas': { tipo: 'overprint-spots', rotulo: 'Ligar overprint' },
  'spots-duplicadas': { tipo: 'juntar-spots', rotulo: 'Juntar spots' },
  'faca-em-processo': { tipo: 'faca-em-spot', rotulo: 'Converter em spot' },
  'marcas-corte-ausentes': { tipo: 'marcas', rotulo: 'Criar marcas de corte' },
  'marcas-corte-sem-espaco': { tipo: 'marcas', rotulo: 'Criar marcas de corte' },
  rgb: { tipo: 'rgb-cmyk', rotulo: 'Converter para CMYK' },
  'texto-em-fonte': { tipo: 'curvas', rotulo: 'Texto em curvas' },
};

export function correcaoDoAlerta(id: string): CorrecaoSugerida | null {
  return MAPA[id] ?? null;
}
