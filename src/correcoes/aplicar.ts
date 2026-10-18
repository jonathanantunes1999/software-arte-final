import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFStream, type PDFObject } from 'pdf-lib';
import { acharOverprint, type AchadoOverprint } from '../alertas/overprint';
import type { ConfigAlertas } from '../alertas/tipos';
import { lerPaginas } from '../analise/documento';
import { interpretarPagina, type Observacao } from '../analise/interpretador';
import { prepararInspecao } from '../analise/analisador';
import type { Cor } from '../analise/ir';
import { substituirConteudo, usosDosConteudos } from './pdf-util';
import { Leitor } from '../analise/leitor';
import { converterImagensRgb, type ResumoImagensRgb } from './rgb-cmyk';
import { rgbParaCmykPrensa } from '../cores/conversao';
import { gerarSangria, paginasSemSangria, type PedidoSangria, type ResumoSangria } from './sangria';
import { gerarMarcas, paginasSemMarcas, type PedidoMarcas, type ResumoMarcas } from './marcas';
import type { ResumoEdicao } from '../edicao/tipos';
import { refazerMarcas, retirarForaDaSangriaTodas, type ResumoLimpeza, type ResumoRefeitas } from './limpeza';
import { converterTexto, RESUMO_TEXTO_VAZIO, type PedidoTexto, type ResumoTexto } from '../texto/converter';

/**
 * Correções automáticas. Trabalham sobre uma cópia do PDF carregada de novo: o original nunca é
 * alterado, e o resultado é uma sequência de bytes nova para gravar como "nome_corrigido.pdf".
 */

/** Troca uma cor de processo por uma spot (ex.: o magenta 100% de uma linha de corte → "CutContour") */
export interface ConversaoSpot {
  /** C, M, Y, K de 0 a 1 */
  de: [number, number, number, number];
  onde: 'traco' | 'preenchimento' | 'ambos';
  /** Nome da spot nova */
  nome: string;
  /** Cor que a spot tem no ecrã e nos PDFs que não a conhecem (C, M, Y, K de 0 a 1) */
  alternativa: [number, number, number, number];
  /** Liga o overprint nos objetos convertidos (o que a faca e os vincos pedem) */
  overprint: boolean;
}

export interface PedidoCorrecoes {
  /** Desliga o overprint em brancos que desapareceriam */
  overprintBranco: boolean;
  /** Liga o overprint em texto e linhas finas a K 100% sobre cor */
  overprintPreto: boolean;
  /** Liga o overprint em spots técnicas (faca, vincos, verniz...) */
  overprintSpots: boolean;
  /** Muda o nome de spots (junta duplicadas, ou dá nome a uma técnica) */
  renomear: { de: string; para: string }[];
  /** Cores de processo que passam a spots */
  converter: ConversaoSpot[];
  /** Texto em curvas (as fontes que se conseguirem, ou só as escolhidas) */
  textoEmCurvas?: PedidoTexto;
  /** Gera sangria nas páginas que não a têm (espelha a arte junto ao corte) */
  sangria?: PedidoSangria;
  /** Cria marcas de corte nas páginas que não as têm (e, se se pedir, aumenta a página para caberem) */
  marcas?: PedidoMarcas;
  /** Cores e imagens RGB passam a CMYK (conversão simples, sem perfis ICC) */
  rgbParaCmyk?: { vetores: boolean; imagens: boolean };
}

export interface ResumoCorrecoes {
  overprintBranco: number;
  overprintPreto: number;
  overprintSpots: number;
  /** Espaços de cor (Separation/DeviceN) onde se mudou um nome */
  spotsRenomeradas: number;
  /** Operadores de cor trocados por uma spot */
  coresConvertidas: number;
  /** Texto em curvas: o que se converteu e o que ficou como estava */
  texto?: ResumoTexto;
  /** Sangria gerada */
  sangria?: ResumoSangria;
  /** Marcas de corte criadas */
  marcas?: ResumoMarcas;
  /** Edições de objetos (apagar, mover, mudar a cor…) feitas antes das correções */
  edicoes?: ResumoEdicao;
  /** "Limpar o ficheiro": o que se retirou de fora da sangria e as marcas refeitas */
  limpeza?: ResumoLimpeza & { refeitas: ResumoRefeitas };
  /** RGB → CMYK: operadores de cor trocados e imagens convertidas */
  rgb?: { vetores: number; imagens: ResumoImagensRgb | null };
  /** Páginas onde se mexeu no conteúdo (0 = primeira) */
  paginas: number[];
  avisos: string[];
}

export const SEM_CORRECOES: PedidoCorrecoes = { overprintBranco: false, overprintPreto: false, overprintSpots: false, renomear: [], converter: [] };

interface Pintura {
  inicio: number;
  fim: number;
  inicioCaminho?: number;
  OP: boolean;
  op: boolean;
  OPM: 0 | 1;
  preenche: boolean;
  traca: boolean;
  cor?: Cor;
  corTraco?: Cor;
}

interface ObsCor {
  inicio: number;
  fim: number;
  alvo: 'fill' | 'traco';
  cor: Cor;
}

interface FluxoVisto {
  id: string;
  texto: string;
  recursos: PDFDict | undefined;
  stream?: PDFStream;
  pinturas: Map<number, Pintura>;
  cores: Map<number, ObsCor>;
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
  const resumo: ResumoCorrecoes = { overprintBranco: 0, overprintPreto: 0, overprintSpots: 0, spotsRenomeradas: 0, coresConvertidas: 0, paginas: [], avisos: [] };
  const refazer = pedido.marcas?.refazer;
  // primeiro de tudo: o que está fora da sangria sai, para as outras correções não gastarem tempo (nem fazerem contas) com ele
  let limpeza: ResumoLimpeza | null = null;
  if (refazer) {
    limpeza = retirarForaDaSangriaTodas(pdf, Math.max(refazer.sangriaMm, pedido.sangria?.mm ?? 0));
    for (const p of limpeza.paginas) if (!resumo.paginas.includes(p)) resumo.paginas.push(p);
  }

  const querRgb = !!pedido.rgbParaCmyk?.vetores;
  const querOverprint = pedido.overprintBranco || pedido.overprintPreto || pedido.overprintSpots || pedido.converter.length > 0 || querRgb;
  const tintaMax = cfg.tintaTotalMaxPercent > 0 ? cfg.tintaTotalMaxPercent / 100 : 4;
  if (pedido.rgbParaCmyk) resumo.rgb = { vetores: 0, imagens: null };

  if (querOverprint) {
    const c = prepararInspecao(pdf, lerPaginas(pdf));
    const usos = usosDosConteudos(pdf);
    for (let i = 0; i < c.nos.length; i++) corrigirPagina(pdf, c, i, pedido, cfg, resumo, usos);
  }

  if (pedido.rgbParaCmyk?.imagens && resumo.rgb) resumo.rgb.imagens = converterImagensRgb(pdf, tintaMax);

  const mapa = new Map(pedido.renomear.filter((r) => r.de !== r.para && r.para.trim() !== '').map((r) => [r.de, r.para.trim()]));
  if (mapa.size) resumo.spotsRenomeradas = renomearSpots(pdf, mapa);

  if (pedido.textoEmCurvas) {
    resumo.texto = RESUMO_TEXTO_VAZIO();
    converterTexto(pdf, pedido.textoEmCurvas, resumo.texto);
  }

  // por último: depois disto o conteúdo de cada página é só um Form com a página antiga
  if (pedido.sangria && pedido.sangria.mm > 0) {
    const paginas = paginasSemSangria(pdf, { ...cfg, sangriaReferenciaMm: pedido.sangria.mm });
    resumo.sangria = gerarSangria(pdf, pedido.sangria, paginas, usosDosConteudos(pdf));
    for (const p of resumo.sangria.geradas) if (!resumo.paginas.includes(p)) resumo.paginas.push(p);
  }

  // marcas de corte: depois da sangria, que lhes diz até onde vai a arte; só nas páginas sem marcas
  // (ou em todas, recortando à sangria e refazendo-as, se se pediu para limpar o ficheiro)
  if (pedido.marcas && pedido.marcas.comprimentoMm > 0 && refazer && limpeza) {
    const cfgMarcas = { ...cfg, sangriaReferenciaMm: pedido.sangria?.mm ?? cfg.sangriaReferenciaMm };
    const refeitas = refazerMarcas(pdf, pedido.marcas, Math.max(refazer.sangriaMm, pedido.sangria?.mm ?? 0), cfgMarcas, usosDosConteudos(pdf));
    resumo.limpeza = { ...limpeza, refeitas };
    for (const p of refeitas.geradas) if (!resumo.paginas.includes(p)) resumo.paginas.push(p);
    if (refeitas.semTrimBox.length) resumo.avisos.push(`${refeitas.semTrimBox.length} ${refeitas.semTrimBox.length === 1 ? 'página não tem' : 'páginas não têm'} TrimBox, por isso não se sabe onde é o corte e ficaram como estavam. Define a TrimBox no Acrobat ou no Illustrator.`);
  } else if (pedido.marcas && pedido.marcas.comprimentoMm > 0) {
    const cfgMarcas = { ...cfg, sangriaReferenciaMm: pedido.sangria?.mm ?? cfg.sangriaReferenciaMm };
    resumo.marcas = gerarMarcas(pdf, pedido.marcas, paginasSemMarcas(pdf, cfgMarcas), cfgMarcas, usosDosConteudos(pdf));
    for (const p of resumo.marcas.geradas) if (!resumo.paginas.includes(p)) resumo.paginas.push(p);
    if (resumo.marcas.semEspaco.length) resumo.avisos.push(`Sem espaço para as marcas de corte em ${resumo.marcas.semEspaco.length} ${resumo.marcas.semEspaco.length === 1 ? 'página' : 'páginas'}.`);
  }

  return { bytes: await pdf.save({ useObjectStreams: false }), resumo };
}

// --- overprint e conversão de cores, página a página

const iguais = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 0.005);
const ehOperadorCmyk = (texto: string) => /(?:^|[\s\]])(k|K|sc|scn|SC|SCN)$/.test(texto);

interface Troca {
  inicio: number;
  fim: number;
  texto: string;
}

function corrigirPagina(
  pdf: PDFDocument,
  c: ReturnType<typeof prepararInspecao>,
  indice: number,
  pedido: PedidoCorrecoes,
  cfg: ConfigAlertas,
  resumo: ResumoCorrecoes,
  usos: Map<string, number>,
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
        if (!fluxos.has(id)) fluxos.set(id, { id, texto: f.texto, recursos: f.recursos, stream: f.stream, pinturas: new Map(), cores: new Map() });
      },
      operador: (id, inicio, fim, o: Observacao) => {
        const f = fluxos.get(id);
        if (!f) return;
        if (o.tipo === 'cor') {
          if (!f.cores.has(inicio)) f.cores.set(inicio, { inicio, fim, alvo: o.alvo, cor: o.cor });
          return;
        }
        if (o.oculto || f.pinturas.has(inicio)) return;
        f.pinturas.set(inicio, {
          inicio,
          fim,
          inicioCaminho: o.inicioCaminho,
          OP: o.overprintTraco,
          op: o.overprintFill,
          OPM: o.modo,
          preenche: o.preenche,
          traca: o.traca,
          cor: o.cor,
          corTraco: o.corTraco,
        });
      },
      evento: (fluxo, inicio, i) => origem.set(i, { fluxo, inicio }),
    },
  });

  // o que há a fazer em cada pintura: novo estado de overprint
  type Plano = { fluxo: FluxoVisto; pintura: Pintura; novo: { OP: boolean; op: boolean; OPM: 0 | 1 }; feitos: AchadoOverprint[] };
  const planos = new Map<string, Plano>();
  const plano = (f: FluxoVisto, p: Pintura): Plano => {
    const chave = `${f.id}|${p.inicio}`;
    let e = planos.get(chave);
    if (!e) planos.set(chave, (e = { fluxo: f, pintura: p, novo: { OP: p.OP, op: p.op, OPM: p.OPM }, feitos: [] }));
    return e;
  };

  const achados = acharOverprint(ir.eventos, cfg).filter(
    (a) => (a.tipo === 'branco' && pedido.overprintBranco) || ((a.tipo === 'preto-texto' || a.tipo === 'preto-linha') && pedido.overprintPreto) || (a.tipo === 'spot' && pedido.overprintSpots),
  );
  for (const a of achados) {
    const o = origem.get(a.indice);
    const f = o && fluxos.get(o.fluxo);
    const p = o && f?.pinturas.get(o.inicio);
    if (!f || !p) continue;
    const e = plano(f, p);
    e.feitos.push(a);
    const campo = a.parte === 'traço' ? 'OP' : 'op';
    if (a.tipo === 'branco') e.novo[campo] = false;
    else {
      e.novo[campo] = true;
      e.novo.OPM = 1;
    }
  }

  // conversão de cores de processo em spots
  const trocasPorFluxo = new Map<string, Troca[]>();
  const trocar = (f: FluxoVisto, t: Troca) => (trocasPorFluxo.get(f.id) ?? trocasPorFluxo.set(f.id, []).get(f.id)!).push(t);
  const espacosUsados = new Set<number>();
  pedido.converter.forEach((conv, k) => {
    const queroFill = conv.onde !== 'traco';
    const queroTraco = conv.onde !== 'preenchimento';
    const casa = (cor: Cor | undefined) => !!cor && cor.familia === 'CMYK' && iguais(cor.valores, conv.de);
    for (const f of fluxos.values()) {
      for (const o of f.cores.values()) {
        if (!casa(o.cor) || (o.alvo === 'fill' ? !queroFill : !queroTraco)) continue;
        if (!ehOperadorCmyk(f.texto.slice(o.inicio, o.fim))) continue;
        const forte = o.alvo === 'fill';
        trocar(f, { inicio: o.inicio, fim: o.fim, texto: `/${nomeEspaco(k)} ${forte ? 'cs 1 scn' : 'CS 1 SCN'}` });
        espacosUsados.add(k);
        resumo.coresConvertidas++;
      }
      if (conv.overprint) {
        for (const p of f.pinturas.values()) {
          const fillCasa = p.preenche && queroFill && casa(p.cor);
          const tracoCasa = p.traca && queroTraco && casa(p.corTraco);
          if (!fillCasa && !tracoCasa) continue;
          const e = plano(f, p);
          if (fillCasa) e.novo.op = true;
          if (tracoCasa) e.novo.OP = true;
          e.novo.OPM = 1;
        }
      }
    }
  });

  // RGB → CMYK: cada operador de cor RGB passa a `c m y k k` (ou `K`, nos traços)
  if (pedido.rgbParaCmyk?.vetores && resumo.rgb) {
    const tintaMax = cfg.tintaTotalMaxPercent > 0 ? cfg.tintaTotalMaxPercent / 100 : 4;
    const n = (v: number) => String(Math.round(v * 1000) / 1000);
    for (const f of fluxos.values()) {
      for (const o of f.cores.values()) {
        if (o.cor.familia !== 'RGB' || o.cor.valores.length !== 3) continue;
        // só operadores de cor com operandos numéricos: `cs` e `CS` não entram (não trazem cor)
        if (!/(?:^|[\s\]])(rg|RG|sc|SC|scn|SCN)$/.test(f.texto.slice(o.inicio, o.fim))) continue;
        // 3 milésimas de folga: os valores escrevem-se com 3 casas e o arredondamento não pode passar o limite
        const [c, m, y, k] = rgbParaCmykPrensa(o.cor.valores[0], o.cor.valores[1], o.cor.valores[2], tintaMax - 0.003);
        trocar(f, { inicio: o.inicio, fim: o.fim, texto: `${n(c)} ${n(m)} ${n(y)} ${n(k)} ${o.alvo === 'fill' ? 'k' : 'K'}` });
        resumo.rgb.vetores++;
      }
    }
  }

  // estados de overprint: antes da pintura põe-se o novo, depois repõe-se o que lá estava
  const estadosUsados = new Set<string>();
  for (const e of planos.values()) {
    const p = e.pintura;
    if (e.novo.OP === p.OP && e.novo.op === p.op && e.novo.OPM === p.OPM) continue;
    estadosUsados.add(`${e.novo.OP}|${e.novo.op}|${e.novo.OPM}`).add(`${p.OP}|${p.op}|${p.OPM}`);
    trocar(e.fluxo, { inicio: p.inicioCaminho ?? p.inicio, fim: p.inicioCaminho ?? p.inicio, texto: `/${nomeGs(e.novo.OP, e.novo.op, e.novo.OPM)} gs ` });
    trocar(e.fluxo, { inicio: p.fim, fim: p.fim, texto: ` /${nomeGs(p.OP, p.op, p.OPM)} gs` });
    for (const a of e.feitos) {
      if (a.tipo === 'branco') resumo.overprintBranco++;
      else if (a.tipo === 'spot') resumo.overprintSpots++;
      else resumo.overprintPreto++;
    }
  }

  for (const [id, trocas] of trocasPorFluxo) {
    const f = fluxos.get(id)!;
    trocas.sort((a, b) => a.inicio - b.inicio || a.fim - b.fim);
    let saida = '';
    let pos = 0;
    for (const t of trocas) {
      if (t.inicio < pos) continue;
      saida += f.texto.slice(pos, t.inicio) + t.texto;
      pos = t.fim;
    }
    saida += f.texto.slice(pos);
    gravarFluxo(pdf, c.nos[indice].node, f, saida, usos);
    if (!resumo.paginas.includes(indice)) resumo.paginas.push(indice);

    // recursos novos: estados gráficos e espaços de cor
    const recursos = f.recursos ?? criarRecursosDaPagina(ctx, c.nos[indice].node);
    if (estadosUsados.size) {
      const gs = subDicionario(ctx, recursos, 'ExtGState');
      for (const chave of estadosUsados) {
        const [OP, op, OPM] = chave.split('|');
        const nome = nomeGs(OP === 'true', op === 'true', parseInt(OPM, 10));
        if (!gs.has(PDFName.of(nome))) gs.set(PDFName.of(nome), ctx.obj({ Type: 'ExtGState', OP: OP === 'true', op: op === 'true', OPM: parseInt(OPM, 10) }));
      }
    }
    if (espacosUsados.size) {
      const cs = subDicionario(ctx, recursos, 'ColorSpace');
      for (const k of espacosUsados) {
        const nome = nomeEspaco(k);
        if (cs.has(PDFName.of(nome))) continue;
        const conv = pedido.converter[k];
        const funcao = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: conv.alternativa, N: 1 }));
        cs.set(PDFName.of(nome), ctx.obj(['Separation', conv.nome, 'DeviceCMYK', funcao] as never));
      }
    }
  }
}

const nomeEspaco = (k: number) => `ArtSp${k}`;

function subDicionario(ctx: PDFDocument['context'], recursos: PDFDict, chave: string): PDFDict {
  const existente = ctx.lookup(recursos.get(PDFName.of(chave)));
  if (existente instanceof PDFDict) return existente;
  const novo = ctx.obj({}) as PDFDict;
  recursos.set(PDFName.of(chave), novo);
  return novo;
}

function criarRecursosDaPagina(ctx: PDFDocument['context'], no: { set(k: PDFName, v: PDFObject): void }): PDFDict {
  const r = ctx.obj({}) as PDFDict;
  no.set(PDFName.of('Resources'), r);
  return r;
}

/** Grava o conteúdo novo de um fluxo: o da página fica num só stream; o de um Form substitui o stream do Form */
function gravarFluxo(pdf: PDFDocument, no: PDFDict, f: FluxoVisto, texto: string, usos: Map<string, number>) {
  const ctx = pdf.context;
  const bytes = paraBytes(texto);
  if (f.id === 'pagina') {
    substituirConteudo(pdf, no, bytes, usos);
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
