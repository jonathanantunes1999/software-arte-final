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
import type { Cor } from '../analise/ir';
import { interpretarPagina, type Observacao } from '../analise/interpretador';
import type { Leitor } from '../analise/leitor';
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
export function placasDaPagina(fluxos: Iterable<FluxoVisto>): Placa[] {
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

  const placas = placasDaPagina(fluxos.values());
  const avisos = contagensVazias();
  const imagens = new ImagensPorPlaca(c, placas);
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
      for (const { dono, r } of registosComHerdeiros(f)) {
        const o = r.o;
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
    avisos.padroes = Math.max(avisos.padroes, contagens.padroes);
    avisos.ambiguos = Math.max(avisos.ambiguos, contagens.ambiguos);
  }

  return { bytes: await out.save(), placas, avisos };
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

function paraBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
  return b;
}
