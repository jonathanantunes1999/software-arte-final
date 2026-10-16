import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFStream, type PDFObject } from 'pdf-lib';
import { acharOverprint, type AchadoOverprint } from '../alertas/overprint';
import type { ConfigAlertas } from '../alertas/tipos';
import { lerPaginas } from '../analise/documento';
import { interpretarPagina, type Observacao } from '../analise/interpretador';
import { prepararInspecao } from '../analise/analisador';
import { Leitor } from '../analise/leitor';

/**
 * Correções automáticas. Trabalham sobre uma cópia do PDF carregada de novo: o original nunca é
 * alterado, e o resultado é uma sequência de bytes nova para gravar como "nome_corrigido.pdf".
 */

export interface PedidoCorrecoes {
  /** Desliga o overprint em brancos que desapareceriam */
  overprintBranco: boolean;
  /** Liga o overprint em texto e linhas finas a K 100% sobre cor */
  overprintPreto: boolean;
  /** Liga o overprint em spots técnicas (faca, vincos, verniz...) */
  overprintSpots: boolean;
  /** Muda o nome de spots (junta duplicadas, ou dá nome a uma técnica) */
  renomear: { de: string; para: string }[];
}

export interface ResumoCorrecoes {
  overprintBranco: number;
  overprintPreto: number;
  overprintSpots: number;
  /** Espaços de cor (Separation/DeviceN) onde se mudou um nome */
  spotsRenomeradas: number;
  /** Páginas onde se mexeu no conteúdo (0 = primeira) */
  paginas: number[];
  avisos: string[];
}

export const SEM_CORRECOES: PedidoCorrecoes = { overprintBranco: false, overprintPreto: false, overprintSpots: false, renomear: [] };

interface Pintura {
  inicio: number;
  fim: number;
  inicioCaminho?: number;
  OP: boolean;
  op: boolean;
  OPM: 0 | 1;
}

interface FluxoVisto {
  id: string;
  texto: string;
  recursos: PDFDict | undefined;
  stream?: PDFStream;
  pinturas: Map<number, Pintura>;
}

const nomeGs = (OP: boolean, op: boolean, OPM: number) => `ArtOv${OP ? 1 : 0}${op ? 1 : 0}${OPM}`;

function paraBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
  return b;
}

function refDeTag(tag: string): PDFRef | undefined {
  const m = tag.match(/^(\d+) (\d+) R$/);
  return m ? PDFRef.of(parseInt(m[1], 10), parseInt(m[2], 10)) : undefined;
}

export async function aplicarCorrecoes(
  bytes: Uint8Array,
  pedido: PedidoCorrecoes,
  cfg: ConfigAlertas,
): Promise<{ bytes: Uint8Array; resumo: ResumoCorrecoes }> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const resumo: ResumoCorrecoes = { overprintBranco: 0, overprintPreto: 0, overprintSpots: 0, spotsRenomeradas: 0, paginas: [], avisos: [] };
  const querOverprint = pedido.overprintBranco || pedido.overprintPreto || pedido.overprintSpots;

  if (querOverprint) {
    const c = prepararInspecao(pdf, lerPaginas(pdf));
    for (let i = 0; i < c.nos.length; i++) corrigirOverprintDaPagina(pdf, c, i, pedido, cfg, resumo);
  }

  const mapa = new Map(pedido.renomear.filter((r) => r.de !== r.para && r.para.trim() !== '').map((r) => [r.de, r.para.trim()]));
  if (mapa.size) resumo.spotsRenomeradas = renomearSpots(pdf, mapa);

  return { bytes: await pdf.save({ useObjectStreams: false }), resumo };
}

// --- overprint

function corrigirOverprintDaPagina(
  pdf: PDFDocument,
  c: ReturnType<typeof prepararInspecao>,
  indice: number,
  pedido: PedidoCorrecoes,
  cfg: ConfigAlertas,
  resumo: ResumoCorrecoes,
) {
  const ctx = pdf.context;
  const fluxos = new Map<string, FluxoVisto>();
  const origem = new Map<number, { fluxo: string; inicio: number }>();

  const ir = interpretarPagina(c.l, c.nos[indice].node, {
    indice,
    limites: c.info.paginas[indice].media,
    ocgOcultos: c.ocgPorOmissao,
    fontes: c.fontes,
    observador: {
      fluxo: (id, f) => {
        if (!fluxos.has(id)) fluxos.set(id, { id, texto: f.texto, recursos: f.recursos, stream: f.stream, pinturas: new Map() });
      },
      operador: (id, inicio, fim, o: Observacao) => {
        if (o.tipo !== 'pintar' || o.oculto) return;
        const f = fluxos.get(id);
        if (f && !f.pinturas.has(inicio)) f.pinturas.set(inicio, { inicio, fim, inicioCaminho: o.inicioCaminho, OP: o.overprintTraco, op: o.overprintFill, OPM: o.modo });
      },
      evento: (fluxo, inicio, i) => origem.set(i, { fluxo, inicio }),
    },
  });

  const achados = acharOverprint(ir.eventos, cfg).filter(
    (a) => (a.tipo === 'branco' && pedido.overprintBranco) || ((a.tipo === 'preto-texto' || a.tipo === 'preto-linha') && pedido.overprintPreto) || (a.tipo === 'spot' && pedido.overprintSpots),
  );
  if (!achados.length) return;

  // junta o que há a fazer em cada operador
  const porOperador = new Map<string, { fluxo: FluxoVisto; pintura: Pintura; novo: { OP: boolean; op: boolean; OPM: 0 | 1 }; achados: AchadoOverprint[] }>();
  for (const a of achados) {
    const o = origem.get(a.indice);
    const f = o && fluxos.get(o.fluxo);
    const p = o && f?.pinturas.get(o.inicio);
    if (!o || !f || !p) continue;
    const chave = `${f.id}|${o.inicio}`;
    let e = porOperador.get(chave);
    if (!e) porOperador.set(chave, (e = { fluxo: f, pintura: p, novo: { OP: p.OP, op: p.op, OPM: p.OPM }, achados: [] }));
    e.achados.push(a);
    const alvoTraco = a.parte === 'traço';
    if (a.tipo === 'branco') e.novo[alvoTraco ? 'OP' : 'op'] = false;
    else {
      e.novo[alvoTraco ? 'OP' : 'op'] = true;
      e.novo.OPM = 1;
    }
  }

  // reescreve cada fluxo: antes da pintura põe o estado novo, depois repõe o que lá estava
  const porFluxo = new Map<string, typeof porOperador extends Map<string, infer V> ? V[] : never>();
  for (const e of porOperador.values()) (porFluxo.get(e.fluxo.id) ?? porFluxo.set(e.fluxo.id, []).get(e.fluxo.id)!).push(e);

  const estadosUsados = new Set<string>();
  for (const [id, lista] of porFluxo) {
    const f = fluxos.get(id)!;
    const trocas: { pos: number; texto: string }[] = [];
    for (const e of lista) {
      const p = e.pintura;
      const antes = nomeGs(e.novo.OP, e.novo.op, e.novo.OPM);
      const depois = nomeGs(p.OP, p.op, p.OPM);
      estadosUsados.add(`${e.novo.OP}|${e.novo.op}|${e.novo.OPM}`).add(`${p.OP}|${p.op}|${p.OPM}`);
      trocas.push({ pos: p.inicioCaminho ?? p.inicio, texto: `/${antes} gs ` });
      trocas.push({ pos: p.fim, texto: ` /${depois} gs` });
      for (const a of e.achados) {
        if (a.tipo === 'branco') resumo.overprintBranco++;
        else if (a.tipo === 'spot') resumo.overprintSpots++;
        else resumo.overprintPreto++;
      }
    }
    trocas.sort((a, b) => a.pos - b.pos);
    let saida = '';
    let pos = 0;
    for (const t of trocas) {
      saida += f.texto.slice(pos, t.pos) + t.texto;
      pos = t.pos;
    }
    saida += f.texto.slice(pos);

    gravarFluxo(pdf, c.l, c.nos[indice].node, f, saida);
    if (!resumo.paginas.includes(indice)) resumo.paginas.push(indice);
  }

  // estados gráficos novos nos recursos de cada fluxo mexido
  for (const [id] of porFluxo) {
    const f = fluxos.get(id)!;
    const recursos = f.recursos ?? criarRecursosDaPagina(ctx, c.nos[indice].node);
    let gs = c.l.dict(recursos.get(PDFName.of('ExtGState')));
    if (!gs) {
      gs = ctx.obj({}) as PDFDict;
      recursos.set(PDFName.of('ExtGState'), gs);
    }
    for (const chave of estadosUsados) {
      const [OP, op, OPM] = chave.split('|');
      const nome = nomeGs(OP === 'true', op === 'true', parseInt(OPM, 10));
      if (!gs.has(PDFName.of(nome))) gs.set(PDFName.of(nome), ctx.obj({ Type: 'ExtGState', OP: OP === 'true', op: op === 'true', OPM: parseInt(OPM, 10) }));
    }
  }
}

function criarRecursosDaPagina(ctx: PDFDocument['context'], no: { set(k: PDFName, v: PDFObject): void }): PDFDict {
  const r = ctx.obj({}) as PDFDict;
  no.set(PDFName.of('Resources'), r);
  return r;
}

/** Grava o conteúdo novo de um fluxo: o da página fica num só stream; o de um Form substitui o stream do Form */
function gravarFluxo(pdf: PDFDocument, l: Leitor, no: { set(k: PDFName, v: PDFObject): void }, f: FluxoVisto, texto: string) {
  const ctx = pdf.context;
  const bytes = paraBytes(texto);
  if (f.id === 'pagina') {
    no.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(bytes)));
    return;
  }
  const ref = refDeTag(f.id);
  if (!ref || !f.stream) return;
  const d: Record<string, unknown> = {};
  for (const [k, v] of f.stream.dict.entries()) {
    const n = k.decodeText();
    if (n !== 'Filter' && n !== 'DecodeParms' && n !== 'Length' && n !== 'DL') d[n] = v;
  }
  ctx.assign(ref, ctx.flateStream(bytes, d as never));
  void l;
}

// --- renomear spots

/**
 * Muda o nome de spots em todos os espaços de cor do ficheiro (Separation e DeviceN). Duas spots
 * com o mesmo nome passam a ser uma só chapa. Devolve o número de espaços alterados.
 */
export function renomearSpots(pdf: PDFDocument, mapa: Map<string, string>): number {
  let n = 0;
  const nomeNovo = (o: PDFObject | undefined): PDFName | undefined => {
    if (!(o instanceof PDFName)) return undefined;
    const novo = mapa.get(o.decodeText());
    return novo !== undefined ? PDFName.of(novo) : undefined;
  };

  const visitar = (o: PDFObject | undefined, vistos: Set<object>) => {
    if (!o || vistos.has(o)) return;
    if (o instanceof PDFStream) return visitar(o.dict, vistos);
    if (o instanceof PDFArray) {
      vistos.add(o);
      const primeiro = o.get(0);
      if (primeiro instanceof PDFName) {
        const tipo = primeiro.decodeText();
        if (tipo === 'Separation') {
          const novo = nomeNovo(o.get(1));
          if (novo) {
            o.set(1, novo);
            n++;
          }
        } else if (tipo === 'DeviceN') {
          const nomes = pdf.context.lookup(o.get(1));
          if (nomes instanceof PDFArray) {
            let mudou = false;
            for (let i = 0; i < nomes.size(); i++) {
              const novo = nomeNovo(nomes.get(i));
              if (novo) {
                nomes.set(i, novo);
                mudou = true;
              }
            }
            if (mudou) n++;
          }
        }
      }
      for (const x of o.asArray()) if (!(x instanceof PDFRef)) visitar(x, vistos);
      return;
    }
    if (o instanceof PDFDict) {
      vistos.add(o);
      // /Colorants de um DeviceN: as chaves são nomes de tintas
      const atr = pdf.context.lookup(o.get(PDFName.of('Colorants')));
      if (atr instanceof PDFDict) {
        for (const [k, v] of atr.entries()) {
          const novo = mapa.get(k.decodeText());
          if (novo !== undefined) {
            atr.delete(k);
            atr.set(PDFName.of(novo), v);
          }
        }
      }
      for (const [, v] of o.entries()) if (!(v instanceof PDFRef)) visitar(v, vistos);
    }
  };

  const vistos = new Set<object>();
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) visitar(obj, vistos);
  return n;
}
