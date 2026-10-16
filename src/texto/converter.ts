import { PDFDict, PDFDocument, PDFName, PDFRef, PDFStream, type PDFObject } from 'pdf-lib';
import { prepararInspecao } from '../analise/analisador';
import { lerPaginas } from '../analise/documento';
import { interpretarPagina, type DadosTexto } from '../analise/interpretador';
import { operacoes } from '../analise/lexer';
import type { Leitor } from '../analise/leitor';
import { abrirFontePdf, type FonteConvertivel } from './fonte-pdf';
import type { Cmd } from './programa';

/**
 * Texto em curvas: cada operador de mostrar texto passa a desenhar os contornos dos glifos. Posições,
 * espaçamentos, escala e elevação vêm da simulação do interpretador, por isso o resultado cai onde o
 * texto caía. Só se converte um bloco BT…ET inteiro (misturar texto e curvas desalinharia o texto
 * seguinte, porque as curvas não avançam a matriz do texto).
 */

export interface PedidoTexto {
  /** Fontes a converter (ids = etiqueta do objeto, "12 0 R"); sem isto, todas as que se conseguirem */
  fontes?: string[];
}

export interface ResumoTexto {
  /** Operadores de texto trocados por curvas */
  operadores: number;
  /** Glifos desenhados */
  glifos: number;
  fontesConvertidas: string[];
  /** Fontes que deixaram de existir no ficheiro (já ninguém as usa) */
  fontesRemovidas: string[];
  /** Texto que ficou como estava, e porquê */
  naoConvertido: { fonte: string; motivo: string; operadores: number }[];
}

export const RESUMO_TEXTO_VAZIO = (): ResumoTexto => ({ operadores: 0, glifos: 0, fontesConvertidas: [], fontesRemovidas: [], naoConvertido: [] });

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

/** Três casas decimais, sem zeros a mais (e String(-0) já dá "0") */
const num = (v: number): string => String(Math.round(v * 1000) / 1000);

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
  no: { set(k: PDFName, v: PDFObject): void };
}

const PINTURA: Record<number, string> = { 0: 'f', 1: 'S', 2: 'B', 3: '' };

export function converterTexto(pdf: PDFDocument, pedido: PedidoTexto, resumo: ResumoTexto): void {
  const c = prepararInspecao(pdf, lerPaginas(pdf));
  const l = c.l;
  const escolhidas = pedido.fontes ? new Set(pedido.fontes) : undefined;
  const abertas = new Map<string, { ok: FonteConvertivel } | { erro: string; jaVetorial?: boolean }>();
  const nomes = new Map<string, string>();
  const abrir = (d: DadosTexto['fonte']) => {
    let r = abertas.get(d.id);
    if (!r) {
      r = d.type3 ? { erro: 'fonte Type 3 (já é vetorial)', jaVetorial: true } : abrirFontePdf(l, d.dict);
      abertas.set(d.id, r);
      nomes.set(d.id, (l.nome(l.get(d.dict, 'BaseFont')) ?? d.id).replace(/^[A-Z]{6}\+/, ''));
    }
    return r;
  };

  const convertidas = new Set<string>();
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
      ocgOcultos: c.ocgPorOmissao,
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
      for (const t of f.textos) {
        const i = blocos.findIndex((b) => t.inicio >= b.de && t.fim <= b.ate);
        if (i < 0) soltos.push(t);
        else (dosBlocos.get(i) ?? dosBlocos.set(i, []).get(i)!).push(t);
      }
      for (const t of soltos) {
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

  gravar(pdf, reescritos);
  resumo.fontesConvertidas = [...convertidas].map((id) => nomes.get(id) ?? id);
  resumo.naoConvertido = [...naoConv.values()];

  // fontes que já ninguém usa (com todas as layers visíveis, para contar o que está em Forms escondidos)
  const emUso = fontesEmUso(pdf);
  const removiveis = new Set([...convertidas].filter((id) => !emUso.has(id)));
  if (removiveis.size) {
    retirarFontes(pdf, l, reescritos, removiveis);
    resumo.fontesRemovidas = [...removiveis].map((id) => nomes.get(id) ?? id);
  }
}

function gravar(pdf: PDFDocument, reescritos: Reescrito[]) {
  const ctx = pdf.context;
  for (const r of reescritos) {
    const bytes = paraBytes(r.texto);
    if (r.fluxo.id === 'pagina') r.no.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(bytes)));
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

/** Ids das fontes que alguma página ainda usa para mostrar texto */
function fontesEmUso(pdf: PDFDocument): Set<string> {
  const c = prepararInspecao(pdf, lerPaginas(pdf));
  const usadas = new Set<string>();
  for (let i = 0; i < c.nos.length; i++) {
    const ir = interpretarPagina(c.l, c.nos[i].node, { indice: i, limites: c.info.paginas[i].media, ocgOcultos: new Set(), fontes: c.fontes });
    for (const id of ir.fontesUsadas) usadas.add(id);
  }
  return usadas;
}

/** Tira dos recursos as fontes convertidas e os `Tf` que as escolhiam, nos fluxos que se reescreveram */
function retirarFontes(pdf: PDFDocument, l: Leitor, reescritos: Reescrito[], removiveis: Set<string>) {
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
  gravar(pdf, reescritos);
}
