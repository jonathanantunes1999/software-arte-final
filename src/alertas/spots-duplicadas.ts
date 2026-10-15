import type { AnaliseDocumento } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import { chaveSpot, eNomeDeSpot } from '../analise/cores';
import { formatarPaginas } from '../analise/resumo';
import { mmParaPt } from '../comum/unidades';
import { pinturas } from './comum';
import { agruparCaixas } from './geometria';
import type { Alerta, Local } from './tipos';

const FOLGA_MANCHA_MM = 5;
const LIMITE_LOCAIS = 400;
const LIMITE_LINHAS = 6;

interface UsoNome {
  nome: string;
  objetos: number;
  paginas: Set<number>;
  /** Caixa de cada objeto, por página */
  caixas: Map<number, Caixa[]>;
}

/** Os nomes de spot que uma cor ou uma imagem usa, sem tintas de processo. */
function nomesDaCor(nomes: string[] | undefined): string[] {
  return (nomes ?? []).filter(eNomeDeSpot);
}

/**
 * Spots que são a mesma cor com nomes diferentes ("PANTONE 485 C" e "PANTONE 485 CV", ou só
 * maiúsculas e espaços). Cada nome vira uma chapa separada na impressão. Só conta spots usadas
 * em objetos visíveis: uma amostra esquecida na paleta e nunca usada não chega ao ficheiro.
 */
export function alertasSpotsDuplicadas(analise: AnaliseDocumento): Alerta[] {
  const usos = new Map<string, UsoNome>();

  const registar = (nome: string, pagina: number, caixa: Caixa) => {
    const u = usos.get(nome) ?? usos.set(nome, { nome, objetos: 0, paginas: new Set(), caixas: new Map() }).get(nome)!;
    u.objetos++;
    u.paginas.add(pagina);
    (u.caixas.get(pagina) ?? u.caixas.set(pagina, []).get(pagina)!).push(caixa);
  };

  for (const pg of analise.paginas) {
    for (const e of pg.ir.eventos) {
      if (e.tipo === 'texto' && e.texto?.invisivel) continue;
      // um objeto que usa o mesmo nome em preenchimento e traço conta uma vez
      const nomes = new Set<string>();
      if (e.tipo === 'imagem') for (const n of nomesDaCor(e.imagem?.nomes)) nomes.add(n);
      for (const c of pinturas(e)) for (const n of nomesDaCor(c.nomes)) nomes.add(n);
      for (const n of nomes) registar(n, pg.info.indice, e.bbox);
    }
  }

  // agrupa nomes pela chave; só interessam os grupos com mais de um nome diferente
  const grupos = new Map<string, UsoNome[]>();
  for (const u of usos.values()) {
    const k = chaveSpot(u.nome);
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(u);
  }
  const duplicadas = [...grupos.values()].filter((g) => g.length > 1);
  if (!duplicadas.length) return [];

  const locais: Local[] = [];
  const linhas: string[] = [];

  for (const grupo of duplicadas) {
    // o nome mais usado fica; os outros é que se apontam, que é o que se corrige
    const ordenado = [...grupo].sort((a, b) => b.objetos - a.objetos);
    const paginas = new Set(ordenado.flatMap((u) => [...u.paginas]));
    const nomes = ordenado.map((u) => `${u.nome} (${u.objetos} ${u.objetos === 1 ? 'objeto' : 'objetos'})`).join(' · ');
    linhas.push(`${nomes}: ${formatarPaginas([...paginas], 6)}`);

    for (const u of ordenado.slice(1)) {
      for (const [pagina, caixas] of u.caixas) {
        for (const caixa of agruparCaixas(caixas, mmParaPt(FOLGA_MANCHA_MM))) locais.push({ pagina, caixa });
      }
    }
  }

  return [
    {
      id: 'spots-duplicadas',
      gravidade: 'aviso',
      titulo: duplicadas.length === 1 ? 'Spot duplicada com nomes diferentes' : `${duplicadas.length} spots duplicadas com nomes diferentes`,
      detalhe: [
        'Cada nome cria uma chapa separada na impressão. Junta-as numa só.',
        ...(linhas.length > LIMITE_LINHAS ? [...linhas.slice(0, LIMITE_LINHAS), `…e mais ${linhas.length - LIMITE_LINHAS}`] : linhas),
      ].join('\n'),
      locais: locais.sort((a, b) => a.pagina - b.pagina).slice(0, LIMITE_LOCAIS),
    },
  ];
}
