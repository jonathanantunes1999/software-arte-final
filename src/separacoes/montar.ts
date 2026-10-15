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
  const no = c.nos[indice].node;
  const out = await PDFDocument.create();
  const copiador = PDFObjectCopier.for(ctx, out.context);

  for (const placa of placas) {
    const alfa = new RegistoAlfa();
    const contagens = contagensVazias();
    const formsFeitos = new Map<string, PDFRef>();
    /** Dicionários de estados gráficos que criámos: recebem no fim as opacidades que a placa usou */
    const pendentesGs: PDFDict[] = [];

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

      // XObjects: só os Forms visitados (versão da placa) e as máscaras de 1 bit
      const xo = ctx.obj({}) as PDFDict;
      const xoOrig = l.dict(orig.get(PDFName.of('XObject')));
      for (const r of f.registos) {
        const o = r.o;
        if (o.tipo !== 'pintar' || o.oculto || !o.recurso || !xoOrig) continue;
        const bruto = xoOrig.get(PDFName.of(o.recurso));
        if (o.objeto === 'form' && bruto instanceof PDFRef) {
          const filho = formDaPlaca(bruto.tag);
          if (filho) xo.set(PDFName.of(o.recurso), filho);
        } else if (o.objeto === 'imagem' && o.mascara && bruto) {
          xo.set(PDFName.of(o.recurso), bruto);
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
      const texto = reescreverFluxo(f.texto, f.registos, { placa, simularOverprint, alfa, contagens, eDaPagina: false });
      const d = ctx.obj({}) as PDFDict;
      for (const [k, v] of f.stream.dict.entries()) {
        const nome = k.decodeText();
        if (nome === 'Filter' || nome === 'DecodeParms' || nome === 'Length' || nome === 'Resources' || nome === 'DL') continue;
        d.set(k, v);
      }
      // reserva a referência antes de descer (um Form que se chame a si próprio não entra em ciclo)
      const novoRef = ctx.register(ctx.stream(new Uint8Array(0)));
      formsFeitos.set(tag, novoRef);
      const rec = f.stream.dict.get(PDFName.of('Resources')) ? recursosDaPlaca(f) : undefined;
      if (rec) d.set(PDFName.of('Resources'), rec);
      d.set(PDFName.of('Type'), PDFName.of('XObject'));
      d.set(PDFName.of('Subtype'), PDFName.of('Form'));
      const bytes = paraBytes(texto);
      ctx.assign(novoRef, ctx.flateStream(bytes, Object.fromEntries([...d.entries()].map(([k, v]) => [k.decodeText(), v])) as never));
      return novoRef;
    };

    const pagina = fluxos.get('pagina')!;
    const textoPagina = reescreverFluxo(pagina.texto, pagina.registos, { placa, simularOverprint, alfa, contagens, eDaPagina: true });
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
    avisos.degrades = Math.max(avisos.degrades, contagens.degrades);
    avisos.padroes = Math.max(avisos.padroes, contagens.padroes);
    avisos.ambiguos = Math.max(avisos.ambiguos, contagens.ambiguos);
  }

  return { bytes: await out.save(), placas, avisos };
}

function paraBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
  return b;
}
