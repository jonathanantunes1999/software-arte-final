import type { AnaliseDocumento } from '../analise/analisador';
import { alertasFontes } from './fontes';
import { alertasLinhasFinas } from './linhas-finas';
import { alertasMarcasCorte } from './marcas-corte';
import { alertasPreto } from './preto';
import { alertasResolucao } from './resolucao';
import { alertasSpotsDuplicadas } from './spots-duplicadas';
import { alertasRgb } from './rgb';
import { alertasSangria } from './sangria';
import { alertaTamanhosDiferentes } from './tamanhos-diferentes';
import { alertasZonaSeguranca } from './zona-seguranca';
import type { Alerta, ConfigAlertas, Gravidade } from './tipos';

/** O que a app já verifica e o que falta. O painel mostra isto, para "sem alertas" não enganar. */
export const VERIFICACOES = {
  ativas: ['tamanho das páginas', 'sangria', 'RGB', 'resolução', 'linhas finas', 'preto', 'spots duplicadas', 'zona de segurança', 'marcas de corte', 'QR codes', 'fontes'],
  porFazer: ['overprint'],
} as const;

const ORDEM: Record<Gravidade, number> = { erro: 0, aviso: 1, info: 2 };

/** Ordena por gravidade (erros primeiro). A ordem entre iguais é estável. */
export function ordenarAlertas(alertas: Alerta[]): Alerta[] {
  return alertas
    .map((a, i) => ({ a, i }))
    .sort((x, y) => ORDEM[x.a.gravidade] - ORDEM[y.a.gravidade] || x.i - y.i)
    .map((x) => x.a);
}

/** Corre todos os alertas que saem da análise do PDF. (Os dos QR codes vêm de fora: leem-se das páginas renderizadas.) */
export function calcularAlertas(analise: AnaliseDocumento, cfg: ConfigAlertas): Alerta[] {
  return ordenarAlertas([
    ...alertaTamanhosDiferentes(analise.paginas.map((p) => p.info), cfg.toleranciaFormatoMm),
    ...alertasSangria(analise, cfg),
    ...alertasRgb(analise),
    ...alertasResolucao(analise, cfg),
    ...alertasLinhasFinas(analise, cfg),
    ...alertasPreto(analise, cfg),
    ...alertasSpotsDuplicadas(analise),
    ...alertasZonaSeguranca(analise, cfg),
    ...alertasMarcasCorte(analise, cfg),
    ...alertasFontes(analise),
  ]);
}
