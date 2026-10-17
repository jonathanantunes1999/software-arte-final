import type { TipoCorrecao } from '../alertas/correcao-sugerida';
import type { PedidoCorrecoes } from '../correcoes/aplicar';
import type { ContextoAssistente } from './tipos';

export interface Construcao {
  /** O pedido pronto a aplicar (null se não há nada a fazer) */
  pedido: PedidoCorrecoes | null;
  /** O que vai ser feito, em frases curtas */
  descricao: string[];
  /** O que se pediu e não se fez, com a razão */
  naoFeito: { tipo: TipoCorrecao; motivo: string }[];
  /** Correção que só se resolve com uma escolha do utilizador: abre-se o painel já preparado */
  prepararPainel: TipoCorrecao | null;
  /** Avisos que não impedem nada mas convém dizer */
  notas: string[];
}

const n = (x: number, um: string, varios: string) => `${x} ${x === 1 ? um : varios}`;

/** As correções que não perdem nada (a edição do texto, por exemplo): é isto que "corrige tudo" faz */
export const TODAS_SEGURAS: TipoCorrecao[] = ['sangria', 'overprint-branco', 'overprint-preto', 'overprint-spots', 'juntar-spots', 'rgb-cmyk'];

/**
 * Traduz "corrige X" num pedido que o motor percebe, com as mesmas predefinições do painel Correções.
 * Só inclui o que há mesmo para corrigir neste ficheiro.
 */
export function construirPedido(alvos: TipoCorrecao[], c: ContextoAssistente, opcoes: { sangriaMm?: number } = {}): Construcao {
  const r: Construcao = { pedido: null, descricao: [], naoFeito: [], prepararPainel: null, notas: [] };
  const inv = c.inventario;
  if (!c.ficheiro || !inv) {
    for (const tipo of alvos) r.naoFeito.push({ tipo, motivo: c.ficheiro ? 'ainda estou a analisar o ficheiro' : 'não há nenhum ficheiro aberto' });
    return r;
  }
  const p: PedidoCorrecoes = { overprintBranco: false, overprintPreto: false, overprintSpots: false, renomear: [], converter: [] };
  let algo = false;
  const nao = (tipo: TipoCorrecao, motivo: string) => r.naoFeito.push({ tipo, motivo });

  for (const tipo of new Set(alvos)) {
    switch (tipo) {
      case 'sangria':
        if (c.paginasSemSangria > 0) {
          const mm = opcoes.sangriaMm ?? c.sangriaMm;
          p.sangria = { mm };
          r.descricao.push(`gerar ${mm} mm de sangria em ${n(c.paginasSemSangria, 'página', 'páginas')}`);
          algo = true;
        } else nao(tipo, 'o ficheiro já tem sangria');
        break;
      case 'marcas':
        // criar marcas pode aumentar a página: é uma escolha (tamanho, se pode crescer), por isso abre-se o painel já preparado
        if ((c.paginasSemMarcas ?? 0) > 0) {
          r.prepararPainel = 'marcas';
          nao(tipo, 'abri o painel das correções com as marcas preparadas: confirma o tamanho e se a página pode crescer');
        } else nao(tipo, 'todas as páginas já têm marcas de corte');
        break;
      case 'overprint-branco':
        if (inv.overprint.branco > 0) {
          p.overprintBranco = true;
          r.descricao.push(`desligar o overprint em ${n(inv.overprint.branco, 'branco', 'brancos')}`);
          algo = true;
        } else nao(tipo, 'não há brancos em overprint');
        break;
      case 'overprint-preto': {
        const k = inv.overprint.pretoTexto + inv.overprint.pretoLinha;
        if (k > 0) {
          p.overprintPreto = true;
          r.descricao.push(`ligar o overprint em ${n(k, 'preto', 'pretos')}`);
          algo = true;
        } else nao(tipo, 'não há pretos sem overprint');
        break;
      }
      case 'overprint-spots':
        if (inv.overprint.spotsTecnicas > 0) {
          p.overprintSpots = true;
          r.descricao.push(`ligar o overprint em ${n(inv.overprint.spotsTecnicas, 'spot técnica', 'spots técnicas')}`);
          algo = true;
        } else nao(tipo, 'não há spots técnicas sem overprint');
        break;
      case 'juntar-spots':
        if (inv.juncoes.length > 0) {
          p.renomear = inv.juncoes.map((j) => ({ de: j.de, para: j.para }));
          r.descricao.push(`juntar ${n(inv.juncoes.length, 'spot duplicada', 'spots duplicadas')} (${inv.juncoes.map((j) => `${j.de} → ${j.para}`).join(', ')})`);
          algo = true;
        } else nao(tipo, 'não há spots duplicadas');
        break;
      case 'faca-em-spot':
        if (inv.facas > 0) {
          r.prepararPainel = 'faca-em-spot';
          nao(tipo, 'preciso que me digas qual das cores é a faca');
        } else nao(tipo, 'não há cores de processo em traços');
        break;
      case 'curvas':
        if (inv.fontesConvertiveis.length > 0) {
          p.textoEmCurvas = { fontes: [...inv.fontesConvertiveis] };
          r.descricao.push(`passar o texto de ${n(inv.fontesConvertiveis.length, 'fonte', 'fontes')} a curvas`);
          algo = true;
        } else nao(tipo, inv.fontesNaoIncorporadas ? 'as fontes não vêm no ficheiro' : 'não há texto para converter');
        if (inv.fontesNaoIncorporadas > 0) {
          r.notas.push(c.desktop ? `${n(inv.fontesNaoIncorporadas, 'fonte não incorporada', 'fontes não incorporadas')}: para as desenhar com as instaladas no computador, escolhe-as no painel Correções.` : `${n(inv.fontesNaoIncorporadas, 'fonte não incorporada', 'fontes não incorporadas')} ficam como estão (na app desktop dá para as desenhar com as fontes instaladas).`);
        }
        break;
      case 'rgb-cmyk':
        if (inv.rgbVetores + inv.rgbImagens > 0) {
          p.rgbParaCmyk = { vetores: inv.rgbVetores > 0, imagens: inv.rgbImagens > 0 };
          r.descricao.push(`converter para CMYK ${[inv.rgbVetores ? n(inv.rgbVetores, 'cor de vetor', 'cores de vetores') : '', inv.rgbImagens ? n(inv.rgbImagens, 'imagem', 'imagens') : ''].filter(Boolean).join(' e ')}`);
          algo = true;
        } else nao(tipo, 'não há nada em RGB');
        break;
    }
  }
  r.pedido = algo ? p : null;
  return r;
}
