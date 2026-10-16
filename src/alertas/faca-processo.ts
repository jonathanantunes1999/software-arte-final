import type { AnaliseDocumento } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import { ehSpotTecnica } from '../analise/cores';
import type { Cor } from '../analise/ir';
import { pinturas } from './comum';
import type { Alerta, ConfigAlertas, Local } from './tipos';

const ESPESSURA_MAX_PT = 1.5;
/** O desenho de uma faca ocupa uma boa parte da página */
const COBERTURA_MIN = 0.5;
const MIN_TRACOS = 3;
const LIMITE_LOCAIS = 400;

/** Uma só tinta de processo a 100% (C, M ou Y) e as outras a 0 */
function tintaUnica(c: Cor | undefined): string | null {
  if (!c || c.familia !== 'CMYK' || c.valores.length !== 4) return null;
  const [C, M, Y, K] = c.valores;
  if (K > 0.01) return null;
  const nomes: [string, number][] = [['ciano', C], ['magenta', M], ['amarelo', Y]];
  const cheios = nomes.filter(([, v]) => v >= 0.99);
  const resto = nomes.filter(([, v]) => v > 0.01 && v < 0.99);
  return cheios.length === 1 && resto.length === 0 && nomes.filter(([, v]) => v > 0.01).length === 1 ? cheios[0][0] : null;
}

/**
 * Faca em cor de processo: traços finos numa só tinta (o magenta 100% das facas desenhadas à pressa)
 * a desenhar um contorno grande, e nenhuma spot técnica no ficheiro. Um traço de processo vai para
 * as chapas de cor e não para a faca. É uma suspeita, por isso só é informação.
 */
export function alertasFacaEmProcesso(analise: AnaliseDocumento, cfg: ConfigAlertas): Alerta[] {
  for (const pg of analise.paginas) for (const e of pg.ir.eventos) if (pinturas(e).some((c) => ehSpotTecnica(c, cfg.spotsTecnicas))) return [];

  const locais: Local[] = [];
  const porTinta = new Map<string, number>();
  for (const pg of analise.paginas) {
    const areaPagina = (pg.info.trim.x1 - pg.info.trim.x0) * (pg.info.trim.y1 - pg.info.trim.y0);
    const porCor = new Map<string, Caixa[]>();
    for (const e of pg.ir.eventos) {
      if (e.tipo !== 'forma' || !e.traca || e.preenche) continue;
      const t = tintaUnica(e.corTraco);
      if (!t || (e.espessuraTraco ?? 0) > ESPESSURA_MAX_PT) continue;
      (porCor.get(t) ?? porCor.set(t, []).get(t)!).push(e.bbox);
    }
    for (const [tinta, caixas] of porCor) {
      if (caixas.length < MIN_TRACOS) continue;
      const u: Caixa = {
        x0: Math.min(...caixas.map((c) => c.x0)),
        y0: Math.min(...caixas.map((c) => c.y0)),
        x1: Math.max(...caixas.map((c) => c.x1)),
        y1: Math.max(...caixas.map((c) => c.y1)),
      };
      if ((u.x1 - u.x0) * (u.y1 - u.y0) < COBERTURA_MIN * areaPagina) continue;
      porTinta.set(tinta, (porTinta.get(tinta) ?? 0) + caixas.length);
      locais.push({ pagina: pg.info.indice, caixa: u });
    }
  }
  if (!locais.length) return [];

  const resumo = [...porTinta].map(([t, n]) => `${n} traços finos em ${t} 100%`).join(', ');
  return [
    {
      id: 'faca-em-processo',
      gravidade: 'info',
      titulo: 'Possível faca em cor de processo',
      detalhe: `${resumo}, a desenhar um contorno grande, e o ficheiro não tem nenhuma spot de faca ou vincos. Se for a faca, converte-a em spot (painel Correções → Cor de processo → spot).`,
      locais: locais.slice(0, LIMITE_LOCAIS),
    },
  ];
}
