import type { AnaliseDocumento } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import { descreverCor, ehPretoChapado, ehPretoRico } from '../analise/cores';
import { formatarPaginas } from '../analise/resumo';
import { mmParaPt } from '../comum/unidades';
import { agruparCaixas } from './geometria';
import type { Alerta, ConfigAlertas, Local } from './tipos';

const FOLGA_MANCHA_MM = 5;
const LIMITE_LOCAIS = 400;
const LIMITE_LINHAS = 5;

const num1 = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');

function areaCaixa(c: Caixa): number {
  return Math.max(0, c.x1 - c.x0) * Math.max(0, c.y1 - c.y0);
}

function sobreposicao(a: Caixa, b: Caixa): Caixa | null {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  return x0 < x1 && y0 < y1 ? { x0, y0, x1, y1 } : null;
}

/** Texto pequeno em preto de quatro cores (desregista e desfoca). */
function pretoRicoEmTextoPequeno(analise: AnaliseDocumento, cfg: ConfigAlertas): Alerta[] {
  const limite = Math.round(cfg.textoPretoMaxPt * 10);
  const grupos = new Map<string, { cor: string; n: number; min: number; max: number; paginas: Set<number> }>();
  const locais: Local[] = [];
  let total = 0;

  for (const pg of analise.paginas) {
    const manchas: Caixa[] = [];
    for (const e of pg.ir.eventos) {
      if (e.tipo !== 'texto' || !e.texto || e.texto.invisivel || !e.preenche) continue;
      if (!ehPretoRico(e.cor)) continue;
      if (Math.round(e.texto.tamanho * 10) >= limite) continue;

      total++;
      const cor = descreverCor(e.cor);
      const g = grupos.get(cor) ?? grupos.set(cor, { cor, n: 0, min: Infinity, max: 0, paginas: new Set() }).get(cor)!;
      g.n++;
      g.min = Math.min(g.min, e.texto.tamanho);
      g.max = Math.max(g.max, e.texto.tamanho);
      g.paginas.add(pg.info.indice);
      manchas.push(e.bbox);
    }
    for (const caixa of agruparCaixas(manchas, mmParaPt(FOLGA_MANCHA_MM))) locais.push({ pagina: pg.info.indice, caixa });
  }
  if (!total) return [];

  const todas = [...grupos.values()]
    .sort((a, b) => b.n - a.n)
    .map((g) => {
      const corpo = Math.round(g.min * 10) === Math.round(g.max * 10) ? `${num1(g.min)} pt` : `${num1(g.min)}–${num1(g.max)} pt`;
      return `${g.cor}: ${g.n} ${g.n === 1 ? 'texto' : 'textos'} de ${corpo} (${formatarPaginas([...g.paginas], 6)})`;
    });
  const linhas = todas.length > LIMITE_LINHAS ? [...todas.slice(0, LIMITE_LINHAS), `…e mais ${todas.length - LIMITE_LINHAS}`] : todas;

  return [
    {
      id: 'preto-rico-texto-pequeno',
      gravidade: 'aviso',
      titulo: 'Texto pequeno em preto de quatro cores',
      detalhe: [`Abaixo de ${num1(cfg.textoPretoMaxPt)} pt, quatro tintas podem desregistar e o texto fica desfocado. Usa só K 100%.`, ...linhas].join('\n'),
      locais: locais.sort((a, b) => a.pagina - b.pagina).slice(0, LIMITE_LOCAIS),
    },
  ];
}

/** Fundos grandes só em K 100%, que ficam acinzentados. */
function fundoSoPreto(analise: AnaliseDocumento, cfg: ConfigAlertas): Alerta[] {
  const minimo = cfg.fundoPretoMinimoPercent;
  const linhas: { pagina: number; percentagem: number }[] = [];
  const locais: Local[] = [];

  for (const pg of analise.paginas) {
    const areaCorte = areaCaixa(pg.info.trim);
    if (areaCorte <= 0) continue;
    for (const e of pg.ir.eventos) {
      if (e.tipo !== 'forma' || !e.preenche || e.area === undefined || !ehPretoChapado(e.cor)) continue;
      // só conta a parte que cai dentro do corte
      const dentro = sobreposicao(e.bbox, pg.info.trim);
      const caixa = areaCaixa(e.bbox);
      if (!dentro || caixa <= 0) continue;
      const areaDentro = e.area * (areaCaixa(dentro) / caixa);
      const percentagem = (areaDentro / areaCorte) * 100;
      if (Math.round(percentagem) < minimo) continue;
      linhas.push({ pagina: pg.info.indice, percentagem });
      locais.push({ pagina: pg.info.indice, caixa: dentro });
    }
  }
  if (!linhas.length) return [];

  const todas = linhas.map((l) => `Pág. ${l.pagina + 1}: ${Math.round(l.percentagem)}% da página`);
  const mostradas = todas.length > LIMITE_LINHAS ? [...todas.slice(0, LIMITE_LINHAS), `…e mais ${todas.length - LIMITE_LINHAS}`] : todas;
  return [
    {
      id: 'fundo-preto-chapado',
      gravidade: 'aviso',
      titulo: 'Fundo grande só em preto (K 100%)',
      detalhe: ['Áreas grandes só com K ficam acinzentadas. Junta-lhe cor por baixo (preto rico).', ...mostradas].join('\n'),
      locais: locais.slice(0, LIMITE_LOCAIS),
    },
  ];
}

export function alertasPreto(analise: AnaliseDocumento, cfg: ConfigAlertas): Alerta[] {
  return [...pretoRicoEmTextoPequeno(analise, cfg), ...fundoSoPreto(analise, cfg)];
}
