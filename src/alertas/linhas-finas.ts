import type { AnaliseDocumento } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import { descreverCor, ehRegisto, ehSpotTecnica, semTinta } from '../analise/cores';
import type { Cor } from '../analise/ir';
import { formatarPaginas } from '../analise/resumo';
import { mmParaPt } from '../comum/unidades';
import { agruparCaixas } from './geometria';
import type { Alerta, ConfigAlertas, Local } from './tipos';

const FOLGA_MANCHA_MM = 5;
const LIMITE_LOCAIS = 400;
const LIMITE_LINHAS = 5;

const pt2 = (v: number) => (v === 0 ? '0 pt' : `${(Math.round(v * 100) / 100).toFixed(2).replace('.', ',')} pt`);
const milesimos = (v: number) => Math.round(v * 1000);

function interseta(a: Caixa, b: Caixa): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/** Faca, vincos, registo e tintas a 0%: linhas finas são o normal ou nem se imprimem. */
function dispensa(c: Cor, tecnicas: string[]): boolean {
  return ehSpotTecnica(c, tecnicas) || ehRegisto(c) || ((c.familia === 'Separation' || c.familia === 'DeviceN') && semTinta(c));
}

/**
 * Traços mais finos que o limite (0,25 pt por omissão). Espessura 0 conta: é "a mais fina que o
 * dispositivo consegue", e numa filmadora de 2400 dpi não se vê. Não conta o que está fora da área
 * de produção (marcas de corte) nem as spots técnicas.
 */
export function alertasLinhasFinas(analise: AnaliseDocumento, cfg: ConfigAlertas): Alerta[] {
  const limite = milesimos(cfg.linhaMinimaPt);
  const grupos = new Map<string, { espessura: number; cor: string; n: number; paginas: Set<number> }>();
  const locais: Local[] = [];
  let total = 0;

  for (const pg of analise.paginas) {
    const manchas: Caixa[] = [];
    for (const e of pg.ir.eventos) {
      if (!e.traca || e.espessuraTraco === undefined || !e.corTraco) continue;
      if (e.tipo === 'texto' && e.texto?.invisivel) continue;
      if (milesimos(e.espessuraTraco) >= limite) continue;
      if (dispensa(e.corTraco, cfg.spotsTecnicas)) continue;
      if (!interseta(e.bbox, pg.info.producao)) continue;

      total++;
      const cor = descreverCor(e.corTraco);
      const chave = `${Math.round(e.espessuraTraco * 100)}|${cor}`;
      const g = grupos.get(chave) ?? grupos.set(chave, { espessura: e.espessuraTraco, cor, n: 0, paginas: new Set() }).get(chave)!;
      g.n++;
      g.paginas.add(pg.info.indice);
      manchas.push(e.bbox);
    }
    for (const caixa of agruparCaixas(manchas, mmParaPt(FOLGA_MANCHA_MM))) locais.push({ pagina: pg.info.indice, caixa });
  }
  if (!total) return [];

  const todas = [...grupos.values()]
    .sort((a, b) => b.n - a.n)
    .map((g) => `${pt2(g.espessura)}${g.cor ? ` em ${g.cor}` : ''}: ${g.n} ${g.n === 1 ? 'traço' : 'traços'} (${formatarPaginas([...g.paginas], 6)})`);
  const linhas = todas.length > LIMITE_LINHAS ? [...todas.slice(0, LIMITE_LINHAS), `…e mais ${todas.length - LIMITE_LINHAS}`] : todas;

  return [
    {
      id: 'linhas-finas',
      gravidade: 'aviso',
      titulo: `Linhas mais finas que ${pt2(cfg.linhaMinimaPt)}`,
      detalhe: [`Abaixo disto podem falhar na impressão ou desaparecer.`, ...linhas].join('\n'),
      locais: locais.sort((a, b) => a.pagina - b.pagina).slice(0, LIMITE_LOCAIS),
    },
  ];
}
