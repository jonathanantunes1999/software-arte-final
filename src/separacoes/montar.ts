import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFObjectCopier,
  PDFPage,
  PDFPageLeaf,
  PDFRef,
  PDFStream,
  type PDFObject,
} from 'pdf-lib';
import { opcoesInspecao, type ContextoInspecao } from '../analise/analisador';
import { resolverEspaco } from '../analise/cores';
import type { Cor } from '../analise/ir';
import { corDaImagem, interpretarPagina, type Observacao } from '../analise/interpretador';
import type { Leitor } from '../analise/leitor';
import { lerDegrade, tintaDoFundo, tintasDoDegrade, AMOSTRAS, type DegradeLido } from './degrades';
import { ehImagemCinzento, separarImagem, type PlanosImagem } from './imagens';
import { corDeSpotPorOmissao, idSpot, PLACAS_PROCESSO, spotsDaCor, type Placa } from './placas';
import { contagensVazias, reescreverFluxo, RegistoAlfa, type Contagens, type Registo } from './reescrever';

/**
 * Monta um PDF só com as placas de uma página: cada página do PDF novo é uma placa, desenhada
 * em tons de cinzento (0 = tinta a 100%) com o overprint simulado por opacidades.
 * O PDF original não é tocado: tudo o que se cria é novo, e só o resultado é copiado para o documento de saída.
 */

export interface ResultadoSeparacao {
  /** PDF com uma página por placa, pela ordem de `placas` */
  bytes: Uint8Array;
  placas: Placa[];
  /** O que não ficou separado (ver Contagens) */
  avisos: Contagens;
}

interface FluxoVisto {
  id: string;
  texto: string;
  recursos: PDFDict | undefined;
  stream?: PDFStream;
  registos: Registo[];
}

const CHAVES_PAGINA = ['MediaBox', 'CropBox', 'BleedBox', 'TrimBox', 'ArtBox', 'Rotate', 'UserUnit', 'Group'];

/** Placas que a página usa: as de processo e as spots que alguma pintura visível usa */
export function placasDaPagina(fluxos: Iterable<FluxoVisto>, extras: Cor[] = []): Placa[] {
  const spots = new Map<string, Placa>();
  const ver = (cor: Cor | undefined) => {
    for (const nome of spotsDaCor(cor)) {
      if (!spots.has(nome)) spots.set(nome, { id: idSpot(nome), tipo: 'spot', nome, rgb: cor!.amostra ?? corDeSpotPorOmissao(spots.size) });
    }
  };
  for (const f of fluxos) {
    for (const r of f.registos) {
      const o = r.o;
      if (o.tipo === 'pintar' && !o.oculto) {
        if (o.preenche) ver(o.cor);
        if (o.traca) ver(o.corTraco);
      }
    }
  }
  for (const c of extras) ver(c);
  return [...PLACAS_PROCESSO, ...spots.values()];
}

export async function separarPagina(
  c: ContextoInspecao,
  indice: number,
  ocgOcultos: Set<string>,
  simularOverprint: boolean,
): Promise<ResultadoSeparacao> {
  const ctx = c.pdf.context;
  const l = c.l;
  const fluxos = new Map<string, FluxoVisto>();

  interpretarPagina(l, c.nos[indice].node, {
    ...opcoesInspecao(c, indice, ocgOcultos),
    observador: {
      fluxo: (id, f) => {
        if (!fluxos.has(id)) fluxos.set(id, { id, texto: f.texto, recursos: f.recursos, stream: f.stream, registos: [] });
      },
      operador: (id, inicio, fim, o: Observacao) => fluxos.get(id)?.registos.push({ inicio, fim, o }),
    },
  });

  const placas = placasDaPagina(fluxos.values(), coresDeRecursos(l, [...fluxos.values()]));
  const avisos = contagensVazias();
  const imagens = new ImagensPorPlaca(c, placas);
  const degrades = new DegradesPorPlaca(c);
  const no = c.nos[indice].node;
  const out = await PDFDocument.create();
  const copiador = PDFObjectCopier.for(ctx, out.context);

  /** Registos do fluxo e dos Forms que herdam os seus recursos (não têm /Resources próprios), cada um com o fluxo a que pertence */
  const registosComHerdeiros = (f: FluxoVisto, vistos = new Set<string>()): { dono: FluxoVisto; r: Registo }[] => {
    const lista = f.registos.map((r) => ({ dono: f, r }));
    vistos.add(f.id);
    for (const r of f.registos) {
      const o = r.o;
      if (o.tipo !== 'pintar' || o.objeto !== 'form' || o.oculto || !o.recurso) continue;
      const bruto = l.dict(f.recursos?.get(PDFName.of('XObject')))?.get(PDFName.of(o.recurso));
      const filho = bruto instanceof PDFRef ? fluxos.get(bruto.tag) : undefined;
      if (filho && !vistos.has(filho.id) && filho.stream && !filho.stream.dict.has(PDFName.of('Resources'))) lista.push(...registosComHerdeiros(filho, vistos));
    }
    return lista;
  };

  for (const placa of placas) {
    const alfa = new RegistoAlfa();
    const contagens = contagensVazias();
    const formsFeitos = new Map<string, PDFRef>();
    /** Dicionários de estados gráficos que criámos: recebem no fim as opacidades que a placa usou */
    const pendentesGs: PDFDict[] = [];
    const opcoesDe = (f: FluxoVisto, eDaPagina: boolean) => ({
      placa,
      simularOverprint,
      alfa,
      contagens,
      eDaPagina,
      imagem: (nome: string) => imagens.suportada(f, nome),
      degrade: (nome: string) => degrades.cor(f, 'Shading', nome),
      padrao: (nome: string) => degrades.cor(f, 'Pattern', nome),
    });

    /** Dicionário de recursos de um fluxo, só com o que a placa precisa */
    const recursosDaPlaca = (f: FluxoVisto): PDFDict | undefined => {
      const orig = f.recursos;
      if (!orig) return undefined;
      const novo = ctx.obj({}) as PDFDict;
      for (const chave of ['Font', 'Properties', 'ProcSet']) {
        const v = orig.get(PDFName.of(chave));
        if (v) novo.set(PDFName.of(chave), v);
      }
      // estados gráficos: os originais mais os de opacidade (preenchidos no fim, quando se sabem todos)
      const gsOrig = l.dict(orig.get(PDFName.of('ExtGState')));
      const gs = ctx.obj({}) as PDFDict;
      if (gsOrig) for (const [k, v] of gsOrig.entries()) gs.set(k, v);
      novo.set(PDFName.of('ExtGState'), gs);
      pendentesGs.push(gs);

      // XObjects: os Forms visitados (versão da placa), as máscaras de 1 bit e as imagens (o plano da placa)
      const xo = ctx.obj({}) as PDFDict;
      const shadings = ctx.obj({}) as PDFDict;
      const padroes = ctx.obj({}) as PDFDict;
      for (const { dono, r } of registosComHerdeiros(f)) {
        const o = r.o;
        if (o.tipo === 'cor') {
          const nomePadrao = o.cor.familia === 'Pattern' ? o.cor.nomes?.[0] : undefined;
          const p = nomePadrao ? degrades.daPlaca(dono, 'Pattern', nomePadrao, placa) : undefined;
          if (nomePadrao && p) padroes.set(PDFName.of(nomePadrao), p);
          continue;
        }
        if (o.tipo === 'pintar' && o.objeto === 'shading' && !o.oculto && o.recurso) {
          const sh = degrades.daPlaca(dono, 'Shading', o.recurso, placa);
          if (sh) shadings.set(PDFName.of(o.recurso), sh);
          continue;
        }
        if (o.tipo !== 'pintar' || o.oculto || !o.recurso) continue;
        const bruto = imagens.xobjeto(dono, o.recurso);
        if (!bruto) continue;
        if (o.objeto === 'form' && bruto instanceof PDFRef) {
          const filho = formDaPlaca(bruto.tag);
          if (filho) xo.set(PDFName.of(o.recurso), filho);
        } else if (o.objeto === 'imagem' && o.mascara) {
          xo.set(PDFName.of(o.recurso), bruto);
        } else if (o.objeto === 'imagem') {
          const img = imagens.daPlaca(dono, o.recurso, placa);
          if (img) xo.set(PDFName.of(o.recurso), img);
        }
      }
      novo.set(PDFName.of('XObject'), xo);
      novo.set(PDFName.of('Shading'), shadings);
      novo.set(PDFName.of('Pattern'), padroes);
      return novo;
    };

    const formDaPlaca = (tag: string): PDFRef | undefined => {
      const feito = formsFeitos.get(tag);
      if (feito) return feito;
      const f = fluxos.get(tag);
      if (!f || !f.stream) return undefined;
      // reserva a referência antes de descer (um Form que se chame a si próprio não entra em ciclo)
      const novoRef = ctx.register(ctx.stream(new Uint8Array(0)));
      formsFeitos.set(tag, novoRef);
      const texto = reescreverFluxo(f.texto, f.registos, opcoesDe(f, false));
      const d: Record<string, unknown> = {};
      for (const [k, v] of f.stream.dict.entries()) {
        const nome = k.decodeText();
        if (nome === 'Filter' || nome === 'DecodeParms' || nome === 'Length' || nome === 'Resources' || nome === 'DL') continue;
        d[nome] = v;
      }
      const rec = f.stream.dict.get(PDFName.of('Resources')) ? recursosDaPlaca(f) : undefined;
      if (rec) d.Resources = rec;
      d.Type = PDFName.of('XObject');
      d.Subtype = PDFName.of('Form');
      ctx.assign(novoRef, ctx.flateStream(paraBytes(texto), d as never));
      return novoRef;
    };

    const pagina = fluxos.get('pagina')!;
    const textoPagina = reescreverFluxo(pagina.texto, pagina.registos, opcoesDe(pagina, true));
    const recursos = recursosDaPlaca(pagina)!;

    // acrescenta as opacidades a todos os dicionários de estados gráficos que se criaram
    for (const e of alfa.entradas()) {
      const dict = ctx.obj({ Type: 'ExtGState', ca: e.ca, CA: e.CA }) as PDFDict;
      for (const gs of pendentesGs) gs.set(PDFName.of(e.nome), dict);
    }

    const conteudo = ctx.register(ctx.flateStream(paraBytes(textoPagina)));
    const mapa = new Map<PDFName, PDFObject>();
    mapa.set(PDFName.of('Type'), PDFName.of('Page'));
    for (const chave of CHAVES_PAGINA) {
      const v = no.getInheritableAttribute(PDFName.of(chave)) ?? no.get(PDFName.of(chave));
      if (v) mapa.set(PDFName.of(chave), v);
    }
    mapa.set(PDFName.of('Resources'), recursos);
    mapa.set(PDFName.of('Contents'), conteudo);
    const folha = PDFPageLeaf.fromMapWithContext(mapa, ctx, false);

    const copiada = copiador.copy(folha) as PDFPageLeaf;
    const refCopiada = out.context.register(copiada);
    out.addPage(PDFPage.of(copiada, refCopiada, out));

    avisos.imagens = Math.max(avisos.imagens, contagens.imagens);
    for (const m of contagens.motivos) if (!avisos.motivos.includes(m)) avisos.motivos.push(m);
    avisos.degrades = Math.max(avisos.degrades, contagens.degrades);
    for (const m of contagens.motivosDegrades) if (!avisos.motivosDegrades.includes(m)) avisos.motivosDegrades.push(m);
    avisos.padroes = Math.max(avisos.padroes, contagens.padroes);
    avisos.ambiguos = Math.max(avisos.ambiguos, contagens.ambiguos);
  }

  return { bytes: await out.save(), placas, avisos };
}

/** Cores (spots) usadas por imagens e degradés visíveis: só se descobrem olhando para os recursos */
function coresDeRecursos(l: Leitor, fluxos: FluxoVisto[]): Cor[] {
  const cores: Cor[] = [];
  const espacoDe = (f: FluxoVisto, cs: PDFObject | undefined) => (cs ? corDaImagem(resolverEspaco(l, cs, f.recursos)) : undefined);
  for (const f of fluxos) {
    const recursos = (categoria: string, nome: string) => l.dict(f.recursos?.get(PDFName.of(categoria)))?.get(PDFName.of(nome));
    for (const r of f.registos) {
      const o = r.o;
      let cor: Cor | undefined;
      if (o.tipo === 'cor' && o.cor.familia === 'Pattern' && o.cor.nomes?.[0]) {
        const p = l.dict(recursos('Pattern', o.cor.nomes[0]));
        cor = espacoDe(f, l.dict(l.get(p, 'Shading'))?.get(PDFName.of('ColorSpace')));
      } else if (o.tipo === 'pintar' && !o.oculto && o.recurso) {
        if (o.objeto === 'imagem' && !o.mascara) cor = espacoDe(f, l.dict(recursos('XObject', o.recurso))?.get(PDFName.of('ColorSpace')));
        else if (o.objeto === 'shading') cor = espacoDe(f, l.dict(recursos('Shading', o.recurso))?.get(PDFName.of('ColorSpace')));
      }
      if (cor) cores.push(cor);
    }
  }
  return cores;
}

/**
 * As imagens da página, separadas uma só vez; cada placa recebe uma imagem de cinzentos com a sua tinta.
 * Imagens em cinzento mantêm-se tal como são na placa K (e ficam brancas nas outras).
 */
class ImagensPorPlaca {
  private planos = new Map<string, { tipo: 'cinzento' } | { tipo: 'planos'; planos: PlanosImagem } | { tipo: 'erro'; motivo: string }>();
  private feitas = new Map<string, PDFObject>();
  private l: Leitor;

  constructor(
    private c: ContextoInspecao,
    private placas: Placa[],
  ) {
    this.l = c.l;
  }

  /** O objeto do XObject com este nome nos recursos do fluxo (a referência, se for indireto) */
  xobjeto(f: FluxoVisto, nome: string): PDFObject | undefined {
    return this.l.dict(f.recursos?.get(PDFName.of('XObject')))?.get(PDFName.of(nome));
  }

  private plano(f: FluxoVisto, nome: string) {
    const bruto = this.xobjeto(f, nome);
    const xo = this.l.stream(bruto);
    if (!xo) return { tipo: 'erro' as const, motivo: 'imagem em falta' };
    const chave = bruto instanceof PDFRef ? bruto.tag : `${f.id}:${nome}`;
    let p = this.planos.get(chave);
    if (!p) {
      if (ehImagemCinzento(this.l, xo, f.recursos)) p = { tipo: 'cinzento' };
      else {
        const r = separarImagem(this.l, xo, f.recursos, this.placas);
        p = 'ok' in r ? { tipo: 'planos', planos: r.ok } : { tipo: 'erro', motivo: r.erro };
      }
      this.planos.set(chave, p);
    }
    return p;
  }

  /** Tem separação? `true` ou o motivo por que não */
  suportada(f: FluxoVisto, nome: string): true | string {
    const p = this.plano(f, nome);
    return p.tipo === 'erro' ? p.motivo : true;
  }

  /** Imagem de 1×1 pixel branca, com as mesmas máscaras da original: apaga o que está por baixo onde a imagem é opaca */
  private branca(xo: PDFStream): PDFRef {
    return this.c.pdf.context.register(this.c.pdf.context.flateStream(new Uint8Array([255]), this.dicionario(xo, 1, 1) as never));
  }

  private dicionario(xo: PDFStream, largura: number, altura: number): Record<string, unknown> {
    const d: Record<string, unknown> = { Type: 'XObject', Subtype: 'Image', Width: largura, Height: altura, ColorSpace: 'DeviceGray', BitsPerComponent: 8 };
    for (const k of ['SMask', 'Mask']) {
      const v = xo.dict.get(PDFName.of(k));
      // /Mask pode ser uma lista de cores (chave) em vez de uma imagem: essa não serve num cinzento
      if (v && (k === 'SMask' || this.l.stream(v))) d[k] = v;
    }
    return d;
  }

  daPlaca(f: FluxoVisto, nome: string, placa: Placa): PDFObject | undefined {
    const bruto = this.xobjeto(f, nome);
    const xo = this.l.stream(bruto);
    const p = this.plano(f, nome);
    if (!xo || !bruto || p.tipo === 'erro') return undefined;
    const chave = `${bruto instanceof PDFRef ? bruto.tag : `${f.id}:${nome}`}|${placa.id}`;
    const feita = this.feitas.get(chave);
    if (feita) return feita;

    let r: PDFObject;
    if (p.tipo === 'cinzento') r = placa.id === 'K' ? bruto : this.branca(xo);
    else {
      const plano = p.planos.planos.get(placa.id);
      if (!plano) r = this.branca(xo);
      else {
        const bytes = new Uint8Array(plano.length);
        for (let i = 0; i < plano.length; i++) bytes[i] = 255 - plano[i];
        const ctx = this.c.pdf.context;
        r = ctx.register(ctx.flateStream(bytes, this.dicionario(xo, p.planos.largura, p.planos.altura) as never));
      }
    }
    this.feitas.set(chave, r);
    return r;
  }
}

/**
 * Degradés (`sh`) e padrões de degradé (`scn`) da página. Cada placa recebe uma versão do degradé
 * em cinzentos que representa a tinta dessa placa.
 */
class DegradesPorPlaca {
  private lidos = new Map<string, { ok: DegradeLido; dict: PDFDict } | { erro: string }>();
  private feitos = new Map<string, PDFObject>();
  private l: Leitor;

  constructor(private c: ContextoInspecao) {
    this.l = c.l;
  }

  private bruto(f: FluxoVisto, categoria: 'Shading' | 'Pattern', nome: string): PDFObject | undefined {
    return this.l.dict(f.recursos?.get(PDFName.of(categoria)))?.get(PDFName.of(nome));
  }

  private ler(f: FluxoVisto, categoria: 'Shading' | 'Pattern', nome: string) {
    const bruto = this.bruto(f, categoria, nome);
    const chave = `${categoria}|${bruto instanceof PDFRef ? bruto.tag : `${f.id}:${nome}`}`;
    let r = this.lidos.get(chave);
    if (!r) {
      let shading: PDFObject | undefined = bruto;
      let erro: string | undefined;
      if (categoria === 'Pattern') {
        const p = this.l.res(bruto);
        const tipo = p ? this.l.num(this.l.get(this.l.dict(p), 'PatternType')) : undefined;
        if (!p) erro = 'padrão em falta';
        else if (tipo !== 2 || this.l.stream(p)) erro = 'padrão de mosaico';
        else shading = this.l.get(this.l.dict(p), 'Shading');
      }
      if (erro) r = { erro };
      else {
        const dg = lerDegrade(this.l, shading, f.recursos);
        const dict = this.l.dict(shading);
        r = 'ok' in dg && dict ? { ok: dg.ok, dict } : { erro: 'erro' in dg ? dg.erro : 'degradé em falta' };
      }
      this.lidos.set(chave, r);
    }
    return r;
  }

  /** A cor que representa o degradé (para o overprint), ou o motivo por que não se separa */
  cor(f: FluxoVisto, categoria: 'Shading' | 'Pattern', nome: string): Cor | string {
    const r = this.ler(f, categoria, nome);
    return 'ok' in r ? r.ok.corSintetica : r.erro;
  }

  /** O objeto (shading ou padrão) desta placa, para pôr nos recursos */
  daPlaca(f: FluxoVisto, categoria: 'Shading' | 'Pattern', nome: string, placa: Placa): PDFObject | undefined {
    const r = this.ler(f, categoria, nome);
    if (!('ok' in r)) return undefined;
    const bruto = this.bruto(f, categoria, nome);
    const chave = `${categoria}|${bruto instanceof PDFRef ? bruto.tag : `${f.id}:${nome}`}|${placa.id}`;
    const feito = this.feitos.get(chave);
    if (feito) return feito;

    const ctx = this.c.pdf.context;
    const shading = ctx.obj({}) as PDFDict;
    for (const [k, v] of r.dict.entries()) {
      const n = k.decodeText();
      if (n !== 'ColorSpace' && n !== 'Function' && n !== 'Background') shading.set(k, v);
    }
    shading.set(PDFName.of('ColorSpace'), PDFName.of('DeviceGray'));
    const bytes = tintasDoDegrade(r.ok, placa).map((t) => 255 - t);
    const funcao = ctx.register(
      ctx.stream(bytes, { FunctionType: 0, Domain: r.ok.dominio, Range: [0, 1], Size: [AMOSTRAS], BitsPerSample: 8 } as never),
    );
    shading.set(PDFName.of('Function'), funcao);
    const fundo = tintaDoFundo(this.l, r.dict, r.ok, placa);
    if (fundo !== undefined) shading.set(PDFName.of('Background'), ctx.obj([1 - fundo] as never));

    let resultado: PDFObject = shading;
    if (categoria === 'Pattern') {
      const padrao = ctx.obj({}) as PDFDict;
      for (const [k, v] of (this.l.dict(bruto) as PDFDict).entries()) if (k.decodeText() !== 'Shading') padrao.set(k, v);
      padrao.set(PDFName.of('Shading'), shading);
      resultado = padrao;
    }
    this.feitos.set(chave, resultado);
    return resultado;
  }
}

function paraBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
  return b;
}
