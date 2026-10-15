import type { AnaliseDocumento } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import { ptParaMm } from '../comum/unidades';
import { formatarMm } from '../comum/unidades';
import type { Alerta, ConfigAlertas, Local } from './tipos';

const LIMITE_LINHAS = 6;
/** Diferença entre ppi horizontal e vertical a partir da qual se diz que a imagem está esticada */
const ESTICADA = 1.15;

interface ImagemBaixa {
  pagina: number;
  ppi: number;
  ppiX: number;
  ppiY: number;
  larguraPx: number;
  alturaPx: number;
  larguraMm: number;
  alturaMm: number;
  caixa: Caixa;
}

function interseta(a: Caixa, b: Caixa): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function descreverPpi(i: ImagemBaixa): string {
  const x = Math.round(i.ppiX);
  const y = Math.round(i.ppiY);
  return Math.max(i.ppiX, i.ppiY) / Math.min(i.ppiX, i.ppiY) > ESTICADA ? `${x}×${y} ppi, esticada` : `${Math.round(i.ppi)} ppi`;
}

function linhas(imagens: ImagemBaixa[]): string[] {
  const ordenadas = [...imagens].sort((a, b) => a.ppi - b.ppi || a.pagina - b.pagina);
  const todas = ordenadas.map(
    (i) => `Pág. ${i.pagina + 1}: ${descreverPpi(i)} (${i.larguraPx}×${i.alturaPx} px a ${formatarMm(i.larguraMm)} × ${formatarMm(i.alturaMm)} mm)`,
  );
  return todas.length > LIMITE_LINHAS ? [...todas.slice(0, LIMITE_LINHAS), `…e mais ${todas.length - LIMITE_LINHAS}`] : todas;
}

/**
 * Resolução efetiva das imagens, pelo tamanho a que estão colocadas (e não pelo tamanho
 * "nominal" do ficheiro). Abaixo do limite de aviso e do de erro, ambos configuráveis.
 */
export function alertasResolucao(analise: AnaliseDocumento, cfg: ConfigAlertas): Alerta[] {
  const aviso = cfg.resolucaoAvisoPpi;
  // um limite de erro acima do de aviso não faz sentido: o erro nunca passa do aviso
  const erro = Math.min(cfg.resolucaoErroPpi, aviso);

  const baixas: ImagemBaixa[] = [];
  for (const pg of analise.paginas) {
    for (const e of pg.ir.eventos) {
      const im = e.imagem;
      if (e.tipo !== 'imagem' || !im) continue;
      if (!(im.ppiX > 0) || !(im.ppiY > 0) || !Number.isFinite(im.ppiX + im.ppiY)) continue;
      // o que está todo fora da área de produção não se imprime
      if (!interseta(e.bbox, pg.info.producao)) continue;

      const ppi = Math.min(im.ppiX, im.ppiY);
      // compara-se ao valor mostrado: 299,97 ppi diz-se 300 e não é problema
      if (Math.round(ppi) >= aviso) continue;
      baixas.push({
        pagina: pg.info.indice,
        ppi,
        ppiX: im.ppiX,
        ppiY: im.ppiY,
        larguraPx: im.larguraPx,
        alturaPx: im.alturaPx,
        larguraMm: ptParaMm(im.larguraPt),
        alturaMm: ptParaMm(im.alturaPt),
        caixa: e.bbox,
      });
    }
  }

  const graves = baixas.filter((i) => Math.round(i.ppi) < erro);
  const medias = baixas.filter((i) => Math.round(i.ppi) >= erro);
  const locais = (l: ImagemBaixa[]): Local[] => l.map((i) => ({ pagina: i.pagina, caixa: i.caixa })).sort((a, b) => a.pagina - b.pagina);

  const alertas: Alerta[] = [];
  if (graves.length) {
    alertas.push({
      id: 'resolucao-baixa',
      gravidade: 'erro',
      titulo: graves.length === 1 ? 'Imagem com resolução muito baixa' : `${graves.length} imagens com resolução muito baixa`,
      detalhe: [`Abaixo de ${erro} ppi à escala a que estão colocadas. Vão ver-se pixelizadas.`, ...linhas(graves)].join('\n'),
      locais: locais(graves),
    });
  }
  if (medias.length) {
    alertas.push({
      id: 'resolucao-media',
      gravidade: 'aviso',
      titulo: medias.length === 1 ? `Imagem abaixo de ${aviso} ppi` : `${medias.length} imagens abaixo de ${aviso} ppi`,
      detalhe: [`Pode notar-se perda de definição. Resolução à escala a que estão colocadas.`, ...linhas(medias)].join('\n'),
      locais: locais(medias),
    });
  }
  return alertas;
}
