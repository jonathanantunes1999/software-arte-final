import { prepararInspecao } from '../../src/analise/analisador';
import { abrirPdf, lerPaginas } from '../../src/analise/documento';
import { interpretarPagina, type Observacao } from '../../src/analise/interpretador';
import { gerarPdfRaw, type PaginaRaw } from './gerar';
import { BASE } from './analisar';

export interface Registo {
  fluxo: string;
  inicio: number;
  fim: number;
  o: Observacao;
}
export interface Fluxo {
  texto: string;
}

/** Interpreta a primeira página e devolve o que o observador viu */
export async function observar(spec: Partial<PaginaRaw> & { conteudo: string | string[] }, ocgOcultos?: Set<string>) {
  const pdf = await abrirPdf(await gerarPdfRaw([{ ...BASE, ...spec }]));
  const ctx = prepararInspecao(pdf, lerPaginas(pdf));
  const registos: Registo[] = [];
  const fluxos = new Map<string, Fluxo>();
  const ir = interpretarPagina(ctx.l, ctx.nos[0].node, {
    indice: 0,
    limites: ctx.info.paginas[0].media,
    ocgOcultos: ocgOcultos ?? ctx.ocgPorOmissao,
    fontes: ctx.fontes,
    observador: {
      fluxo: (id, f) => {
        if (!fluxos.has(id)) fluxos.set(id, { texto: f.texto });
      },
      operador: (fluxo, inicio, fim, o) => registos.push({ fluxo, inicio, fim, o }),
    },
  });
  return { ir, registos, fluxos };
}
