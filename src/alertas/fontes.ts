import type { AnaliseDocumento } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import { formatarPaginas } from '../analise/resumo';
import type { Alerta, Local } from './tipos';

const LIMITE_FONTES_NO_DETALHE = 8;
const LIMITE_LOCAIS = 400;
/** Intervalos de páginas mostrados por fonte; o resto fica em "…" */
const PARTES_POR_LINHA = 6;

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
    // objetos de fonte diferentes com o mesmo nome contam como a mesma fonte
    const porNome = new Map<string, { paginas: Set<number>; usos: number }>();
    for (const [id, paginas] of naoIncorporadas) {
      const nome = analise.fontes[id].nome;
      const g = porNome.get(nome) ?? porNome.set(nome, { paginas: new Set(), usos: 0 }).get(nome)!;
      for (const [pagina, { caixa, usos }] of paginas) {
        locais.push({ pagina, caixa });
        g.paginas.add(pagina);
        g.usos += usos;
      }
    }
    locais.sort((a, b) => a.pagina - b.pagina);
    const linhas = [...porNome].map(
      ([nome, g]) => `${nome}: ${formatarPaginas([...g.paginas], PARTES_POR_LINHA)} (${g.usos} ${g.usos === 1 ? 'uso' : 'usos'})`,
    );
    alertas.push({
      id: 'fonte-nao-incorporada',
      gravidade: 'erro',
      titulo: porNome.size === 1 ? 'Fonte não incorporada' : `${porNome.size} fontes não incorporadas`,
      detalhe: ['Sem a fonte dentro do ficheiro, a gráfica pode ver outra letra.', ...cortar(linhas)].join('\n'),
      locais: locais.slice(0, LIMITE_LOCAIS),
    });
  }

  // --- texto ainda em fonte
  if (porPagina.size) {
    const porNome = new Map<string, Set<number>>();
    for (const [id, paginas] of porFonte) {
      const f = analise.fontes[id];
      if (!f) continue;
      const g = porNome.get(f.nome) ?? porNome.set(f.nome, new Set()).get(f.nome)!;
      for (const p of paginas.keys()) g.add(p);
    }
    const linhas = [...porNome].map(([nome, paginas]) => `${nome}: ${formatarPaginas([...paginas], PARTES_POR_LINHA)}`);
    alertas.push({
      id: 'texto-em-fonte',
      gravidade: 'info',
      titulo: 'O texto ainda está em fonte, não em curvas',
      detalhe: [`${porNome.size} ${porNome.size === 1 ? 'fonte' : 'fontes'}:`, ...cortar(linhas)].join('\n'),
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
