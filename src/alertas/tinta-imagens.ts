import { PDFRef } from 'pdf-lib';
import type { AnaliseDocumento, ContextoInspecao } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import { formatarPaginas } from '../analise/resumo';
import { mmParaPt } from '../comum/unidades';
import { separarImagem } from '../separacoes/imagens';
import { PLACAS_PROCESSO } from '../separacoes/placas';
import { agruparCaixas } from './geometria';
import type { Alerta, ConfigAlertas, Local } from './tipos';

const FOLGA_MANCHA_MM = 5;
const LIMITE_LOCAIS = 400;

/** Tinta total máxima (em %) de cada imagem CMYK, pelo id do objeto. null = não se conseguiu ler. */
export type TintaPorImagem = Map<string, number | null>;

/** Descodifica as imagens CMYK e mede o pixel com mais tinta. Custa tempo: corre-se uma vez por ficheiro. */
export function medirTintaDasImagens(c: ContextoInspecao, analise: AnaliseDocumento): TintaPorImagem {
  const r: TintaPorImagem = new Map();
  for (const pg of analise.paginas) {
    for (const e of pg.ir.eventos) {
      const i = e.imagem;
      if (e.tipo !== 'imagem' || !i?.id || i.espacoCor !== 'CMYK' || r.has(i.id)) continue;
      const m = i.id.match(/^(\d+) (\d+) R$/);
      const xo = m ? c.l.stream(PDFRef.of(parseInt(m[1], 10), parseInt(m[2], 10))) : undefined;
      if (!xo) {
        r.set(i.id, null);
        continue;
      }
      const res = separarImagem(c.l, xo, undefined, PLACAS_PROCESSO);
      if (!('ok' in res)) {
        r.set(i.id, null);
        continue;
      }
      const planos = ['C', 'M', 'Y', 'K'].map((k) => res.ok.planos.get(k));
      let maximo = 0;
      const n = res.ok.largura * res.ok.altura;
      for (let p = 0; p < n; p++) {
        let soma = 0;
        for (const pl of planos) if (pl) soma += pl[p];
        if (soma > maximo) maximo = soma;
      }
      r.set(i.id, Math.round((maximo / 255) * 1000) / 10);
    }
  }
  return r;
}

export function alertasTintaImagens(analise: AnaliseDocumento, medidas: TintaPorImagem, cfg: ConfigAlertas): Alerta[] {
  const limite = cfg.tintaTotalMaxPercent;
  if (!(limite > 0)) return [];
  const locais: Local[] = [];
  const paginas = new Set<number>();
  let n = 0;
  let maximo = 0;
  const ids = new Set<string>();
  for (const pg of analise.paginas) {
    const caixas: Caixa[] = [];
    for (const e of pg.ir.eventos) {
      const t = e.tipo === 'imagem' && e.imagem?.id ? medidas.get(e.imagem.id) : null;
      if (t == null || t <= limite) continue;
      n++;
      maximo = Math.max(maximo, t);
      ids.add(e.imagem!.id!);
      paginas.add(pg.info.indice);
      caixas.push(e.bbox);
    }
    for (const caixa of agruparCaixas(caixas, mmParaPt(FOLGA_MANCHA_MM))) locais.push({ pagina: pg.info.indice, caixa });
  }
  if (!n) return [];
  return [
    {
      id: 'tinta-total-imagens',
      gravidade: maximo >= limite + 100 ? 'erro' : 'aviso',
      titulo: 'Imagens com tinta a mais',
      detalhe: [
        `${ids.size} ${ids.size === 1 ? 'imagem CMYK passa' : 'imagens CMYK passam'} de ${limite.toString().replace('.', ',')}% de tinta total, até ${maximo.toString().replace('.', ',')}%. Reconverte-as com um perfil que limite a tinta total.`,
        `Páginas: ${formatarPaginas([...paginas], 6)}`,
      ].join('\n'),
      locais: locais.slice(0, LIMITE_LOCAIS),
    },
  ];
}
