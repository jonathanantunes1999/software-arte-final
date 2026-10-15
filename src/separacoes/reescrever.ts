import type { Observacao } from '../analise/interpretador';
import { corInvisivel, marcaPlaca, tintaNaPlaca, type Placa } from './placas';

/**
 * Reescreve um content stream para uma só placa: cada cor passa a ser um cinzento (0 = tinta
 * a 100%, 1 = sem tinta) e cada pintura recebe, antes dela, uma opacidade que simula o overprint:
 * 0 quando o objeto deixa esta placa em paz, a opacidade original quando a marca.
 * Só se mexe nos operadores que o interpretador reportou; o resto do stream fica tal e qual.
 */

export interface Registo {
  inicio: number;
  fim: number;
  o: Observacao;
}

/** Nomes dos estados gráficos de opacidade que se acrescentam aos recursos */
export class RegistoAlfa {
  private mapa = new Map<string, { nome: string; ca: number; CA: number }>();

  nome(ca: number, CA: number): string {
    const chave = `${arredondar(ca)}|${arredondar(CA)}`;
    let e = this.mapa.get(chave);
    if (!e) {
      e = { nome: `ArtA${this.mapa.size}`, ca: arredondar(ca), CA: arredondar(CA) };
      this.mapa.set(chave, e);
    }
    return e.nome;
  }

  entradas(): { nome: string; ca: number; CA: number }[] {
    return [...this.mapa.values()];
  }
}

const arredondar = (v: number) => Math.round(Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1)) * 1000) / 1000;
const fmt = (v: number) => String(Math.round(v * 10000) / 10000);

export interface Contagens {
  /** Imagens que não se conseguiram separar (não aparecem nas placas) */
  imagens: number;
  /** Porquê (JPEG 2000, imagem inline, espaço Lab...), sem repetições */
  motivos: string[];
  degrades: number;
  padroes: number;
  /** Operadores de um Form que foram vistos com estados diferentes: só vale o primeiro */
  ambiguos: number;
}
export const contagensVazias = (): Contagens => ({ imagens: 0, motivos: [], degrades: 0, padroes: 0, ambiguos: 0 });

export interface OpcoesReescrita {
  placa: Placa;
  /** Simular o overprint (se não, tudo apaga o que está por baixo) */
  simularOverprint: boolean;
  alfa: RegistoAlfa;
  contagens: Contagens;
  /** É o stream da página: começa com a cor inicial (preto) */
  eDaPagina: boolean;
  /** A imagem (XObject com este nome) tem separação? `true` se sim; senão, o motivo. Por omissão nenhuma tem. */
  imagem?: (nome: string) => true | string;
}

interface Troca {
  inicio: number;
  fim: number;
  texto: string;
}

const semMarca = (cor: { familia: string } | undefined) => !cor || cor.familia === 'Pattern' || cor.familia === 'Desconhecido';

export function reescreverFluxo(texto: string, registos: Registo[], op: OpcoesReescrita): string {
  const { placa, alfa, contagens } = op;
  const trocas: Troca[] = [];
  const vistos = new Map<number, string>();
  const naoSeparada = (motivo: string) => {
    contagens.imagens++;
    if (!contagens.motivos.includes(motivo)) contagens.motivos.push(motivo);
  };

  for (const r of registos) {
    const chave = JSON.stringify(r.o);
    const anterior = vistos.get(r.inicio);
    if (anterior !== undefined) {
      if (anterior !== chave) contagens.ambiguos++;
      continue;
    }
    vistos.set(r.inicio, chave);
    const o = r.o;

    if (o.tipo === 'cor') {
      if (o.cor.familia === 'Pattern') {
        // o padrão não se separa (por enquanto): fica um cinzento neutro; a pintura fica transparente (ver abaixo)
        trocas.push({ inicio: r.inicio, fim: r.fim, texto: o.alvo === 'fill' ? '1 g' : '1 G' });
        continue;
      }
      const g = fmt(1 - tintaNaPlaca(o.cor, placa));
      trocas.push({ inicio: r.inicio, fim: r.fim, texto: `${g} ${o.alvo === 'fill' ? 'g' : 'G'}` });
      continue;
    }

    // pintura
    if (o.objeto === 'form') {
      // o conteúdo do Form tem os seus próprios operadores; só se retira se estiver numa layer desligada
      if (o.oculto) trocas.push({ inicio: r.inicio, fim: r.fim, texto: '' });
      continue;
    }
    if (o.objeto === 'shading') {
      contagens.degrades++;
      trocas.push({ inicio: r.inicio, fim: r.fim, texto: '' });
      continue;
    }
    if (o.oculto && (o.objeto === 'imagem' || o.objeto === 'imagem-inline')) {
      trocas.push({ inicio: r.inicio, fim: r.fim, texto: '' });
      continue;
    }
    if (o.objeto === 'imagem-inline' && !o.mascara) {
      naoSeparada('imagem inline');
      trocas.push({ inicio: r.inicio, fim: r.fim, texto: '' });
      continue;
    }
    if (o.objeto === 'imagem' && !o.mascara) {
      const r2 = op.imagem ? op.imagem(o.recurso ?? '') : 'sem suporte';
      if (r2 !== true) {
        naoSeparada(r2);
        trocas.push({ inicio: r.inicio, fim: r.fim, texto: '' });
        continue;
      }
    }

    if ((o.preenche && o.cor?.familia === 'Pattern') || (o.traca && o.corTraco?.familia === 'Pattern')) contagens.padroes++;

    const parte = (usa: boolean, cor: typeof o.cor, overprint: boolean, base: number): number => {
      if (!usa) return base;
      if (o.oculto || !cor || semMarca(cor) || corInvisivel(cor)) return 0;
      return marcaPlaca(cor, placa, op.simularOverprint && overprint, o.modo) ? base : 0;
    };
    const ca = parte(o.preenche, o.cor, o.overprintFill, o.ca);
    const CA = parte(o.traca, o.corTraco, o.overprintTraco, o.CA);
    // num caminho, os operadores gráficos têm de vir antes de ele começar, não entre a construção e a pintura
    const onde = o.objeto === 'caminho' && o.inicioCaminho !== undefined ? o.inicioCaminho : r.inicio;
    trocas.push({ inicio: onde, fim: onde, texto: `/${alfa.nome(ca, CA)} gs ` });
  }

  trocas.sort((a, b) => a.inicio - b.inicio || a.fim - b.fim);
  let saida = '';
  let pos = 0;
  for (const t of trocas) {
    if (t.inicio < pos) continue; // sobreposto a uma troca anterior: não devia acontecer
    saida += texto.slice(pos, t.inicio) + t.texto;
    pos = t.fim;
  }
  saida += texto.slice(pos);

  if (op.eDaPagina) {
    // cor inicial dos PDFs: preto (K 100%) → cinzento 0; nas outras placas, sem tinta
    const g = placa.id === 'K' ? '0' : '1';
    saida = `${g} g ${g} G\n${saida}`;
  }
  return saida;
}
