import { PDFDict, PDFDocument, PDFName, PDFRef, PDFStream, type PDFObject } from 'pdf-lib';
import { prepararInspecao } from '../analise/analisador';
import { lerPaginas } from '../analise/documento';
import { interpretarPagina, type DadosTexto } from '../analise/interpretador';
import { operacoes } from '../analise/lexer';
import { substituirConteudo, usosDosConteudos } from '../correcoes/pdf-util';
import type { Leitor } from '../analise/leitor';
import { abrirFontePdf, type FonteConvertivel } from './fonte-pdf';
import { lerPrograma, type Cmd } from './programa';

/**
 * Texto em curvas: cada operador de mostrar texto passa a desenhar os contornos dos glifos. Posições,
 * espaçamentos, escala e elevação vêm da simulação do interpretador, por isso o resultado cai onde o
 * texto caía. Só se converte um bloco BT…ET inteiro (misturar texto e curvas desalinharia o texto
 * seguinte, porque as curvas não avançam a matriz do texto).
 */

export interface PedidoTexto {
  /** Fontes a converter (ids = etiqueta do objeto, "12 0 R"); sem isto, todas as que se conseguirem */
  fontes?: string[];
  /**
   * Fontes não incorporadas que se desenham com uma fonte instalada no computador (id → fonte).
   * Os glifos vêm daí; a posição de cada um continua a ser a do PDF.
   */
  externas?: Record<string, FonteExterna>;
}

export interface FonteExterna {
  /** Nome da fonte instalada, para o relatório */
  nome: string;
  /** Ficheiro sfnt (TTF/OTF) já extraído de uma eventual coleção */
  bytes: Uint8Array;
}

export interface ResumoTexto {
  /** Operadores de texto trocados por curvas */
  operadores: number;
  /** Glifos desenhados */
  glifos: number;
  fontesConvertidas: string[];
  /** Fontes não incorporadas que se desenharam com uma fonte instalada no computador */
  substituidas: { fonte: string; por: string }[];
  /** Fontes que deixaram de existir no ficheiro (já ninguém as usa) */
  fontesRemovidas: string[];
  /** Texto que ficou como estava, e porquê */
  naoConvertido: { fonte: string; motivo: string; operadores: number }[];
}

export const RESUMO_TEXTO_VAZIO = (): ResumoTexto => ({ operadores: 0, glifos: 0, fontesConvertidas: [], substituidas: [], fontesRemovidas: [], naoConvertido: [] });

type Mat = [number, number, number, number, number, number];

function mult(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

/** Duas casas decimais (0,01 pt), sem zeros a mais (e String(-0) já dá "0") */
const num = (v: number): string => String(Math.round(v * 100) / 100);

function paraBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
  return b;
}

function refDeTag(tag: string): PDFRef | undefined {
  const m = tag.match(/^(\d+) (\d+) R$/);
  return m ? PDFRef.of(parseInt(m[1], 10), parseInt(m[2], 10)) : undefined;
}

/** Os contornos de um glifo, na posição certa da página (espaço de utilizador), prontos a escrever */
export function desenharGlifo(cmds: Cmd[], tamanho: number, th: number, rise: number, x: number, tm: Mat): string {
  const m = mult([tamanho * th, 0, 0, tamanho, x, rise], tm);
  const P = (px: number, py: number) => `${num(m[0] * px + m[2] * py + m[4])} ${num(m[1] * px + m[3] * py + m[5])}`;
  const partes: string[] = [];
  for (const c of cmds) {
    if (c.t === 'M') partes.push(`${P(c.x, c.y)} m`);
    else if (c.t === 'L') partes.push(`${P(c.x, c.y)} l`);
    else if (c.t === 'C') partes.push(`${P(c.x1, c.y1)} ${P(c.x2, c.y2)} ${P(c.x, c.y)} c`);
    else partes.push('h');
  }
  return partes.join(' ');
}

interface Texto {
  inicio: number;
  fim: number;
  d: DadosTexto;
}

interface FluxoVisto {
  id: string;
  texto: string;
  recursos: PDFDict | undefined;
  stream?: PDFStream;
  textos: Texto[];
}

interface Reescrito {
  fluxo: FluxoVisto;
  texto: string;
  no: PDFDict;
}

const PINTURA: Record<number, string> = { 0: 'f', 1: 'S', 2: 'B', 3: '' };

export function converterTexto(pdf: PDFDocument, pedido: PedidoTexto, resumo: ResumoTexto): void {
  const c = prepararInspecao(pdf, lerPaginas(pdf));
  const l = c.l;
  const escolhidas = pedido.fontes ? new Set(pedido.fontes) : undefined;
  const abertas = new Map<string, { ok: FonteConvertivel } | { erro: string; jaVetorial?: boolean }>();
  const nomes = new Map<string, string>();
  /** Fontes cujo desenho veio de uma fonte instalada */
  const usouExterna = new Set<string>();
  const abrir = (d: DadosTexto['fonte']) => {
    let r = abertas.get(d.id);
    if (!r) {
      r = d.type3 ? { erro: 'fonte Type 3 (já é vetorial)', jaVetorial: true } : abrirFontePdf(l, d.dict);
      // O desenho que o PDF traz tem sempre prioridade; a fonte instalada só entra quando falta
      const ext = pedido.externas?.[d.id];
      if ('erro' in r && ext && !r.jaVetorial) {
        const lida = lerPrograma(ext.bytes, 'sfnt');
        r = 'ok' in lida ? abrirFontePdf(l, d.dict, lida.ok) : { erro: `a fonte instalada (${ext.nome}) não se consegue ler` };
        if ('ok' in r) usouExterna.add(d.id);
      }
      abertas.set(d.id, r);
      nomes.set(d.id, (l.nome(l.get(d.dict, 'BaseFont')) ?? d.id).replace(/^[A-Z]{6}\+/, ''));
    }
    return r;
  };

  const convertidas = new Set<string>();
  /** Fontes com texto que ficou por converter (não se podem retirar do ficheiro) */
  const aindaUsadas = new Set<string>();
  const formsFeitos = new Set<string>();
  const reescritos: Reescrito[] = [];
  const naoConv = new Map<string, { fonte: string; motivo: string; operadores: number }>();
  const registarNao = (fonteId: string, motivo: string) => {
    const k = `${fonteId}|${motivo}`;
    const e = naoConv.get(k) ?? naoConv.set(k, { fonte: nomes.get(fonteId) ?? fonteId, motivo, operadores: 0 }).get(k)!;
    e.operadores++;
  };

  for (let pagina = 0; pagina < c.nos.length; pagina++) {
    const fluxos = new Map<string, FluxoVisto>();
    interpretarPagina(l, c.nos[pagina].node, {
      indice: pagina,
      limites: c.info.paginas[pagina].media,
      // com todas as layers visíveis: converte-se também o que está escondido, e vê-se todo o texto
      ocgOcultos: new Set(),
      fontes: c.fontes,
      observador: {
        fluxo: (id, f) => {
          if (!fluxos.has(id)) fluxos.set(id, { id, texto: f.texto, recursos: f.recursos, stream: f.stream, textos: [] });
        },
        operador: () => {},
        texto: (id, inicio, fim, d) => fluxos.get(id)?.textos.push({ inicio, fim, d }),
      },
    });

    for (const f of fluxos.values()) {
      if (!f.textos.length) continue;
      if (f.id !== 'pagina') {
        if (formsFeitos.has(f.id)) continue;
        formsFeitos.add(f.id);
      }
      // blocos BT…ET
      const ops = [...operacoes(f.texto)];
      const blocos: { de: number; ate: number }[] = [];
      let abre = -1;
      for (const o of ops) {
        if (o.op === 'BT') abre = o.fim;
        else if (o.op === 'ET' && abre >= 0) {
          blocos.push({ de: abre, ate: o.inicio });
          abre = -1;
        }
      }
      const trocas: { inicio: number; fim: number; texto: string }[] = [];
      const dosBlocos = new Map<number, Texto[]>();
      const soltos: Texto[] = [];
      // os textos e os blocos vêm por ordem de posição: percorre-se uma vez (há PDFs com milhares de blocos por página)
      let bi = 0;
      for (const t of f.textos) {
        while (bi < blocos.length && blocos[bi].ate < t.fim) bi++;
        if (bi < blocos.length && t.inicio >= blocos[bi].de && t.fim <= blocos[bi].ate) (dosBlocos.get(bi) ?? dosBlocos.set(bi, []).get(bi)!).push(t);
        else soltos.push(t);
      }
      for (const t of soltos) {
        aindaUsadas.add(t.d.fonte.id);
        const fr = abrir(t.d.fonte);
        if (!('erro' in fr && fr.jaVetorial)) registarNao(t.d.fonte.id, 'texto fora de um bloco BT…ET');
      }

      /** Por que razão este texto, por si só, não se converte */
      const razao = (t: Texto): string | undefined => {
        const fr = abrir(t.d.fonte);
        if ('erro' in fr) return fr.jaVetorial ? 'texto Type 3 (já é vetorial)' : fr.erro;
        if (escolhidas && !escolhidas.has(t.d.fonte.id)) return 'fonte não escolhida';
        if (t.d.modo > 3) return 'texto usado como recorte';
        if (t.d.glifos.some((g) => fr.ok.glifo(g.codigo) === null)) return 'glifo sem contorno na fonte';
        return undefined;
      };

      for (const textos of dosBlocos.values()) {
        const razoes = textos.map(razao);
        if (razoes.some((r) => r !== undefined)) {
          // o bloco fica todo como estava; cada texto diz o que o impede (ou que é o vizinho)
          textos.forEach((t, i) => {
            aindaUsadas.add(t.d.fonte.id);
            const r = razoes[i];
            if (r === 'fonte não escolhida' || r === 'texto Type 3 (já é vetorial)') return; // escolha do utilizador / já vetorial
            registarNao(t.d.fonte.id, r ?? 'está num bloco com fontes que não se convertem');
          });
          continue;
        }
        for (const t of textos) {
          const fr = abertas.get(t.d.fonte.id) as { ok: FonteConvertivel };
          const d = t.d;
          const partes: string[] = [];
          if (d.op === "'") partes.push('T*');
          else if (d.op === '"') partes.push(`${num(d.tw ?? 0)} Tw ${num(d.tc ?? 0)} Tc T*`);
          const pintura = PINTURA[d.modo];
          for (const g of d.glifos) {
            const cmds = fr.ok.glifo(g.codigo)!;
            if (!cmds.length || pintura === '') continue;
            partes.push(`${desenharGlifo(cmds, d.tamanho, d.th, d.rise, g.x, d.tm)} ${pintura}`);
            resumo.glifos++;
          }
          trocas.push({ inicio: t.inicio, fim: t.fim, texto: partes.join(' ') });
          resumo.operadores++;
          convertidas.add(t.d.fonte.id);
        }
      }
      if (!trocas.length) continue;

      trocas.sort((a, b) => a.inicio - b.inicio);
      let saida = '';
      let pos = 0;
      for (const t of trocas) {
        saida += f.texto.slice(pos, t.inicio) + t.texto;
        pos = t.fim;
      }
      saida += f.texto.slice(pos);
      reescritos.push({ fluxo: f, texto: saida, no: c.nos[pagina].node });
    }
  }

  const nomesUnicos = (ids: Iterable<string>) => [...new Set([...ids].map((id) => nomes.get(id) ?? id))];
  const removiveis = new Set([...convertidas].filter((id) => !aindaUsadas.has(id)));
  if (removiveis.size) retirarFontes(l, reescritos, removiveis);
  gravar(pdf, reescritos);
  resumo.fontesConvertidas = nomesUnicos(convertidas);
  const subst = new Map<string, string>();
  for (const id of convertidas) {
    const e = usouExterna.has(id) ? pedido.externas?.[id] : undefined;
    if (e) subst.set(nomes.get(id) ?? id, e.nome);
  }
  resumo.substituidas = [...subst].map(([fonte, por]) => ({ fonte, por }));
  resumo.fontesRemovidas = nomesUnicos(removiveis);
  resumo.naoConvertido = [...naoConv.values()];
}

function gravar(pdf: PDFDocument, reescritos: Reescrito[]) {
  const ctx = pdf.context;
  const usos = usosDosConteudos(pdf);
  for (const r of reescritos) {
    const bytes = paraBytes(r.texto);
    if (r.fluxo.id === 'pagina') substituirConteudo(pdf, r.no, bytes, usos);
    else {
      const ref = refDeTag(r.fluxo.id);
      if (!ref || !r.fluxo.stream) continue;
      const d: Record<string, unknown> = {};
      for (const [k, v] of r.fluxo.stream.dict.entries()) {
        const n = k.decodeText();
        if (n !== 'Filter' && n !== 'DecodeParms' && n !== 'Length' && n !== 'DL') d[n] = v;
      }
      ctx.assign(ref, ctx.flateStream(bytes, d as never));
    }
  }
}

/** Tira dos recursos as fontes convertidas e os `Tf` que as escolhiam, nos fluxos que se reescreveram */
function retirarFontes(l: Leitor, reescritos: Reescrito[], removiveis: Set<string>) {
  const feitos = new Set<PDFDict>();
  for (const r of reescritos) {
    const recursos = r.fluxo.recursos;
    const fontes = recursos && l.dict(recursos.get(PDFName.of('Font')));
    if (!recursos || !fontes) continue;
    const nomesRetirados = new Set<string>();
    for (const [k, v] of fontes.entries()) {
      if (v instanceof PDFRef && removiveis.has(v.tag)) nomesRetirados.add(k.decodeText());
    }
    if (!nomesRetirados.size) continue;
    // os `Tf` primeiro (precisam do dicionário), depois as entradas
    const trocas: { inicio: number; fim: number }[] = [];
    for (const o of operacoes(r.texto)) {
      if (o.op === 'Tf' && o.args[0] && typeof o.args[0] === 'object' && 'nome' in o.args[0] && nomesRetirados.has(o.args[0].nome)) trocas.push({ inicio: o.inicio, fim: o.fim });
    }
    if (trocas.length) {
      let saida = '';
      let pos = 0;
      for (const t of trocas) {
        saida += r.texto.slice(pos, t.inicio);
        pos = t.fim;
      }
      r.texto = saida + r.texto.slice(pos);
    }
    if (!feitos.has(fontes)) {
      feitos.add(fontes);
      for (const n of nomesRetirados) fontes.delete(PDFName.of(n));
    }
  }
}
