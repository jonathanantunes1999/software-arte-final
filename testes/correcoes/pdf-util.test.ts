import { PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { substituirConteudo, usosDosConteudos } from '../../src/correcoes/pdf-util';

const texto = (doc: PDFDocument, ref: unknown) => String.fromCharCode(...decodePDFRawStream(doc.context.lookup(ref as PDFRef) as PDFRawStream).decode());
const bytes = (s: string) => new TextEncoder().encode(s);
const streams = (doc: PDFDocument) => [...doc.context.enumerateIndirectObjects()].filter(([, o]) => o instanceof PDFStream);

async function doc(paginas: number, partilhado = false) {
  const d = await PDFDocument.create();
  const ctx = d.context;
  const comum = ctx.register(ctx.stream('0 0 1 1 re f'));
  for (let i = 0; i < paginas; i++) {
    const p = d.addPage([100, 100]);
    p.node.set(PDFName.of('Contents'), partilhado ? comum : ctx.register(ctx.stream(`${i} 0 5 5 re f`)));
  }
  return d;
}

describe('substituir o conteúdo de uma página', () => {
  it('o stream novo fica na página e o antigo deixa de existir no documento', async () => {
    const d = await doc(1);
    const antigo = d.getPages()[0].node.get(PDFName.of('Contents')) as PDFRef;
    const n = streams(d).length;
    const usos = usosDosConteudos(d);
    const novo = substituirConteudo(d, d.getPages()[0].node, bytes('1 g'), usos);
    expect(texto(d, novo)).toBe('1 g');
    expect(d.getPages()[0].node.get(PDFName.of('Contents'))).toBe(novo);
    expect(d.context.lookup(antigo)).toBeUndefined();
    expect(streams(d).length).toBe(n); // um saiu, um entrou
  });

  it('um stream partilhado por duas páginas só se apaga quando já ninguém o usa', async () => {
    const d = await doc(2, true);
    const comum = d.getPages()[0].node.get(PDFName.of('Contents')) as PDFRef;
    const usos = usosDosConteudos(d);
    expect(usos.get(comum.tag)).toBe(2);
    substituirConteudo(d, d.getPages()[0].node, bytes('A'), usos);
    expect(d.context.lookup(comum)).toBeDefined(); // a página 2 ainda o usa
    expect(texto(d, d.getPages()[1].node.get(PDFName.of('Contents')))).toBe('0 0 1 1 re f');
    substituirConteudo(d, d.getPages()[1].node, bytes('B'), usos);
    expect(d.context.lookup(comum)).toBeUndefined();
  });

  it('conteúdo em vários streams (array): todos os antigos saem', async () => {
    const d = await PDFDocument.create();
    const ctx = d.context;
    const a = ctx.register(ctx.stream('q'));
    const b = ctx.register(ctx.stream('Q'));
    const p = d.addPage([10, 10]);
    p.node.set(PDFName.of('Contents'), ctx.obj([a, b]));
    substituirConteudo(d, p.node, bytes('x'), usosDosConteudos(d));
    expect(ctx.lookup(a)).toBeUndefined();
    expect(ctx.lookup(b)).toBeUndefined();
  });

  it('página sem conteúdo: só põe o novo', async () => {
    const d = await PDFDocument.create();
    const p = d.addPage([10, 10]);
    p.node.delete(PDFName.of('Contents'));
    const novo = substituirConteudo(d, p.node, bytes('x'), usosDosConteudos(d));
    expect(texto(d, novo)).toBe('x');
  });
});
