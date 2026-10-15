import type { AnaliseDocumento, PaginaAnalise } from '../analise/analisador';
import { ladosVisiveis, normalizarRotacao, type Caixa } from '../analise/caixas';
import { descreverCor, ehRegisto, semTinta } from '../analise/cores';
import type { Cor } from '../analise/ir';
import { formatarPaginas } from '../analise/resumo';
import { formatarMm, mmParaPt, ptParaMm } from '../comum/unidades';
import type { Alerta, ConfigAlertas, Local } from './tipos';

/** Dentro disto, a marca está alinhada com a aresta do corte */
const TOLERANCIA_ALINHAMENTO_MM = 0.35;
/** Até aqui ainda se reconhece como a marca daquele canto, mas dita "desalinhada" */
const ALCANCE_ALINHAMENTO_MM = 2;
const COMPRIMENTO_MIN_MM = 1.5;
const COMPRIMENTO_MAX_MM = 30;
const ESPESSURA_MAX_PT = 2;
/** Marcas a mais que isto do corte já não se contam como as do canto */
const DISTANCIA_MAX_MM = 40;
const FOLGA_MM = 0.3;
/** Espaço que tem de sobrar, além da sangria, para caber uma marca */
const ESPACO_MINIMO_MM = 2;
/** Lado do quadrado destacado num canto onde falta a marca */
const AREA_CANTO_MM = 12;
const EIXO_RETO_MM = 0.05;
const LIMITE_LINHAS = 6;
const LIMITE_LOCAIS = 400;

type LadoH = 'esq' | 'dir';
type LadoV = 'baixo' | 'cima';
type Eixo = 'h' | 'v';
type Segmento = [number, number, number, number];

interface Candidata {
  desalinhamentoMm: number;
  /** Distância da ponta mais próxima ao corte. Negativa: entra no corte. */
  folgaMm: number;
  cor: Cor;
  caixa: Caixa;
}

interface Slot {
  h: LadoH;
  v: LadoV;
  eixo: Eixo;
  candidata?: Candidata;
  motivos: string[];
}

const CANTOS: { h: LadoH; v: LadoV }[] = [
  { h: 'esq', v: 'cima' },
  { h: 'dir', v: 'cima' },
  { h: 'esq', v: 'baixo' },
  { h: 'dir', v: 'baixo' },
];

/** "canto superior esquerdo", tal como se vê no ecrã, mesmo com a página rodada */
function nomeCanto(h: LadoH, v: LadoV, rotacao: number): string {
  const visto = ladosVisiveis({ esq: 'esq', dir: 'dir', baixo: 'baixo', cima: 'cima' }, rotacao);
  const ondeFica = (lado: string) => (Object.entries(visto).find(([, u]) => u === lado) ?? ['?'])[0];
  const a = ondeFica(h);
  const b = ondeFica(v);
  const vertical = [a, b].find((k) => k === 'cima' || k === 'baixo');
  const horizontal = [a, b].find((k) => k === 'esquerda' || k === 'direita');
  return `canto ${vertical === 'cima' ? 'superior' : 'inferior'} ${horizontal === 'esquerda' ? 'esquerdo' : 'direito'}`;
}

function nomeEixo(eixo: Eixo, rotacao: number): string {
  const roda = normalizarRotacao(rotacao) % 180 !== 0;
  return (eixo === 'h') !== roda ? 'horizontal' : 'vertical';
}

function segmentosDaPagina(pg: PaginaAnalise): { seg: Segmento; cor: Cor }[] {
  const out: { seg: Segmento; cor: Cor }[] = [];
  for (const e of pg.ir.eventos) {
    if (!e.traca || !e.segmentos || !e.corTraco) continue;
    if ((e.espessuraTraco ?? 0) > ESPESSURA_MAX_PT) continue;
    if (semTinta(e.corTraco)) continue; // uma marca a 0% não se imprime
    for (const seg of e.segmentos) out.push({ seg, cor: e.corTraco });
  }
  return out;
}

/** Sangria do lado em questão: a da BleedBox se existe, senão a de referência. */
function sangriaDoLado(pg: PaginaAnalise, lado: LadoH | LadoV, cfg: ConfigAlertas): number {
  if (pg.info.origemSangria !== 'BleedBox') return cfg.sangriaReferenciaMm;
  const { trim, producao } = pg.info;
  const margem =
    lado === 'esq' ? trim.x0 - producao.x0 : lado === 'dir' ? producao.x1 - trim.x1 : lado === 'baixo' ? trim.y0 - producao.y0 : producao.y1 - trim.y1;
  return Math.max(cfg.sangriaReferenciaMm, ptParaMm(margem));
}

function procurar(pg: PaginaAnalise, h: LadoH, v: LadoV, eixo: Eixo, linhas: { seg: Segmento; cor: Cor }[], cfg: ConfigAlertas): Slot {
  const { trim } = pg.info;
  const cx = h === 'esq' ? trim.x0 : trim.x1;
  const cy = v === 'baixo' ? trim.y0 : trim.y1;
  const reto = mmParaPt(EIXO_RETO_MM);
  const alcance = mmParaPt(ALCANCE_ALINHAMENTO_MM);
  const ladoDoEixo = eixo === 'h' ? h : v;
  const minimo = sangriaDoLado(pg, ladoDoEixo, cfg);

  let melhor: { c: Candidata; motivos: string[] } | undefined;

  for (const { seg, cor } of linhas) {
    const [x0, y0, x1, y1] = seg;
    let desal: number;
    let fora: number; // distância da ponta mais próxima ao corte, em pt (negativa se entra)
    let comprimento: number;

    if (eixo === 'h') {
      if (Math.abs(y1 - y0) > reto) continue;
      const xa = Math.min(x0, x1);
      const xb = Math.max(x0, x1);
      desal = Math.abs(y0 - cy);
      if (h === 'esq' ? (xa + xb) / 2 >= trim.x0 : (xa + xb) / 2 <= trim.x1) continue; // tem de ficar do lado de fora
      fora = h === 'esq' ? trim.x0 - xb : xa - trim.x1;
      comprimento = xb - xa;
    } else {
      if (Math.abs(x1 - x0) > reto) continue;
      const ya = Math.min(y0, y1);
      const yb = Math.max(y0, y1);
      desal = Math.abs(x0 - cx);
      if (v === 'baixo' ? (ya + yb) / 2 >= trim.y0 : (ya + yb) / 2 <= trim.y1) continue;
      fora = v === 'baixo' ? trim.y0 - yb : ya - trim.y1;
      comprimento = yb - ya;
    }

    const compMm = ptParaMm(comprimento);
    if (desal > alcance || compMm < COMPRIMENTO_MIN_MM || compMm > COMPRIMENTO_MAX_MM || ptParaMm(fora) > DISTANCIA_MAX_MM) continue;

    const desalMm = ptParaMm(desal);
    const folgaMm = ptParaMm(fora);
    const motivos: string[] = [];
    if (desalMm > TOLERANCIA_ALINHAMENTO_MM) motivos.push(`desalinhada ${formatarMm(desalMm)} mm do corte`);
    if (folgaMm < -FOLGA_MM) motivos.push(`entra ${formatarMm(-folgaMm)} mm no corte`);
    else if (folgaMm < minimo - FOLGA_MM) motivos.push(`a ${formatarMm(Math.max(0, folgaMm))} mm do corte, dentro da sangria (${formatarMm(minimo)} mm)`);
    if (!ehRegisto(cor)) motivos.push(`em ${descreverCor(cor) || 'cor de processo'}, devia ser cor de registo`);

    const caixa: Caixa = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
    const c: Candidata = { desalinhamentoMm: desalMm, folgaMm, cor, caixa };
    // a melhor é a que tem menos defeitos; em empate, a mais afastada do corte
    if (!melhor || motivos.length < melhor.motivos.length || (motivos.length === melhor.motivos.length && folgaMm > melhor.c.folgaMm)) {
      melhor = { c, motivos };
    }
  }

  return { h, v, eixo, candidata: melhor?.c, motivos: melhor?.motivos ?? [] };
}

/** A página tem espaço, além da sangria, para as marcas nos quatro lados? */
function temEspaco(pg: PaginaAnalise, cfg: ConfigAlertas): boolean {
  const { trim, media } = pg.info;
  const sobra = (lado: LadoH | LadoV, margem: number) => ptParaMm(margem) >= sangriaDoLado(pg, lado, cfg) + ESPACO_MINIMO_MM;
  return sobra('esq', trim.x0 - media.x0) && sobra('dir', media.x1 - trim.x1) && sobra('baixo', trim.y0 - media.y0) && sobra('cima', media.y1 - trim.y1);
}

function caixaDoCanto(pg: PaginaAnalise, h: LadoH, v: LadoV): Caixa {
  const { trim } = pg.info;
  const a = mmParaPt(AREA_CANTO_MM);
  const x = h === 'esq' ? trim.x0 : trim.x1;
  const y = v === 'baixo' ? trim.y0 : trim.y1;
  return { x0: h === 'esq' ? x - a : x - mmParaPt(1), x1: h === 'esq' ? x + mmParaPt(1) : x + a, y0: v === 'baixo' ? y - a : y - mmParaPt(1), y1: v === 'baixo' ? y + mmParaPt(1) : y + a };
}

function agrupar(itens: { pagina: number; texto: string }[]): string[] {
  const grupos = new Map<string, number[]>();
  for (const i of itens) (grupos.get(i.texto) ?? grupos.set(i.texto, []).get(i.texto)!).push(i.pagina);
  const todas = [...grupos].map(([t, p]) => `${t}: ${formatarPaginas(p, 6)}`);
  return todas.length > LIMITE_LINHAS ? [...todas.slice(0, LIMITE_LINHAS), `…e mais ${todas.length - LIMITE_LINHAS}`] : todas;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Marcas de corte: duas por canto (uma horizontal e uma vertical), linhas curtas alinhadas com o
 * corte, do lado de fora, fora da sangria e em cor de registo. Reconhece traços retos finos; marcas
 * desenhadas como retângulos preenchidos ou na diagonal não são lidas.
 */
export function alertasMarcasCorte(analise: AnaliseDocumento, cfg: ConfigAlertas): Alerta[] {
  if (!cfg.verificarMarcasCorte) return [];

  const ausentes: number[] = [];
  const semEspaco: number[] = [];
  const locaisAusentes: Local[] = [];
  const locaisSemEspaco: Local[] = [];
  const faltas: { pagina: number; texto: string }[] = [];
  const malColocadas: { pagina: number; texto: string }[] = [];
  const locaisFaltas: Local[] = [];
  const locaisMal: Local[] = [];

  for (const pg of analise.paginas) {
    const linhas = segmentosDaPagina(pg);
    const slots: Slot[] = [];
    for (const { h, v } of CANTOS) for (const eixo of ['h', 'v'] as const) slots.push(procurar(pg, h, v, eixo, linhas, cfg));

    const encontradas = slots.filter((s) => s.candidata);
    const indice = pg.info.indice;

    if (!encontradas.length) {
      if (temEspaco(pg, cfg)) {
        ausentes.push(indice);
        locaisAusentes.push({ pagina: indice, caixa: pg.info.media });
      } else {
        semEspaco.push(indice);
        locaisSemEspaco.push({ pagina: indice, caixa: pg.info.media });
      }
      continue;
    }

    const em_falta = slots.filter((s) => !s.candidata);
    if (em_falta.length) {
      const nomes = em_falta.map((s) => `${nomeCanto(s.h, s.v, pg.info.rotacao)} (${nomeEixo(s.eixo, pg.info.rotacao)})`);
      faltas.push({ pagina: indice, texto: `Faltam: ${nomes.join(', ')}` });
      const vistos = new Set<string>();
      for (const s of em_falta) {
        const k = `${s.h}${s.v}`;
        if (!vistos.has(k)) {
          vistos.add(k);
          locaisFaltas.push({ pagina: indice, caixa: caixaDoCanto(pg, s.h, s.v) });
        }
      }
    }

    for (const s of encontradas.filter((x) => x.motivos.length)) {
      malColocadas.push({
        pagina: indice,
        texto: `${cap(nomeCanto(s.h, s.v, pg.info.rotacao))}, marca ${nomeEixo(s.eixo, pg.info.rotacao)}: ${s.motivos.join('; ')}`,
      });
      const p = mmParaPt(1);
      const c = s.candidata!.caixa;
      locaisMal.push({ pagina: indice, caixa: { x0: c.x0 - p, y0: c.y0 - p, x1: c.x1 + p, y1: c.y1 + p } });
    }
  }

  const alertas: Alerta[] = [];
  const ordena = (l: Local[]) => l.sort((a, b) => a.pagina - b.pagina).slice(0, LIMITE_LOCAIS);

  if (ausentes.length) {
    alertas.push({
      id: 'marcas-corte-ausentes',
      gravidade: 'aviso',
      titulo: 'Sem marcas de corte',
      detalhe: ['Não encontrei marcas de corte: linhas curtas em cor de registo, fora da sangria.', formatarPaginas(ausentes, 6)].join('\n'),
      locais: ordena(locaisAusentes),
    });
  }
  if (faltas.length) {
    alertas.push({
      id: 'marcas-corte-incompletas',
      gravidade: 'aviso',
      titulo: 'Marcas de corte incompletas',
      detalhe: ['Cada canto devia ter duas marcas, uma horizontal e uma vertical.', ...agrupar(faltas)].join('\n'),
      locais: ordena(locaisFaltas),
    });
  }
  if (malColocadas.length) {
    alertas.push({
      id: 'marcas-corte-mal-colocadas',
      gravidade: 'aviso',
      titulo: 'Marcas de corte mal colocadas',
      detalhe: ['As marcas devem ficar alinhadas com o corte, fora da sangria e em cor de registo.', ...agrupar(malColocadas)].join('\n'),
      locais: ordena(locaisMal),
    });
  }
  if (semEspaco.length) {
    alertas.push({
      id: 'marcas-corte-sem-espaco',
      gravidade: 'info',
      titulo: 'Sem espaço para marcas de corte',
      detalhe: ['A página não tem margem, além da sangria, para as marcas. Se a gráfica as pede, exporta com marcas.', formatarPaginas(semEspaco, 6)].join('\n'),
      locais: ordena(locaisSemEspaco),
    });
  }
  return alertas;
}
