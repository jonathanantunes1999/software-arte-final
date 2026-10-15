import type { AnaliseDocumento } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import { formatarPaginas } from '../analise/resumo';
import type { Alerta, Local } from './tipos';

const LIMITE_FONTES_NO_DETALHE = 8;
const LIMITE_LOCAIS = 400;

function uniao(a: Caixa | undefined, b: Caixa): Caixa {
  if (!a) return { ...b };
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

/**
 * Fontes não incorporadas (erro) e texto que ainda está em fonte (informação).
 * Só conta texto que se vê: invisível (OCR) ou recortado não imprime.
 */
export function alertasFontes(analise: AnaliseDocumento): Alerta[] {
  // por fonte: páginas e caixa do texto em cada uma
  const porFonte = new Map<string, Map<number, { caixa: Caixa; usos: number }>>();
  // por página: caixa de todo o texto (para o alerta informativo)
  const porPagina = new Map<number, Caixa>();

  for (const pg of analise.paginas) {
    for (const e of pg.ir.eventos) {
      if (e.tipo !== 'texto' || !e.texto || e.texto.invisivel) continue;
      const paginas = porFonte.get(e.texto.fonte) ?? porFonte.set(e.texto.fonte, new Map()).get(e.texto.fonte)!;
      const atual = paginas.get(pg.info.indice);
      paginas.set(pg.info.indice, { caixa: uniao(atual?.caixa, e.bbox), usos: (atual?.usos ?? 0) + 1 });
      porPagina.set(pg.info.indice, uniao(porPagina.get(pg.info.indice), e.bbox));
    }
  }

  const alertas: Alerta[] = [];

  // --- não incorporadas
  const naoIncorporadas = [...porFonte].filter(([id]) => analise.fontes[id] && !analise.fontes[id].incorporada);
  if (naoIncorporadas.length) {
    const locais: Local[] = [];
    const linhas: string[] = [];
    for (const [id, paginas] of naoIncorporadas) {
      for (const [pagina, { caixa }] of paginas) locais.push({ pagina, caixa });
      const usos = [...paginas.values()].reduce((s, p) => s + p.usos, 0);
      linhas.push(`${analise.fontes[id].nome}: ${formatarPaginas([...paginas.keys()])} (${usos} ${usos === 1 ? 'uso' : 'usos'})`);
    }
    locais.sort((a, b) => a.pagina - b.pagina);
    const nomes = new Set(naoIncorporadas.map(([id]) => analise.fontes[id].nome));
    alertas.push({
      id: 'fonte-nao-incorporada',
      gravidade: 'erro',
      titulo: nomes.size === 1 ? 'Fonte não incorporada' : `${nomes.size} fontes não incorporadas`,
      detalhe: [
        'Sem a fonte dentro do ficheiro, a gráfica pode ver outra letra.',
        ...cortar(linhas),
      ].join('\n'),
      locais: locais.slice(0, LIMITE_LOCAIS),
    });
  }

  // --- texto ainda em fonte
  if (porPagina.size) {
    const linhas = [...porFonte]
      .filter(([id]) => analise.fontes[id])
      .map(([id, paginas]) => `${analise.fontes[id].nome}: ${formatarPaginas([...paginas.keys()])}`);
    // fontes com o mesmo nome (subsets diferentes) contam como uma só
    const unicas = [...new Set(linhas)];
    const nomes = new Set([...porFonte.keys()].filter((id) => analise.fontes[id]).map((id) => analise.fontes[id].nome));
    alertas.push({
      id: 'texto-em-fonte',
      gravidade: 'info',
      titulo: 'O texto ainda está em fonte, não em curvas',
      detalhe: [`${nomes.size} ${nomes.size === 1 ? 'fonte' : 'fontes'}:`, ...cortar(unicas)].join('\n'),
      locais: [...porPagina].sort((a, b) => a[0] - b[0]).slice(0, LIMITE_LOCAIS).map(([pagina, caixa]) => ({ pagina, caixa })),
    });
  }

  return alertas;
}

function cortar(linhas: string[]): string[] {
  return linhas.length > LIMITE_FONTES_NO_DETALHE
    ? [...linhas.slice(0, LIMITE_FONTES_NO_DETALHE), `…e mais ${linhas.length - LIMITE_FONTES_NO_DETALHE}`]
    : linhas;
}
