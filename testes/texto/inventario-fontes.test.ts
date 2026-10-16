import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { analisarDocumento, prepararInspecao } from '../../src/analise/analisador';
import { abrirPdf, lerPaginas } from '../../src/analise/documento';
import { inventariarFontes } from '../../src/texto/inventario-fontes';
import { pdfComTexto } from '../fixtures/texto';

async function inventario(conteudo: string, fontes: Parameters<typeof pdfComTexto>[0][0]['fontes']) {
  const pdf = await abrirPdf(await pdfComTexto([{ conteudo, fontes }]));
  const a = analisarDocumento(pdf);
  const c = prepararInspecao(pdf, lerPaginas(pdf));
  const usadas = new Set(a.paginas.flatMap((p) => p.ir.fontesUsadas));
  return inventariarFontes(c.l, a.fontes, usadas);
}

describe('inventário de fontes', () => {
  it('diz quais se convertem e porquê as outras não', async () => {
    const r = await inventario('BT /F1 10 Tf (A) Tj /F2 10 Tf (A) Tj /F3 10 Tf (A) Tj /F4 10 Tf (A) Tj ET', { F1: 'ttf', F2: 'nao-incorporada', F3: 'type1', F4: 'cff' });
    expect(r.map((f) => [f.nome, f.convertivel])).toEqual([['Helvetica', false], ['Teste', true], ['TesteCff', true], ['TesteT1', false]]);
    expect(r.find((f) => f.nome === 'Helvetica')!.motivo).toContain('não incorporada');
    expect(r.find((f) => f.nome === 'TesteT1')!.motivo).toContain('Type 1');
    expect(r[1].id).toMatch(/^\d+ \d+ R$/);
  });

  it('fontes que ninguém usa em texto não aparecem', async () => {
    const r = await inventario('BT /F1 10 Tf (A) Tj ET', { F1: 'ttf', F2: 'cff' });
    expect(r.map((f) => f.nome)).toEqual(['Teste']);
  });

  it('PDF sem texto: lista vazia', async () => {
    expect(await inventario('0 0 5 5 re f', { F1: 'ttf' })).toEqual([]);
    void PDFDocument;
  });
});
