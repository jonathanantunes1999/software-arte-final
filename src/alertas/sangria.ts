import type { AnaliseDocumento, PaginaAnalise } from '../analise/analisador';
import { ladosVisiveis, type Caixa } from '../analise/caixas';
import { descreverCor, ehBranco, ehRegisto, ehSpotTecnica } from '../analise/cores';
import type { Cor, EventoDesenho } from '../analise/ir';
import { formatarPaginas } from '../analise/resumo';
import { formatarMm, mmParaPt, ptParaMm } from '../comum/unidades';
import type { Alerta, ConfigAlertas, Local } from './tipos';

/** Um objeto "toca" no corte se chega a menos disto da linha de corte (ou a passa) */
const TOLERANCIA_TOQUE_MM = 0.2;
/**
 * Menos que isto de excesso conta como "sem sangria" (e não como "sangria curta").
 * Fica acima da tolerância de toque para que um filete centrado no corte (meia espessura
 * de excesso) não se parta entre os dois alertas por diferenças de arredondamento.
 */
const SEM_SANGRIA_MM = 0.3;
/** Largura da faixa destacada em redor da linha de corte, de cada lado */
const FAIXA_DESTAQUE_MM = 4;

type LadoU = 'esq' | 'dir' | 'baixo' | 'cima';
const LADOS: LadoU[] = ['esq', 'dir', 'baixo', 'cima'];
const NOME_LADO = { esquerda: 'esquerda', direita: 'direita', cima: 'em cima', baixo: 'em baixo' } as const;
const arred1 = (v: number) => Math.round(v * 10) / 10;

interface ProblemaLado {
  /** Menor excesso (mm) entre os objetos que tocam este lado */
  minimoMm: number;
  /** Caixa que cobre os objetos com problema, ao longo do corte */
  regiao: Caixa;
  /** Como se descreve o objeto com menos sangria: "traço CMYK 0/100/0/0, 1,0 pt" */
  culpado: string;
}

const pt1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');

function descreverObjeto(e: EventoDesenho): string {
  if (e.tipo === 'imagem') return 'imagem';
  if (e.tipo === 'shading') return 'degradé';
  const partes: string[] = [];
  if (e.preenche) partes.push(['preenchimento', descreverCor(e.cor)].filter(Boolean).join(' '));
  if (e.traca) partes.push(`traço ${[descreverCor(e.corTraco), `${pt1(e.espessuraTraco ?? 0)} pt`].filter(Boolean).join(', ')}`);
  return partes.join(' e ');
}

function pinturas(e: EventoDesenho): Cor[] {
  const c: Cor[] = [];
  if (e.preenche && e.cor) c.push(e.cor);
  if (e.traca && e.corTraco) c.push(e.corTraco);
  return c;
}

/** Objetos que não precisam de sangria: branco, faca/vincos/verniz, registo, texto. */
function dispensaSangria(e: EventoDesenho, tecnicas: string[]): boolean {
  if (e.tipo === 'texto') return true;
  const p = pinturas(e);
  if (p.length === 0) return false; // imagens e degradés
  if (p.every((c) => ehBranco(c))) return true;
  return p.some((c) => ehRegisto(c) || ehSpotTecnica(c, tecnicas));
}

function analisarPagina(pg: PaginaAnalise, cfg: ConfigAlertas): Partial<Record<LadoU, ProblemaLado>> {
  const { trim, producao } = pg.info;
  const tol = mmParaPt(TOLERANCIA_TOQUE_MM);
  const refMm = arred1(cfg.sangriaReferenciaMm);
  const out: Partial<Record<LadoU, ProblemaLado>> = {};

  for (const e of pg.ir.eventos) {
    if (dispensaSangria(e, cfg.spotsTecnicas)) continue;

    // Só conta o que existe em produção: o que passa da BleedBox (ou da CropBox, se não há BleedBox) é cortado
    const bb: Caixa = {
      x0: Math.max(e.bbox.x0, producao.x0),
      y0: Math.max(e.bbox.y0, producao.y0),
      x1: Math.min(e.bbox.x1, producao.x1),
      y1: Math.min(e.bbox.y1, producao.y1),
    };
    if (bb.x0 > bb.x1 || bb.y0 > bb.y1) continue;

    const sobreposicaoV = bb.y1 > trim.y0 && bb.y0 < trim.y1;
    const sobreposicaoH = bb.x1 > trim.x0 && bb.x0 < trim.x1;

    const toca: Record<LadoU, number | null> = {
      esq: sobreposicaoV && bb.x0 <= trim.x0 + tol && bb.x1 > trim.x0 + tol ? Math.max(0, trim.x0 - bb.x0) : null,
      dir: sobreposicaoV && bb.x1 >= trim.x1 - tol && bb.x0 < trim.x1 - tol ? Math.max(0, bb.x1 - trim.x1) : null,
      baixo: sobreposicaoH && bb.y0 <= trim.y0 + tol && bb.y1 > trim.y0 + tol ? Math.max(0, trim.y0 - bb.y0) : null,
      cima: sobreposicaoH && bb.y1 >= trim.y1 - tol && bb.y0 < trim.y1 - tol ? Math.max(0, bb.y1 - trim.y1) : null,
    };

    for (const lado of LADOS) {
      const sobra = toca[lado];
      if (sobra === null) continue;
      const sobraMm = ptParaMm(sobra);
      if (arred1(sobraMm) >= refMm) continue; // tem sangria que chegue

      const faixa = mmParaPt(FAIXA_DESTAQUE_MM);
      const ao = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
      const regiao: Caixa =
        lado === 'esq'
          ? { x0: trim.x0 - faixa, x1: trim.x0 + faixa, y0: ao(bb.y0, trim.y0, trim.y1), y1: ao(bb.y1, trim.y0, trim.y1) }
          : lado === 'dir'
            ? { x0: trim.x1 - faixa, x1: trim.x1 + faixa, y0: ao(bb.y0, trim.y0, trim.y1), y1: ao(bb.y1, trim.y0, trim.y1) }
            : lado === 'baixo'
              ? { y0: trim.y0 - faixa, y1: trim.y0 + faixa, x0: ao(bb.x0, trim.x0, trim.x1), x1: ao(bb.x1, trim.x0, trim.x1) }
              : { y0: trim.y1 - faixa, y1: trim.y1 + faixa, x0: ao(bb.x0, trim.x0, trim.x1), x1: ao(bb.x1, trim.x0, trim.x1) };

      const atual = out[lado];
      if (!atual) out[lado] = { minimoMm: sobraMm, regiao, culpado: descreverObjeto(e) };
      else {
        if (sobraMm < atual.minimoMm) atual.culpado = descreverObjeto(e);
        atual.minimoMm = Math.min(atual.minimoMm, sobraMm);
        atual.regiao = {
          x0: Math.min(atual.regiao.x0, regiao.x0),
          y0: Math.min(atual.regiao.y0, regiao.y0),
          x1: Math.max(atual.regiao.x1, regiao.x1),
          y1: Math.max(atual.regiao.y1, regiao.y1),
        };
      }
    }
  }
  return out;
}

const LIMITE_LINHAS = 6;

/** Sangria em falta ou curta, medida pelo conteúdo e não só pela BleedBox. */
export function alertasSangria(analise: AnaliseDocumento, cfg: ConfigAlertas): Alerta[] {
  const ausentes: Linha[] = [];
  const curtas: Linha[] = [];
  const locaisAusentes: Local[] = [];
  const locaisCurtas: Local[] = [];

  for (const pg of analise.paginas) {
    const problemas = analisarPagina(pg, cfg);
    const visiveis = ladosVisiveis(
      { esq: problemas.esq, dir: problemas.dir, baixo: problemas.baixo, cima: problemas.cima },
      pg.info.rotacao,
    );

    const semSangria: string[] = [];
    const curta: string[] = [];
    for (const lado of ['esquerda', 'direita', 'cima', 'baixo'] as const) {
      const p = visiveis[lado];
      if (!p) continue;
      if (p.minimoMm < SEM_SANGRIA_MM) semSangria.push(NOME_LADO[lado]);
      else curta.push(`${NOME_LADO[lado]} ${formatarMm(p.minimoMm)} mm`);
    }

    // um local por lado e por página, para o zoom ir direito ao sítio
    for (const lado of LADOS) {
      const p = problemas[lado];
      if (!p) continue;
      (p.minimoMm < SEM_SANGRIA_MM ? locaisAusentes : locaisCurtas).push({ pagina: pg.info.indice, caixa: p.regiao });
    }

    // quem é o culpado, sem repetir (pode ser o mesmo objeto em vários lados)
    const culpados = (curto: boolean) => [
      ...new Set(
        LADOS.map((l) => problemas[l])
          .filter((p): p is ProblemaLado => !!p && (p.minimoMm < SEM_SANGRIA_MM) === !curto)
          .map((p) => p.culpado),
      ),
    ];
    if (semSangria.length) ausentes.push({ pagina: pg.info.indice, texto: juntar(semSangria), culpados: culpados(false) });
    if (curta.length) curtas.push({ pagina: pg.info.indice, texto: curta.join(' · '), culpados: culpados(true) });
  }

  const alertas: Alerta[] = [];
  const ref = formatarMm(cfg.sangriaReferenciaMm);

  if (ausentes.length) {
    alertas.push({
      id: 'sangria-ausente',
      gravidade: 'erro',
      titulo: 'Sem sangria',
      detalhe: ['Há elementos a tocar no corte sem passarem dele.', ...linhas(ausentes)].join('\n'),
      locais: locaisAusentes,
    });
  }
  if (curtas.length) {
    alertas.push({
      id: 'sangria-curta',
      gravidade: 'aviso',
      titulo: `Sangria menor que ${ref} mm`,
      detalhe: ['A sangria que existe é menor que a de referência.', ...linhas(curtas)].join('\n'),
      locais: locaisCurtas,
    });
  }
  return alertas;
}

function juntar(lados: string[]): string {
  return lados.length === 1 ? lados[0] : `${lados.slice(0, -1).join(', ')} e ${lados[lados.length - 1]}`;
}

interface Linha {
  pagina: number;
  texto: string;
  culpados: string[];
}

/** Agrupa páginas com o mesmo texto: "Esquerda e cima: págs. 1, 3 (traço CMYK 0/100/0/0, 1,0 pt)" */
function linhas(itens: Linha[]): string[] {
  const grupos = new Map<string, number[]>();
  for (const i of itens) {
    const chave = `${i.texto}\u0000${i.culpados.slice(0, 2).join('; ')}${i.culpados.length > 2 ? '; …' : ''}`;
    (grupos.get(chave) ?? grupos.set(chave, []).get(chave)!).push(i.pagina);
  }
  const todas = [...grupos].map(([chave, paginas]) => {
    const [texto, culpados] = chave.split('\u0000');
    return `${texto[0].toUpperCase()}${texto.slice(1)}: ${formatarPaginas(paginas, 6)}${culpados ? ` (${culpados})` : ''}`;
  });
  return todas.length > LIMITE_LINHAS ? [...todas.slice(0, LIMITE_LINHAS), `…e mais ${todas.length - LIMITE_LINHAS} combinações`] : todas;
}
