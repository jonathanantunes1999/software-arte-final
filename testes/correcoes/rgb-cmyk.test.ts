import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFHexString, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calcularAlertas } from '../../src/alertas/registo';
import { analisarDocumento } from '../../src/analise/analisador';
import { abrirPdf } from '../../src/analise/documento';
import { aplicarCorrecoes, SEM_CORRECOES, type PedidoCorrecoes } from '../../src/correcoes/aplicar';
import { rgbParaCmykPrensa } from '../../src/cores/conversao';
import { BASE, CFG_BASE } from '../fixtures/analisar';
import { gerarPdfRaw, type PaginaRaw } from '../fixtures/gerar';

const JPEG_RGB = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAAIABADAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD4vr+Uz/fw+Q6/6qD/AJrz/9k=';
const deBase64 = (b: string) => Uint8Array.from(Buffer.from(b, 'base64'));

const TUDO: PedidoCorrecoes = { ...SEM_CORRECOES, rgbParaCmyk: { vetores: true, imagens: true } };

async function corrigir(spec: Partial<PaginaRaw> & { conteudo: string | string[] }, pedido: PedidoCorrecoes = TUDO) {
  const bytes = await gerarPdfRaw([{ ...BASE, espacos: { CS0: { tipo: 'icc' as const, n: 3 as const } }, ...spec }]);
  const original = bytes.slice();
  const r = await aplicarCorrecoes(bytes, pedido, CFG_BASE);
  const ids = async (b: Uint8Array) => calcularAlertas(analisarDocumento(await abrirPdf(b)), CFG_BASE).map((a) => a.id);
  return { r, original, antes: await ids(original), depois: await ids(r.bytes), doc: await PDFDocument.load(r.bytes) };
}

function conteudo(doc: PDFDocument): string {
  const c = doc.getPages()[0].node.Contents();
  const ss = c instanceof PDFArray ? c.asArray().map((x) => doc.context.lookup(x)) : [c];
  return ss.map((s) => String.fromCharCode(...decodePDFRawStream(s as PDFRawStream).decode())).join('\n');
}

function imagens(doc: PDFDocument) {
  return doc.context
    .enumerateIndirectObjects()
    .map(([, o]) => o)
    .filter((o): o is PDFRawStream => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
}

describe('RGB → CMYK: cores e texto', () => {
  it('rg, RG e sc num espaço ICC de 3 canais passam a k e K; o alerta de RGB desaparece', async () => {
    const { r, antes, depois, doc } = await corrigir({
      conteudo: '1 0 0 rg 0 0 40 40 re f 0 0 1 RG 3 w 50 50 40 40 re S /CS0 cs 0.2 0.4 0.8 sc 10 60 20 20 re f',
    });
    expect(antes).toContain('rgb');
    expect(depois).not.toContain('rgb');
    expect(r.resumo.rgb?.vetores).toBe(3);
    const c = conteudo(doc);
    expect(c).toContain('0 1 1 0 k'); // vermelho
    expect(c).toContain('1 1 0 0 K'); // azul em traço
    const [cc, mm, yy, kk] = rgbParaCmykPrensa(0.2, 0.4, 0.8);
    expect(c).toContain(`${Math.round(cc * 1000) / 1000} ${Math.round(mm * 1000) / 1000} ${Math.round(yy * 1000) / 1000} ${Math.round(kk * 1000) / 1000} k`);
    expect(c).not.toMatch(/\brg\b|\bRG\b/);
  });

  it('preto RGB (0 0 0 rg) fica só K 100%', async () => {
    const { doc } = await corrigir({ conteudo: '0 0 0 rg 0 0 40 40 re f' });
    expect(conteudo(doc)).toContain('0 0 0 1 k');
  });

  it('CMYK, cinzento e spots não são tocados (falso positivo)', async () => {
    const c = '0.2 0.3 0.4 0.1 k 0 0 40 40 re f 0.5 g 50 50 20 20 re f';
    const { doc, r, original } = await corrigir({ conteudo: c });
    expect(r.resumo.rgb?.vetores).toBe(0);
    expect(conteudo(doc)).toContain('0.2 0.3 0.4 0.1 k');
    expect(conteudo(doc)).toContain('0.5 g');
    void original;
  });

  it('só imagens ou só vetores, conforme o pedido', async () => {
    const spec = {
      conteudo: '1 0 0 rg 0 0 40 40 re f q 40 0 0 40 50 50 cm /Im0 Do Q',
      imagens: { Im0: { larguraPx: 1, alturaPx: 1, espaco: 'RGB' as const, dados: [10, 200, 30] } },
    };
    const soVetores = await corrigir(spec, { ...SEM_CORRECOES, rgbParaCmyk: { vetores: true, imagens: false } });
    expect(soVetores.r.resumo.rgb).toMatchObject({ vetores: 1, imagens: null });
    expect(String(imagens(soVetores.doc)[0].dict.get(PDFName.of('ColorSpace')))).toBe('/DeviceRGB');
    const soImagens = await corrigir(spec, { ...SEM_CORRECOES, rgbParaCmyk: { vetores: false, imagens: true } });
    expect(conteudo(soImagens.doc)).toContain('1 0 0 rg');
    expect(String(imagens(soImagens.doc)[0].dict.get(PDFName.of('ColorSpace')))).toBe('/DeviceCMYK');
  });

  it('é idempotente e não toca no original', async () => {
    const { r, original } = await corrigir({ conteudo: '1 0 0 rg 0 0 40 40 re f' });
    const copia = original.slice();
    const segunda = await aplicarCorrecoes(r.bytes, TUDO, CFG_BASE);
    expect(segunda.resumo.rgb?.vetores).toBe(0);
    expect(original).toEqual(copia);
  });

  it('o limite de tinta das Definições conta (240%)', async () => {
    const { r, doc } = await corrigir({ conteudo: '0 0 0.02 rg 0 0 40 40 re f' }, { ...SEM_CORRECOES, rgbParaCmyk: { vetores: true, imagens: false } });
    expect(r.resumo.rgb?.vetores).toBe(1);
    const m = conteudo(doc).match(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) k/)!;
    expect(m.slice(1, 5).reduce((a, b) => a + parseFloat(b), 0)).toBeLessThanOrEqual(3 + 1e-6);
  });
});

describe('RGB → CMYK: imagens', () => {
  const pagina = (extra: Partial<PaginaRaw> = {}) => ({ conteudo: 'q 40 0 0 40 10 10 cm /Im0 Do Q', ...extra });
  const dadosDe = (doc: PDFDocument) => Array.from(decodePDFRawStream(imagens(doc)[0]).decode());

  it('imagem DeviceRGB passa a DeviceCMYK com os mesmos pixeis convertidos', async () => {
    const rgb = [255, 0, 0, 0, 0, 0, 255, 255, 255, 128, 128, 128];
    const { r, antes, depois, doc } = await corrigir(pagina({ imagens: { Im0: { larguraPx: 4, alturaPx: 1, espaco: 'RGB', dados: rgb } } }));
    expect(antes).toContain('rgb');
    expect(depois).not.toContain('rgb');
    expect(r.resumo.rgb?.imagens).toMatchObject({ convertidas: 1, indexadas: 0, saltadas: [] });
    const im = imagens(doc)[0];
    expect(String(im.dict.get(PDFName.of('ColorSpace')))).toBe('/DeviceCMYK');
    expect((im.dict.get(PDFName.of('BitsPerComponent')) as PDFNumber).asNumber()).toBe(8);
    expect(dadosDe(doc)).toEqual([0, 255, 255, 0, /* preto */ 0, 0, 0, 255, /* branco */ 0, 0, 0, 0, /* cinzento */ 0, 0, 0, 127]);
  });

  it('mantém o resto do dicionário (SMask, Interpolate) e aplica o /Decode', async () => {
    const { doc } = await corrigir(
      pagina({ imagens: { Im0: { larguraPx: 1, alturaPx: 1, espaco: 'RGB', dados: [0, 0, 0], extra: { SMask: 'auto', Interpolate: true, Decode: [1, 0, 1, 0, 1, 0] } } } }),
    );
    const im = imagens(doc).find((i) => i.dict.has(PDFName.of('SMask')))!;
    expect(im.dict.has(PDFName.of('Interpolate'))).toBe(true);
    expect(im.dict.has(PDFName.of('Decode'))).toBe(false);
    // 0 0 0 com Decode invertido = branco 255 255 255 = sem tinta
    expect(Array.from(decodePDFRawStream(im).decode())).toEqual([0, 0, 0, 0]);
  });

  it('Indexed sobre RGB: só a paleta muda', async () => {
    const bytes = await gerarPdfRaw([{ ...BASE, conteudo: 'q 40 0 0 40 10 10 cm /Im0 Do Q', imagens: { Im0: { larguraPx: 2, alturaPx: 1, espaco: 'RGB', dados: [0, 1] } } }]);
    const pdf = await PDFDocument.load(bytes);
    const im = imagens(pdf)[0];
    im.dict.set(PDFName.of('ColorSpace'), pdf.context.obj(['Indexed', 'DeviceRGB', 1, PDFHexString.of('ff0000ffffff')] as never));
    im.dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
    const r = await aplicarCorrecoes(await pdf.save(), TUDO, CFG_BASE);
    expect(r.resumo.rgb?.imagens).toMatchObject({ convertidas: 1, indexadas: 1 });
    const doc = await PDFDocument.load(r.bytes);
    const cs = imagens(doc)[0].dict.get(PDFName.of('ColorSpace')) as PDFArray;
    expect(cs.asArray().map((x) => String(x)).slice(0, 3)).toEqual(['/Indexed', '/DeviceCMYK', '1']);
    expect(String((cs.get(3) as PDFHexString).asString ? (cs.get(3) as PDFHexString).asString() : '')).toBeTruthy();
    expect(Array.from((cs.get(3) as PDFHexString).asBytes())).toEqual([0, 255, 255, 0, 0, 0, 0, 0]);
    // os índices dos pixeis não mudaram
    expect(dadosDe(doc)).toEqual([0, 1]);
  });

  it('JPEG RGB: descodifica e passa a CMYK em Flate', async () => {
    const bytes = await gerarPdfRaw([{ ...BASE, conteudo: 'q 40 0 0 20 10 10 cm /Im0 Do Q', imagens: { Im0: { larguraPx: 16, alturaPx: 8, espaco: 'RGB', dados: [0] } } }]);
    const pdf = await PDFDocument.load(bytes);
    const stream = pdf.context.stream(deBase64(JPEG_RGB), { Type: 'XObject', Subtype: 'Image', Width: 16, Height: 8, BitsPerComponent: 8, ColorSpace: 'DeviceRGB', Filter: 'DCTDecode' } as never);
    pdf.context.assign(pdf.context.enumerateIndirectObjects().find(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'))![0], stream);
    const r = await aplicarCorrecoes(await pdf.save(), TUDO, CFG_BASE);
    expect(r.resumo.rgb?.imagens?.convertidas).toBe(1);
    const doc = await PDFDocument.load(r.bytes);
    const im = imagens(doc)[0];
    expect(String(im.dict.get(PDFName.of('ColorSpace')))).toBe('/DeviceCMYK');
    expect(String(im.dict.get(PDFName.of('Filter')))).toBe('/FlateDecode');
    expect(dadosDe(doc)).toHaveLength(16 * 8 * 4);
  });

  it('o que não se converte fica como estava, com o motivo: máscara por cor, 16 bits, JPEG 2000', async () => {
    const bytes = await gerarPdfRaw([
      {
        ...BASE,
        conteudo: 'q 10 0 0 10 0 0 cm /A Do Q q 10 0 0 10 20 0 cm /B Do Q q 10 0 0 10 40 0 cm /C Do Q',
        imagens: {
          A: { larguraPx: 1, alturaPx: 1, espaco: 'RGB', dados: [1, 2, 3], extra: { Mask: [0, 10, 0, 10, 0, 10] } },
          B: { larguraPx: 1, alturaPx: 1, espaco: 'RGB', dados: [1, 2, 3, 4, 5, 6], extra: { BitsPerComponent: 16 } },
          C: { larguraPx: 1, alturaPx: 1, espaco: 'RGB', dados: [1, 2, 3], extra: { Filter: 'JPXDecode' } },
        },
      },
    ]);
    const r = await aplicarCorrecoes(bytes, TUDO, CFG_BASE);
    const s = r.resumo.rgb!.imagens!;
    expect(s.convertidas).toBe(0);
    expect(s.saltadas.map((x) => x.motivo).sort()).toEqual(['16 bits por componente', 'JPEG 2000', 'máscara por cor (os valores deixariam de bater)'].sort());
    const doc = await PDFDocument.load(r.bytes);
    for (const im of imagens(doc)) expect(String(im.dict.get(PDFName.of('ColorSpace')))).toBe('/DeviceRGB');
  });

  it('imagens CMYK e cinzento não se tocam', async () => {
    const bytes = await gerarPdfRaw([
      { ...BASE, conteudo: 'q 10 0 0 10 0 0 cm /A Do Q q 10 0 0 10 20 0 cm /B Do Q', imagens: { A: { larguraPx: 1, alturaPx: 1, espaco: 'CMYK', dados: [1, 2, 3, 4] }, B: { larguraPx: 1, alturaPx: 1, espaco: 'Gray', dados: [9] } } },
    ]);
    const r = await aplicarCorrecoes(bytes, TUDO, CFG_BASE);
    expect(r.resumo.rgb?.imagens).toMatchObject({ convertidas: 0, saltadas: [] });
  });
});
