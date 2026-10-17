import { PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import { alertasSangria } from '../alertas/sangria';
import type { ConfigAlertas } from '../alertas/tipos';
import { analisarDocumento } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import { lerPaginas, NOME_FORM_SANGRIA } from '../analise/documento';
import { mmParaPt } from '../comum/unidades';
import { embrulharPagina } from './pdf-util';

/**
 * Sangria automática: onde a arte pára no corte, acrescenta-se uma faixa espelhada do que está
 * dentro. É o que se faz à mão no Illustrator quando não há arte original para estender.
 *
 * A página antiga passa a ser um Form XObject (a arte não é tocada). A página nova desenha, por
 * baixo, oito recortes espelhados (quatro lados e quatro cantos) e por cima a página original.
 * Onde a arte original já tinha sangria, é ela que se vê.
 */

export interface PedidoSangria {
  /** Sangria a gerar, em mm */
  mm: number;
}

export interface ResumoSangria {
  mm: number;
  /** Páginas onde se gerou sangria (0 = primeira) */
  geradas: number[];
}

const f = (n: number) => String(Math.round(n * 1000) / 1000);
const paraBytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);
const caixaArr = (pdf: PDFDocument, c: Caixa) => pdf.context.obj([c.x0, c.y0, c.x1, c.y1]);

/** Páginas onde o alerta de sangria diz que falta (ausente ou curta) */
export function paginasSemSangria(pdf: PDFDocument, cfg: ConfigAlertas): number[] {
  const analise = analisarDocumento(pdf, lerPaginas(pdf));
  const r = new Set<number>();
  for (const a of alertasSangria(analise, cfg)) {
    for (const l of a.locais ?? []) r.add(l.pagina);
    if (a.pagina !== undefined && !a.locais?.length) r.add(a.pagina);
  }
  return [...r].sort((a, b) => a - b);
}

/** Oito recortes à volta do corte, cada um com o espelho que lhe corresponde */
export function conteudoDeSangria(trim: Caixa, s: number, nomeForm: string): string {
  const eixo = (lo: number, hi: number, sinal: -1 | 0 | 1): { de: number; ate: number; escala: number; desloca: number } =>
    sinal === -1
      ? { de: lo - s, ate: lo, escala: -1, desloca: 2 * lo }
      : sinal === 1
        ? { de: hi, ate: hi + s, escala: -1, desloca: 2 * hi }
        : { de: lo, ate: hi, escala: 1, desloca: 0 };
  const partes: string[] = [];
  for (const sy of [-1, 0, 1] as const) {
    for (const sx of [-1, 0, 1] as const) {
      if (sx === 0 && sy === 0) continue;
      const x = eixo(trim.x0, trim.x1, sx);
      const y = eixo(trim.y0, trim.y1, sy);
      partes.push(`q ${f(x.de)} ${f(y.de)} ${f(x.ate - x.de)} ${f(y.ate - y.de)} re W n ${x.escala} 0 0 ${y.escala} ${f(x.desloca)} ${f(y.desloca)} cm /${nomeForm} Do Q`);
    }
  }
  partes.push(`/${nomeForm} Do`);
  return partes.join('\n');
}

const NOME_FORM = NOME_FORM_SANGRIA;

export function gerarSangria(pdf: PDFDocument, pedido: PedidoSangria, paginas: number[], usos: Map<string, number>): ResumoSangria {
  const resumo: ResumoSangria = { mm: pedido.mm, geradas: [] };
  const info = lerPaginas(pdf);
  const nos = pdf.getPages();

  for (const i of paginas) {
    const pi = info.paginas[i];
    const no = nos[i].node;
    if (!pi) continue;
    const unit = no.lookupMaybe(PDFName.of('UserUnit'), PDFNumber)?.asNumber() || 1;
    const s = mmParaPt(pedido.mm) / unit;
    const trim = pi.trim;
    const alvo: Caixa = { x0: trim.x0 - s, y0: trim.y0 - s, x1: trim.x1 + s, y1: trim.y1 + s };

    // conteúdo original → Form XObject (a área visível era a CropBox); a página nova só o desenha, com as faixas espelhadas por baixo
    embrulharPagina(pdf, no, pi.crop, NOME_FORM, (nome) => conteudoDeSangria(trim, s, nome), usos);

    // caixas: a arte passa a ir até ao corte + sangria
    const media = pi.media;
    const novaMedia: Caixa = { x0: Math.min(media.x0, alvo.x0), y0: Math.min(media.y0, alvo.y0), x1: Math.max(media.x1, alvo.x1), y1: Math.max(media.y1, alvo.y1) };
    const crop = pi.crop;
    // se a CropBox era a própria página (sem marcas à volta), acompanha-a; senão só cresce o que for preciso
    const novaCrop: Caixa = { x0: Math.min(crop.x0, alvo.x0), y0: Math.min(crop.y0, alvo.y0), x1: Math.max(crop.x1, alvo.x1), y1: Math.max(crop.y1, alvo.y1) };
    no.set(PDFName.of('MediaBox'), caixaArr(pdf, novaMedia));
    no.set(PDFName.of('CropBox'), caixaArr(pdf, novaCrop));
    no.set(PDFName.of('TrimBox'), caixaArr(pdf, trim));
    no.set(PDFName.of('BleedBox'), caixaArr(pdf, alvo));
    resumo.geradas.push(i);
  }
  return resumo;
}
