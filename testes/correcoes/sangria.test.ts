import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calcularAlertas } from '../../src/alertas/registo';
import { analisarDocumento } from '../../src/analise/analisador';
import { abrirPdf, lerPaginas } from '../../src/analise/documento';
import { aplicarCorrecoes, SEM_CORRECOES } from '../../src/correcoes/aplicar';
import { conteudoDeSangria } from '../../src/correcoes/sangria';
import { ptParaMm } from '../../src/comum/unidades';
import { CFG_BASE } from '../fixtures/analisar';
import { gerarPdfRaw, mm, type PaginaRaw } from '../fixtures/gerar';

const PEDIDO = { ...SEM_CORRECOES, sangria: { mm: 3 } };
const FUNDO = `0.8 0 0 0 k 0 0 ${mm(100)} ${mm(100)} re f 0 0.9 0.9 0 k ${mm(40)} ${mm(40)} ${mm(20)} ${mm(20)} re f`;

async function corrigir(paginas: Partial<PaginaRaw>[]) {
  const bytes = await gerarPdfRaw(paginas.map((p) => ({ mediaMm: [100, 100] as [number, number], conteudo: FUNDO, ...p })) as PaginaRaw[]);
  const original = bytes.slice();
  const r = await aplicarCorrecoes(bytes, PEDIDO, CFG_BASE);
  const alertas = async (b: Uint8Array) => calcularAlertas(analisarDocumento(await abrirPdf(b)), CFG_BASE).map((a) => a.id);
  return { r, original, entrada: bytes, antes: await alertas(original), depois: await alertas(r.bytes), doc: await PDFDocument.load(r.bytes) };
}

describe('sangria automática', () => {
  it('arte que pára no corte: gera 3 mm e o alerta desaparece', async () => {
    const { r, antes, depois, doc } = await corrigir([{}]);
    expect(antes).toContain('sangria-ausente');
    expect(depois).not.toContain('sangria-ausente');
    expect(depois).not.toContain('sangria-curta');
    expect(r.resumo.sangria?.geradas).toEqual([0]);

    const info = lerPaginas(doc).paginas[0];
    expect(ptParaMm(info.media.x1 - info.media.x0)).toBeCloseTo(106, 1);
    expect(info.sangriaMm.esquerda).toBeCloseTo(3, 1);
    expect(info.sangriaMm.cima).toBeCloseTo(3, 1);
    // a medida final continua a ser a mesma
    expect(info.larguraMm).toBeCloseTo(100, 1);
    expect(info.alturaMm).toBeCloseTo(100, 1);
    expect(info.origemTrim).toBe('TrimBox');
  });

  it('o original nunca é alterado', async () => {
    // compara os bytes que entraram, antes e depois da correção (não com outro PDF gerado depois: as datas de criação diferem)
    const { original, entrada, r } = await corrigir([{}]);
    expect(entrada).toEqual(original);
    expect(r.bytes).not.toEqual(original);
  });

  it('só mexe nas páginas que precisam', async () => {
    const ok: Partial<PaginaRaw> = {
      mediaMm: [106, 106],
      trimMm: [3, 3, 100, 100],
      bleedMm: [0, 0, 106, 106],
      conteudo: `0.8 0 0 0 k 0 0 ${mm(106)} ${mm(106)} re f`,
    };
    const { r, doc } = await corrigir([ok, {}]);
    expect(r.resumo.sangria?.geradas).toEqual([1]);
    const p0 = doc.getPages()[0].getMediaBox();
    expect(p0.width).toBeCloseTo(mm(106), 1);
  });

  it('falso positivo: só texto e branco (não pedem sangria) não são mexidos', async () => {
    const { r } = await corrigir([{ conteudo: '1 g 10 10 20 20 re f' }]);
    expect(r.resumo.sangria?.geradas).toEqual([]);
  });

  it('o conteúdo antigo passa a Form: a arte original continua no ficheiro', async () => {
    const { doc } = await corrigir([{}]);
    const res = doc.getPages()[0].node.Resources()!;
    expect(res.toString()).toContain('ArtSangria');
    const forms = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Form'));
    expect(forms).toHaveLength(1);
    // e o conteúdo antigo foi apagado: o ficheiro não leva a arte duas vezes
    const streams = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream);
    expect(streams).toHaveLength(2);
  });

  it('ficheiros com várias páginas e CropBox já maior (marcas): a CropBox não encolhe', async () => {
    const marcas: Partial<PaginaRaw> = { mediaMm: [120, 120], trimMm: [10, 10, 100, 100], cropMm: [0, 0, 120, 120], conteudo: `0.8 0 0 0 k ${mm(10)} ${mm(10)} ${mm(100)} ${mm(100)} re f` };
    const { doc } = await corrigir([marcas]);
    const c = doc.getPages()[0].getCropBox();
    expect(c.width).toBeCloseTo(mm(120), 1);
  });

  it('é idempotente: corrigir o ficheiro já corrigido não gera mais nada', async () => {
    const { r } = await corrigir([{}]);
    const segunda = await aplicarCorrecoes(r.bytes, PEDIDO, CFG_BASE);
    expect(segunda.resumo.sangria?.geradas).toEqual([]);
  });

  it('gerado: oito recortes espelhados e a página por cima', () => {
    const s = conteudoDeSangria({ x0: 0, y0: 0, x1: 100, y1: 200 }, 10, 'F');
    expect(s.match(/ re W n /g)).toHaveLength(8);
    expect(s.trimEnd().endsWith('/F Do')).toBe(true);
    // lado esquerdo: espelho em x sobre x=0
    expect(s).toContain('q -10 0 10 200 re W n -1 0 0 1 0 0 cm /F Do Q');
    // lado direito: espelho sobre x=100
    expect(s).toContain('q 100 0 10 200 re W n -1 0 0 1 200 0 cm /F Do Q');
    // canto superior direito: espelho nos dois eixos
    expect(s).toContain('q 100 200 10 10 re W n -1 0 0 -1 200 400 cm /F Do Q');
  });
});
