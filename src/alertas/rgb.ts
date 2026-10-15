import type { AnaliseDocumento } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import { descreverCor, ehBranco } from '../analise/cores';
import type { Cor } from '../analise/ir';
import { formatarPaginas } from '../analise/resumo';
import { mmParaPt } from '../comum/unidades';
import { pinturas } from './comum';
import { agruparCaixas } from './geometria';
import type { Alerta, Local } from './tipos';

/** Objetos RGB a menos disto uns dos outros contam como a mesma mancha no destaque */
const FOLGA_MANCHA_MM = 5;
const LIMITE_LOCAIS = 400;
const LIMITE_CORES = 3;

type Categoria = 'imagem' | 'texto' | 'vetor';
const ROTULO: Record<Categoria, string> = { imagem: 'Imagens', texto: 'Texto', vetor: 'Vetores' };

/** RGB branco puro não faz mal a ninguém (converte para papel): não conta. */
function eRgbRelevante(c: Cor): boolean {
  return c.familia === 'RGB' && !ehBranco(c);
}

/**
 * Objetos em RGB: vetores, texto e imagens. Numa impressão em CMYK as cores mudam na
 * conversão (e o preto RGB vira um preto de quatro cores).
 */
export function alertasRgb(analise: AnaliseDocumento): Alerta[] {
  const paginas: Record<Categoria, Set<number>> = { imagem: new Set(), texto: new Set(), vetor: new Set() };
  const contagem: Record<Categoria, number> = { imagem: 0, texto: 0, vetor: 0 };
  const cores = new Map<string, number>();
  const locais: Local[] = [];

  for (const pg of analise.paginas) {
    const manchas: Caixa[] = [];
    for (const e of pg.ir.eventos) {
      if (e.tipo === 'texto' && e.texto?.invisivel) continue;

      if (e.tipo === 'imagem') {
        if (e.imagem?.espacoCor !== 'RGB') continue;
        contagem.imagem++;
        paginas.imagem.add(pg.info.indice);
        locais.push({ pagina: pg.info.indice, caixa: e.bbox });
        continue;
      }

      const rgb = pinturas(e).filter(eRgbRelevante);
      if (!rgb.length) continue;
      const cat: Categoria = e.tipo === 'texto' ? 'texto' : 'vetor';
      contagem[cat]++;
      paginas[cat].add(pg.info.indice);
      for (const c of rgb) cores.set(descreverCor(c), (cores.get(descreverCor(c)) ?? 0) + 1);
      manchas.push(e.bbox);
    }
    for (const caixa of agruparCaixas(manchas, mmParaPt(FOLGA_MANCHA_MM))) {
      locais.push({ pagina: pg.info.indice, caixa });
    }
  }

  const total = contagem.imagem + contagem.texto + contagem.vetor;
  if (!total) return [];

  const linhas = (['imagem', 'texto', 'vetor'] as const)
    .filter((c) => contagem[c] > 0)
    .map((c) => `${ROTULO[c]}: ${contagem[c]} (${formatarPaginas([...paginas[c]], 6)})`);

  const top = [...cores].sort((a, b) => b[1] - a[1]);
  if (top.length) {
    linhas.push(`Cores: ${top.slice(0, LIMITE_CORES).map(([n]) => n).join(', ')}${top.length > LIMITE_CORES ? `, +${top.length - LIMITE_CORES}` : ''}`);
  }

  return [
    {
      id: 'rgb',
      gravidade: 'aviso',
      titulo: 'Elementos em RGB',
      detalhe: ['Numa impressão em CMYK as cores mudam na conversão.', ...linhas].join('\n'),
      locais: locais.sort((a, b) => a.pagina - b.pagina).slice(0, LIMITE_LOCAIS),
    },
  ];
}
