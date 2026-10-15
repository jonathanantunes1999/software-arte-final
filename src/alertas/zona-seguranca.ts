import type { AnaliseDocumento } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import type { EventoDesenho } from '../analise/ir';
import { formatarPaginas } from '../analise/resumo';
import { formatarMm, mmParaPt, ptParaMm } from '../comum/unidades';
import { eBrancoOuTecnico } from './comum';
import { agruparCaixas } from './geometria';
import type { Alerta, ConfigAlertas, Local } from './tipos';

/** Um objeto "toca" no corte se chega a menos disto da linha (é fundo ou tem sangria) */
const TOLERANCIA_TOQUE_MM = 0.2;
/** Um painel que cobre pelo menos isto do corte conta como fundo */
const FRACAO_FUNDO = 0.9;
const FOLGA_MANCHA_MM = 5;
const LIMITE_LOCAIS = 400;

type Categoria = 'texto' | 'imagem' | 'grafico';
const ROTULO: Record<Categoria, string> = { texto: 'Texto', imagem: 'Imagens', grafico: 'Gráficos' };
const ORDEM: Categoria[] = ['texto', 'imagem', 'grafico'];

function area(c: Caixa): number {
  return Math.max(0, c.x1 - c.x0) * Math.max(0, c.y1 - c.y0);
}

function intersecao(a: Caixa, b: Caixa): Caixa | null {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  return x0 < x1 && y0 < y1 ? { x0, y0, x1, y1 } : null;
}

function categoria(e: EventoDesenho): Categoria {
  return e.tipo === 'texto' ? 'texto' : e.tipo === 'imagem' ? 'imagem' : 'grafico';
}

interface Grupo {
  n: number;
  /** Menor distância ao corte, em mm. Negativa: passa o corte. */
  maisPerto: number;
  paginas: Set<number>;
}

/**
 * Texto e elementos de arte demasiado perto do corte (3 mm por omissão), que podem ser cortados.
 *
 * O texto conta sempre, mesmo que passe o corte. Imagens e gráficos só contam se estiverem dentro
 * do corte sem lhe tocar: o que toca ou passa o corte é fundo ou tem sangria (assunto do alerta de
 * sangria), e um painel que cobre 90% ou mais do corte também é fundo. Não contam branco, faca,
 * registo, texto invisível, nem o que está fora do corte (marcas, legendas).
 */
export function alertasZonaSeguranca(analise: AnaliseDocumento, cfg: ConfigAlertas): Alerta[] {
  const margem = Math.round(cfg.zonaSegurancaMm * 10);
  const tol = mmParaPt(TOLERANCIA_TOQUE_MM);
  const grupos: Record<Categoria, Grupo> = {
    texto: { n: 0, maisPerto: Infinity, paginas: new Set() },
    imagem: { n: 0, maisPerto: Infinity, paginas: new Set() },
    grafico: { n: 0, maisPerto: Infinity, paginas: new Set() },
  };
  const locais: Local[] = [];

  for (const pg of analise.paginas) {
    const corte = pg.info.trim;
    const areaCorte = area(corte);
    if (areaCorte <= 0) continue;
    const manchas: Caixa[] = [];

    for (const e of pg.ir.eventos) {
      const eTexto = e.tipo === 'texto';
      if (e.tipo === 'shading') continue; // a caixa de um degradé é a do recorte, não a do degradé
      if (eTexto && (e.texto?.invisivel || (!e.preenche && !e.traca))) continue;
      if (!eTexto && eBrancoOuTecnico(e, cfg.spotsTecnicas)) continue;

      const dentro = intersecao(e.bbox, corte);
      if (!dentro) continue; // tudo fora do corte: não se vê

      const b = e.bbox;
      const distancia = Math.min(b.x0 - corte.x0, corte.x1 - b.x1, b.y0 - corte.y0, corte.y1 - b.y1);

      if (!eTexto) {
        if (distancia <= tol) continue; // toca ou passa o corte: fundo ou sangria
        if (area(dentro) / areaCorte >= FRACAO_FUNDO) continue; // painel que é o fundo
      }

      const mm = ptParaMm(distancia);
      if (Math.round(mm * 10) >= margem) continue;

      const g = grupos[categoria(e)];
      g.n++;
      g.maisPerto = Math.min(g.maisPerto, mm);
      g.paginas.add(pg.info.indice);
      manchas.push(dentro);
    }
    for (const caixa of agruparCaixas(manchas, mmParaPt(FOLGA_MANCHA_MM))) locais.push({ pagina: pg.info.indice, caixa });
  }

  const presentes = ORDEM.filter((c) => grupos[c].n > 0);
  if (!presentes.length) return [];

  const m = formatarMm(cfg.zonaSegurancaMm);
  const linhas = presentes.map((c) => {
    const g = grupos[c];
    const perto = g.maisPerto < 0 ? `o mais perto passa o corte ${formatarMm(-g.maisPerto)} mm` : `o mais perto a ${formatarMm(g.maisPerto)} mm`;
    return `${ROTULO[c]}: ${g.n} ${g.n === 1 ? 'elemento' : 'elementos'}, ${perto} (${formatarPaginas([...g.paginas], 6)})`;
  });

  return [
    {
      id: 'zona-seguranca',
      gravidade: 'aviso',
      titulo: `Elementos a menos de ${m} mm do corte`,
      detalhe: [`Texto e logótipos devem ficar a pelo menos ${m} mm do corte, senão podem ser cortados.`, ...linhas].join('\n'),
      locais: locais.sort((a, b) => a.pagina - b.pagina).slice(0, LIMITE_LOCAIS),
    },
  ];
}
