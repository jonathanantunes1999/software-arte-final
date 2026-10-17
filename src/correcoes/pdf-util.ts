import { PDFArray, PDFDocument, PDFName, PDFRef, type PDFDict, type PDFPageLeaf } from 'pdf-lib';
import type { Caixa } from '../analise/caixas';
import { Leitor } from '../analise/leitor';

function refsDoConteudo(no: PDFDict): PDFRef[] {
  const c = no.get(PDFName.of('Contents'));
  if (c instanceof PDFRef) return [c];
  if (c instanceof PDFArray) return c.asArray().filter((x): x is PDFRef => x instanceof PDFRef);
  return [];
}

/** Quantas páginas usam cada stream de conteúdo (para só apagar os que ninguém mais usa) */
export function usosDosConteudos(pdf: PDFDocument): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pdf.getPages()) for (const r of refsDoConteudo(p.node)) m.set(r.tag, (m.get(r.tag) ?? 0) + 1);
  return m;
}

/**
 * Substitui o conteúdo de uma página por um stream novo e apaga os antigos, se mais nenhuma página os
 * usa. O pdf-lib grava tudo o que está no documento, mesmo sem referências: sem isto, o ficheiro
 * levaria o conteúdo antigo às costas.
 */
export function substituirConteudo(pdf: PDFDocument, no: PDFDict, bytes: Uint8Array, usos: Map<string, number>): PDFRef {
  const ctx = pdf.context;
  const antigos = refsDoConteudo(no);
  const novo = ctx.register(ctx.flateStream(bytes));
  no.set(PDFName.of('Contents'), novo);
  for (const r of antigos) {
    const n = (usos.get(r.tag) ?? 1) - 1;
    usos.set(r.tag, n);
    if (n <= 0) ctx.delete(r);
  }
  usos.set(novo.tag, 1);
  return novo;
}

const paraBytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);

/**
 * Põe o conteúdo atual da página num Form XObject (a arte não é tocada; a área visível era `bbox`) e
 * deixa a página só com `depois(nomeDoForm)`. É a forma segura de acrescentar coisas a uma página
 * qualquer: um conteúdo que deixe a pilha gráfica ou a matriz em desordem não afeta o que se desenha a seguir.
 * Devolve o dicionário de recursos novo da página, para quem quiser juntar-lhe mais (espaços de cor, etc.).
 */
export function embrulharPagina(pdf: PDFDocument, no: PDFPageLeaf, bbox: Caixa, nomeForm: string, depois: (nomeForm: string) => string, usos: Map<string, number>): PDFDict {
  const ctx = pdf.context;
  const l = new Leitor(ctx);
  const bruto = no.get(PDFName.of('Contents'));
  const lista = l.arr(bruto) ? l.itens(bruto) : [bruto];
  const partes = lista.map((c) => l.stream(c)).filter((x): x is NonNullable<typeof x> => !!x).map((st) => l.bytes(st));
  const junto = new Uint8Array(partes.reduce((n, p) => n + p.length + 1, 0));
  let o = 0;
  for (const p of partes) {
    junto.set(p, o);
    o += p.length;
    junto[o++] = 10;
  }
  const recursos = no.getInheritableAttribute(PDFName.of('Resources'));
  const dictForm: Record<string, unknown> = { Type: 'XObject', Subtype: 'Form', BBox: ctx.obj([bbox.x0, bbox.y0, bbox.x1, bbox.y1]) };
  if (recursos) dictForm.Resources = recursos;
  const form = ctx.register(ctx.flateStream(junto, dictForm as never));

  const xobjs = ctx.obj({}) as PDFDict;
  xobjs.set(PDFName.of(nomeForm), form);
  const res = ctx.obj({}) as PDFDict;
  res.set(PDFName.of('XObject'), xobjs);
  no.set(PDFName.of('Resources'), res);
  substituirConteudo(pdf, no, paraBytes(depois(nomeForm)), usos);
  return res;
}

/**
 * Acrescenta texto de conteúdo ao fim do que a página já desenha (sem embrulhar). Só para páginas cujo
 * conteúdo é nosso e está equilibrado (as da sangria automática). Devolve os recursos da página.
 */
export function acrescentarAoConteudo(pdf: PDFDocument, no: PDFPageLeaf, extra: string, usos: Map<string, number>): PDFDict {
  const l = new Leitor(pdf.context);
  const bruto = no.get(PDFName.of('Contents'));
  const lista = l.arr(bruto) ? l.itens(bruto) : [bruto];
  const partes = lista.map((c) => l.stream(c)).filter((x): x is NonNullable<typeof x> => !!x).map((st) => l.bytes(st));
  const novo = paraBytes(`\n${extra}`);
  const junto = new Uint8Array(partes.reduce((n, p) => n + p.length + 1, 0) + novo.length);
  let o = 0;
  for (const p of partes) {
    junto.set(p, o);
    o += p.length;
    junto[o++] = 10;
  }
  junto.set(novo, o);
  substituirConteudo(pdf, no, junto, usos);
  return no.Resources() as PDFDict;
}
