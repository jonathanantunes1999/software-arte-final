import type { AnaliseDocumento } from '../analise/analisador';
import { alertasFontes } from './fontes';
import { alertasSangria } from './sangria';
import { alertaTamanhosDiferentes } from './tamanhos-diferentes';
import type { Alerta, ConfigAlertas, Gravidade } from './tipos';

const ORDEM: Record<Gravidade, number> = { erro: 0, aviso: 1, info: 2 };

/** Corre todos os alertas e ordena por gravidade (erros primeiro). A ordem entre iguais é estável. */
export function calcularAlertas(analise: AnaliseDocumento, cfg: ConfigAlertas): Alerta[] {
  const todos: Alerta[] = [
    ...alertaTamanhosDiferentes(analise.paginas.map((p) => p.info), cfg.toleranciaFormatoMm),
    ...alertasSangria(analise, cfg),
    ...alertasFontes(analise),
  ];
  return todos
    .map((a, i) => ({ a, i }))
    .sort((x, y) => ORDEM[x.a.gravidade] - ORDEM[y.a.gravidade] || x.i - y.i)
    .map((x) => x.a);
}
