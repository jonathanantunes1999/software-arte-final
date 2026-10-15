import type { AnaliseDocumento } from '../analise/analisador';
import type { Caixa } from '../analise/caixas';
import { descreverCor, ehBranco, ehPretoChapado, ehRegisto, ehSpotTecnica, overprintEfetivo, semTinta } from '../analise/cores';
import type { Cor, EventoDesenho } from '../analise/ir';
import { formatarPaginas } from '../analise/resumo';
import { mmParaPt } from '../comum/unidades';
import { agruparCaixas } from './geometria';
import type { Alerta, ConfigAlertas, Local } from './tipos';

const FOLGA_MANCHA_MM = 5;
const LIMITE_LOCAIS = 400;
const LIMITE_LINHAS = 6;

type Parte = 'preenchimento' | 'traço';

/** O que um objeto pinta, com o overprint de cada parte. */
function partes(e: EventoDesenho): { parte: Parte; cor: Cor; overprint: boolean }[] {
  const p: { parte: Parte; cor: Cor; overprint: boolean }[] = [];
  if (e.preenche && e.cor) p.push({ parte: 'preenchimento', cor: e.cor, overprint: e.overprintPreenchimento });
  if (e.traca && e.corTraco) p.push({ parte: 'traço', cor: e.corTraco, overprint: e.overprintTraco });
  return p;
}

function sobrepoe(a: Caixa, b: Caixa): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/** Esta pintura deixa tinta de cor (C, M, Y, spots, imagens a cores, degradés)? K e branco não contam. */
function temCor(c: Cor): boolean {
  switch (c.familia) {
    case 'CMYK':
      return c.valores[0] > 0.02 || c.valores[1] > 0.02 || c.valores[2] > 0.02;
    case 'RGB':
      return !ehBranco(c);
    case 'Separation':
    case 'DeviceN':
      return !semTinta(c) && !ehRegisto(c);
    case 'Lab':
      return !ehBranco(c);
    case 'Pattern':
    case 'Desconhecido':
      return true;
    default:
      return false; // Gray
  }
}

function pintaCor(e: EventoDesenho, tecnicas: string[]): boolean {
  if (e.tipo === 'imagem') return !!e.imagem && e.imagem.espacoCor !== 'Gray' && e.imagem.espacoCor !== 'Mask';
  if (e.tipo === 'shading') return true;
  return partes(e).some((p) => temCor(p.cor) && !ehSpotTecnica(p.cor, tecnicas));
}

function pintaAlgo(e: EventoDesenho): boolean {
  if (e.tipo === 'imagem' || e.tipo === 'shading') return true;
  return partes(e).some((p) => !ehBranco(p.cor));
}

/** Há, pintado antes e por baixo, algo que satisfaça `cond`? A ordem dos eventos é a ordem de pintura. */
function haPorBaixo(eventos: EventoDesenho[], i: number, cond: (e: EventoDesenho) => boolean): boolean {
  const caixa = eventos[i].bbox;
  for (let j = i - 1; j >= 0; j--) if (sobrepoe(caixa, eventos[j].bbox) && cond(eventos[j])) return true;
  return false;
}

interface Contagem {
  n: number;
  paginas: Set<number>;
}
const nova = (): Contagem => ({ n: 0, paginas: new Set() });
const soma = (c: Contagem, pagina: number) => {
  c.n++;
  c.paginas.add(pagina);
};

function cortar(linhas: string[]): string[] {
  return linhas.length > LIMITE_LINHAS ? [...linhas.slice(0, LIMITE_LINHAS), `…e mais ${linhas.length - LIMITE_LINHAS}`] : linhas;
}

/**
 * Overprint onde não devia e onde devia:
 *  - branco (0/0/0/0) em overprint, que desaparece (só no modo de overprint 1, e só se houver algo por baixo);
 *  - texto e linhas finas a 100% K sobre cor sem overprint efetivo, que apagam a cor por baixo;
 *  - spots técnicas (faca, vincos, verniz, branco...) sem overprint, que apagam a arte por baixo.
 */
export function alertasOverprint(analise: AnaliseDocumento, cfg: ConfigAlertas): Alerta[] {
  const brancos = new Map<string, Contagem>();
  const pretos = { texto: nova(), linha: nova() };
  let pretosModo0 = 0;
  const spots = new Map<string, Contagem>();

  const manchasBranco: Local[] = [];
  const manchasPreto: Local[] = [];
  const manchasSpots: Local[] = [];
  const limiteLinha = Math.round(cfg.overprintLinhaMaxPt * 100);

  for (const pg of analise.paginas) {
    const ev = pg.ir.eventos;
    const caixas = { branco: [] as Caixa[], preto: [] as Caixa[], spots: [] as Caixa[] };

    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.tipo === 'texto' && e.texto?.invisivel) continue;
      if (e.tipo === 'imagem' || e.tipo === 'shading') continue;

      for (const { parte, cor, overprint } of partes(e)) {
        // --- 1. branco em overprint
        if (cor.familia === 'CMYK' && semTinta(cor) && overprint && e.modoOverprint === 1) {
          if (haPorBaixo(ev, i, pintaAlgo)) {
            const rotulo = e.tipo === 'texto' ? 'Texto' : parte === 'traço' ? 'Traços' : 'Preenchimentos';
            soma(brancos.get(rotulo) ?? brancos.set(rotulo, nova()).get(rotulo)!, pg.info.indice);
            caixas.branco.push(e.bbox);
          }
          continue;
        }

        // --- 2. preto sem overprint, sobre cor
        if (ehPretoChapado(cor) && !overprintEfetivo(cor, overprint, e.modoOverprint)) {
          let alvo: Contagem | undefined;
          if (e.tipo === 'texto' && parte === 'preenchimento') alvo = pretos.texto;
          else if (parte === 'traço' && e.espessuraTraco !== undefined && Math.round(e.espessuraTraco * 100) <= limiteLinha) alvo = pretos.linha;
          if (alvo && haPorBaixo(ev, i, (x) => pintaCor(x, cfg.spotsTecnicas))) {
            soma(alvo, pg.info.indice);
            // ligado mas em modo 0: parece certo e não funciona
            if (overprint) pretosModo0++;
            caixas.preto.push(e.bbox);
          }
          continue;
        }

        // --- 3. spots técnicas sem overprint
        if (ehSpotTecnica(cor, cfg.spotsTecnicas) && !semTinta(cor) && !overprintEfetivo(cor, overprint, e.modoOverprint)) {
          const nome = descreverCor(cor).replace(/ \d+%$/, '');
          soma(spots.get(nome) ?? spots.set(nome, nova()).get(nome)!, pg.info.indice);
          caixas.spots.push(e.bbox);
        }
      }
    }

    const juntar = (cs: Caixa[], destino: Local[]) => {
      for (const caixa of agruparCaixas(cs, mmParaPt(FOLGA_MANCHA_MM))) destino.push({ pagina: pg.info.indice, caixa });
    };
    juntar(caixas.branco, manchasBranco);
    juntar(caixas.preto, manchasPreto);
    juntar(caixas.spots, manchasSpots);
  }

  const alertas: Alerta[] = [];
  const ordena = (l: Local[]) => l.sort((a, b) => a.pagina - b.pagina).slice(0, LIMITE_LOCAIS);
  const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

  if (spots.size) {
    const linhas = [...spots].sort((a, b) => b[1].n - a[1].n).map(([nome, c]) => `${nome}: ${c.n} ${plural(c.n, 'objeto', 'objetos')} (${formatarPaginas([...c.paginas], 6)})`);
    alertas.push({
      id: 'overprint-spots-tecnicas',
      gravidade: 'erro',
      titulo: 'Spots técnicas sem overprint',
      detalhe: ['Sem overprint, a faca, os vincos e o verniz apagam a arte por baixo.', ...cortar(linhas)].join('\n'),
      locais: ordena(manchasSpots),
    });
  }

  if (brancos.size) {
    const linhas = [...brancos].map(([rotulo, c]) => `${rotulo} brancos: ${c.n} (${formatarPaginas([...c.paginas], 6)})`);
    alertas.push({
      id: 'overprint-branco',
      gravidade: 'erro',
      titulo: 'Branco com overprint',
      detalhe: ['O branco em overprint não apaga o que está por baixo, e desaparece na impressão.', ...cortar(linhas)].join('\n'),
      locais: ordena(manchasBranco),
    });
  }

  const nPretos = pretos.texto.n + pretos.linha.n;
  if (nPretos) {
    const linhas: string[] = [];
    if (pretos.texto.n) linhas.push(`Texto: ${pretos.texto.n} (${formatarPaginas([...pretos.texto.paginas], 6)})`);
    if (pretos.linha.n) linhas.push(`Linhas até ${(Math.round(cfg.overprintLinhaMaxPt * 100) / 100).toString().replace('.', ',')} pt: ${pretos.linha.n} (${formatarPaginas([...pretos.linha.paginas], 6)})`);
    if (pretosModo0) linhas.push(`${pretosModo0} ${plural(pretosModo0, 'tem', 'têm')} o overprint ligado em modo 0, que apaga as outras tintas na mesma. Falta o modo 1.`);
    alertas.push({
      id: 'overprint-preto-desligado',
      gravidade: 'aviso',
      titulo: 'Preto sem overprint sobre cor',
      detalhe: ['O preto (K 100%) apaga a cor por baixo: um desvio na impressão deixa um halo branco à volta. Liga o overprint.', ...linhas].join('\n'),
      locais: ordena(manchasPreto),
    });
  }
  return alertas;
}
