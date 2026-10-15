import { PDFContext, PDFDict, PDFHexString, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { Leitor } from '../../src/analise/leitor';
import { ehImagemCinzento, separarImagem, type ResultadoImagem } from '../../src/separacoes/imagens';
import { idSpot, PLACAS_PROCESSO, type Placa } from '../../src/separacoes/placas';

const JPEG_CMYK = '/9j/7gAOQWRvYmUAZAAAAAAA/9sAQwACAQEBAQECAQEBAgICAgIEAwICAgIFBAQDBAYFBgYGBQYGBgcJCAYHCQcGBggLCAkKCgoKCgYICwwLCgwJCgoK/8AAFAgACAAQBEMRAE0RAFkRAEsRAP/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAA4EQwBNAFkASwAAPwD+f+v38r9/K/fyv7/K/n/or4zr/9k=';
const JPEG_RGB = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAAIABADAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD4vr+Uz/fw+Q6/6qD/AJrz/9k=';

const [C, M, Y, K] = PLACAS_PROCESSO;
const spot = (nome: string): Placa => ({ id: idSpot(nome), tipo: 'spot', nome, rgb: [255, 0, 0] });
const TODAS = [C, M, Y, K, spot('Verniz')];
/** Uma string hexadecimal do PDF, como as paletas Indexed a usam */
const hex = (h: string) => PDFHexString.of(h.replace(/\s/g, ''));
const deBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function criar() {
  const ctx = PDFContext.create();
  const l = new Leitor(ctx);
  const imagem = (dados: number[] | Uint8Array, dict: Record<string, unknown>) =>
    ctx.stream(Uint8Array.from(dados), { Type: 'XObject', Subtype: 'Image', ...dict } as never) as PDFRawStream;
  return { ctx, l, imagem, recursos: ctx.obj({}) as PDFDict };
}
const planos = (r: ResultadoImagem) => {
  if (!('ok' in r)) throw new Error('erro: ' + r.erro);
  return Object.fromEntries([...r.ok.planos].map(([k, v]) => [k, Array.from(v)]));
};
const perto = (a: number[], b: number[], tol: number) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(Math.abs(v - b[i]), `posição ${i}: ${v} vs ${b[i]}`).toBeLessThanOrEqual(tol));
};

describe('separar imagens: CMYK, RGB e cinzento', () => {
  it('CMYK de 8 bits: um plano por componente; os planos vazios não aparecem', () => {
    const { l, imagem, recursos } = criar();
    const xo = imagem([255, 0, 0, 0, 0, 128, 0, 51], { Width: 2, Height: 1, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8 });
    expect(planos(separarImagem(l, xo, recursos, TODAS))).toEqual({ C: [255, 0], M: [0, 128], K: [0, 51] });
  });

  it('/Decode invertido (CMYK da Adobe): 0 passa a ser tinta a 100%', () => {
    const { l, imagem, recursos } = criar();
    const xo = imagem([0, 255, 255, 255, 255, 127, 255, 204], { Width: 2, Height: 1, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8, Decode: [1, 0, 1, 0, 1, 0, 1, 0] });
    perto(Object.values(planos(separarImagem(l, xo, recursos, TODAS))).flat(), [255, 0, 0, 128, 0, 51], 1);
  });

  it('RGB: vermelho dá M e Y, branco nada, preto dá K', () => {
    const { l, imagem, recursos } = criar();
    const xo = imagem([255, 0, 0, 255, 255, 255, 0, 0, 0], { Width: 3, Height: 1, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 });
    // (o ciano fica todo a zero: o plano nem aparece)
    expect(planos(separarImagem(l, xo, recursos, TODAS))).toEqual({ M: [255, 0, 0], Y: [255, 0, 0], K: [0, 0, 255] });
  });

  it('cinzento: reconhece-se e, se for preciso, 0 é preto = K a 100%', () => {
    const { l, imagem, recursos } = criar();
    const xo = imagem([0, 64, 255], { Width: 3, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8 });
    expect(ehImagemCinzento(l, xo, recursos)).toBe(true);
    expect(planos(separarImagem(l, xo, recursos, TODAS))).toEqual({ K: [255, 191, 0] });
  });

  it('não é cinzento: CMYK, RGB, Indexed e imagens sem espaço', () => {
    const { l, imagem, recursos } = criar();
    expect(ehImagemCinzento(l, imagem([0], { Width: 1, Height: 1, ColorSpace: 'DeviceCMYK' }), recursos)).toBe(false);
    expect(ehImagemCinzento(l, imagem([0], { Width: 1, Height: 1, ColorSpace: ['Indexed', 'DeviceGray', 1, hex('00FF')] }), recursos)).toBe(false);
    expect(ehImagemCinzento(l, imagem([0], { Width: 1, Height: 1 }), recursos)).toBe(false);
  });

  it('/Decode num cinzento inverte', () => {
    const { l, imagem, recursos } = criar();
    const xo = imagem([0, 255], { Width: 2, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Decode: [1, 0] });
    expect(planos(separarImagem(l, xo, recursos, TODAS))).toEqual({ K: [0, 255] });
  });
});

describe('separar imagens: Indexed, Separation e DeviceN', () => {
  it('Indexed sobre CMYK: a paleta traduz o índice em tintas', () => {
    const { l, ctx, imagem, recursos } = criar();
    const paleta = ctx.stream(Uint8Array.from([255, 0, 0, 0, 0, 255, 0, 0]));
    const ref = ctx.register(paleta);
    const xo = imagem([0, 1, 1, 0], { Width: 4, Height: 1, ColorSpace: ['Indexed', 'DeviceCMYK', 1, ref], BitsPerComponent: 8 });
    expect(planos(separarImagem(l, xo, recursos, TODAS))).toEqual({ C: [255, 0, 0, 255], M: [0, 255, 255, 0] });
  });

  it('Indexed com a paleta numa string, sobre RGB', () => {
    const { l, imagem, recursos } = criar();
    const xo = imagem([0, 1], { Width: 2, Height: 1, ColorSpace: ['Indexed', 'DeviceRGB', 1, hex('FF0000 000000')], BitsPerComponent: 8 });
    expect(planos(separarImagem(l, xo, recursos, TODAS))).toEqual({ M: [255, 0], Y: [255, 0], K: [0, 255] });
  });

  it('paleta que não é uma string nem um stream: erro', () => {
    const { l, imagem, recursos } = criar();
    const xo = imagem([0], { Width: 1, Height: 1, ColorSpace: ['Indexed', 'DeviceRGB', 0, 'naoEUmaPaleta'], BitsPerComponent: 8 });
    expect(separarImagem(l, xo, recursos, TODAS)).toEqual({ erro: 'paleta (Indexed) ilegível' });
  });

  it('paleta curta demais para o hival: erro', () => {
    const { l, imagem, recursos } = criar();
    const xo = imagem([0], { Width: 1, Height: 1, ColorSpace: ['Indexed', 'DeviceRGB', 3, hex('FF0000')], BitsPerComponent: 8 });
    expect(separarImagem(l, xo, recursos, TODAS)).toEqual({ erro: 'paleta (Indexed) ilegível' });
  });

  it('1 bit por pixel: desempacota por linhas (cada linha começa num byte novo)', () => {
    const { l, imagem, recursos } = criar();
    // 3 pixeis de largura, 2 linhas: 101 e 010 (cada linha num byte, bits à esquerda)
    const xo = imagem([0b10100000, 0b01000000], { Width: 3, Height: 2, ColorSpace: ['Indexed', 'DeviceCMYK', 1, hex('00000000 000000FF')], BitsPerComponent: 1 });
    expect(planos(separarImagem(l, xo, recursos, TODAS))).toEqual({ K: [255, 0, 255, 0, 255, 0] });
  });

  it('4 bits por componente', () => {
    const { l, imagem, recursos } = criar();
    // 2 pixeis de Indexed gray 16 níveis: índices 0 e 15 num só byte
    const paleta = hex(Array.from({ length: 16 }, (_, i) => (i * 17).toString(16).padStart(2, '0')).join(''));
    const xo = imagem([0x0f], { Width: 2, Height: 1, ColorSpace: ['Indexed', 'DeviceGray', 15, paleta], BitsPerComponent: 4 });
    expect(planos(separarImagem(l, xo, recursos, TODAS))).toEqual({ K: [255, 0] });
  });

  it('DeviceN com a mesma tinta em dois componentes: fica o maior valor em cada pixel', () => {
    const { l, ctx, imagem, recursos } = criar();
    const tint = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], N: 1 }));
    const xo = imagem([10, 200, 90, 20], { Width: 2, Height: 1, ColorSpace: ['DeviceN', ['Verniz', 'Verniz'], 'DeviceGray', tint], BitsPerComponent: 8 });
    expect(planos(separarImagem(l, xo, recursos, TODAS))).toEqual({ 'spot:Verniz': [200, 90] });
  });

  it('índice fora da paleta fica preso ao último (não rebenta)', () => {
    const { l, imagem, recursos } = criar();
    const xo = imagem([0, 9], { Width: 2, Height: 1, ColorSpace: ['Indexed', 'DeviceGray', 1, hex('FF00')], BitsPerComponent: 8 });
    expect(planos(separarImagem(l, xo, recursos, TODAS))).toEqual({ K: [0, 255] });
  });

  it('Separation: só a placa da spot, com a intensidade dos pixeis', () => {
    const { l, ctx, imagem, recursos } = criar();
    const tint = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [0, 1, 1, 0], N: 1 }));
    const xo = imagem([0, 128, 255], { Width: 3, Height: 1, ColorSpace: ['Separation', 'Verniz', 'DeviceCMYK', tint], BitsPerComponent: 8 });
    perto(planos(separarImagem(l, xo, recursos, TODAS))['spot:Verniz'], [0, 128, 255], 0);
    expect(Object.keys(planos(separarImagem(l, xo, recursos, TODAS)))).toEqual(['spot:Verniz']);
  });

  it('Separation que não existe nas placas da página: sem planos', () => {
    const { l, ctx, imagem, recursos } = criar();
    const tint = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], N: 1 }));
    const xo = imagem([255], { Width: 1, Height: 1, ColorSpace: ['Separation', 'Outra', 'DeviceGray', tint], BitsPerComponent: 8 });
    expect(planos(separarImagem(l, xo, recursos, TODAS))).toEqual({});
  });

  it('Separation All: todas as placas; None: nenhuma', () => {
    const { l, ctx, imagem, recursos } = criar();
    const tint = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], N: 1 }));
    const todas = imagem([200], { Width: 1, Height: 1, ColorSpace: ['Separation', 'All', 'DeviceGray', tint], BitsPerComponent: 8 });
    expect(planos(separarImagem(l, todas, recursos, TODAS))).toEqual({ C: [200], M: [200], Y: [200], K: [200], 'spot:Verniz': [200] });
    const nenhuma = imagem([200], { Width: 1, Height: 1, ColorSpace: ['Separation', 'None', 'DeviceGray', tint], BitsPerComponent: 8 });
    expect(planos(separarImagem(l, nenhuma, recursos, TODAS))).toEqual({});
  });

  it('DeviceN: cada componente na placa do seu nome', () => {
    const { l, ctx, imagem, recursos } = criar();
    const tint = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], N: 1 }));
    const xo = imagem([10, 100, 20, 200], { Width: 2, Height: 1, ColorSpace: ['DeviceN', ['Black', 'Verniz'], 'DeviceCMYK', tint], BitsPerComponent: 8 });
    expect(planos(separarImagem(l, xo, recursos, TODAS))).toEqual({ K: [10, 20], 'spot:Verniz': [100, 200] });
  });
});

describe('separar imagens: JPEG', () => {
  const jpeg = (b64: string, dict: Record<string, unknown>) => {
    const { l, imagem, recursos } = criar();
    return { l, recursos, xo: imagem(deBase64(b64), { Width: 16, Height: 8, BitsPerComponent: 8, Filter: 'DCTDecode', ...dict }) };
  };

  it('CMYK com /Decode invertido (como o Photoshop escreve): metade ciano, metade magenta 50% + K 20%', () => {
    const { l, recursos, xo } = jpeg(JPEG_CMYK, { ColorSpace: 'DeviceCMYK', Decode: [1, 0, 1, 0, 1, 0, 1, 0] });
    const p = planos(separarImagem(l, xo, recursos, TODAS));
    const metade = (plano: number[], lado: 0 | 1) => plano.filter((_, i) => (i % 16 < 8 ? 0 : 1) === lado);
    const media = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(media(metade(p.C, 0))).toBeGreaterThan(245);
    expect(media(metade(p.C, 1))).toBeLessThan(10);
    expect(Math.abs(media(metade(p.M, 1)) - 128)).toBeLessThan(10);
    expect(Math.abs(media(metade(p.K, 1)) - 51)).toBeLessThan(10);
    expect(media(metade(p.M, 0))).toBeLessThan(10);
    expect(p.Y).toBeUndefined();
  });

  it('o mesmo CMYK sem /Decode sai ao contrário (é o /Decode que manda)', () => {
    const { l, recursos, xo } = jpeg(JPEG_CMYK, { ColorSpace: 'DeviceCMYK' });
    const p = planos(separarImagem(l, xo, recursos, TODAS));
    expect(p.C.slice(0, 8).every((v) => v < 10)).toBe(true);
  });

  it('RGB: a esquerda vermelho (M+Y), a direita azul (C+M)', () => {
    const { l, recursos, xo } = jpeg(JPEG_RGB, { ColorSpace: 'DeviceRGB' });
    const p = planos(separarImagem(l, xo, recursos, TODAS));
    expect(p.M[0]).toBeGreaterThan(240);
    expect(p.Y[0]).toBeGreaterThan(240);
    expect(p.C[0]).toBeLessThan(15);
    expect(p.C[15]).toBeGreaterThan(240);
    expect(p.M[15]).toBeGreaterThan(240);
    expect(p.Y[15]).toBeLessThan(15);
  });

  it('JPEG com espaço de cor errado (3 componentes num CMYK): erro claro', () => {
    const { l, recursos, xo } = jpeg(JPEG_RGB, { ColorSpace: 'DeviceCMYK' });
    const r = separarImagem(l, xo, recursos, TODAS);
    expect('erro' in r && r.erro).toContain('3 componentes');
  });

  it('JPEG com dimensões diferentes das declaradas no PDF', () => {
    const { l, recursos, xo } = jpeg(JPEG_RGB, { ColorSpace: 'DeviceRGB', Width: 32 });
    expect(separarImagem(l, xo, recursos, TODAS)).toEqual({ erro: 'JPEG com dimensões diferentes das do PDF' });
  });

  it('JPEG partido: erro, sem rebentar', () => {
    const { l, imagem, recursos } = criar();
    const xo = imagem([1, 2, 3, 4], { Width: 16, Height: 8, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' });
    expect('erro' in separarImagem(l, xo, recursos, TODAS)).toBe(true);
  });
});

describe('separar imagens: o que não se consegue', () => {
  it('JPEG 2000, CCITT e JBIG2 dão um erro com o motivo', () => {
    const { l, imagem, recursos } = criar();
    for (const [filtro, motivo] of [['JPXDecode', 'JPEG 2000'], ['CCITTFaxDecode', 'CCITT'], ['JBIG2Decode', 'JBIG2']]) {
      const xo = imagem([0, 0, 0, 0], { Width: 1, Height: 1, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8, Filter: filtro });
      expect(separarImagem(l, xo, recursos, TODAS)).toEqual({ erro: motivo });
    }
  });

  it('cinzento de 16 bits e de 4 bits (sem paleta)', () => {
    const { l, imagem, recursos } = criar();
    const g16 = imagem([0x00, 0x00, 0x80, 0x00, 0xff, 0xff], { Width: 3, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 16 });
    perto(planos(separarImagem(l, g16, recursos, TODAS)).K, [255, 127, 0], 1);
    // 4 bits: 0 (preto) e 15 (branco)
    const g4 = imagem([0x0f], { Width: 2, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 4 });
    expect(planos(separarImagem(l, g4, recursos, TODAS))).toEqual({ K: [255, 0] });
  });

  it('profundidade de bits estranha (3): dados incompletos em vez de lixo', () => {
    const { l, imagem, recursos } = criar();
    const xo = imagem([0, 0, 0], { Width: 2, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 3 });
    expect(separarImagem(l, xo, recursos, TODAS)).toEqual({ erro: 'dados da imagem incompletos' });
  });

  it('Lab e espaços desconhecidos', () => {
    const { l, imagem, recursos } = criar();
    expect(separarImagem(l, imagem([0, 0, 0], { Width: 1, Height: 1, ColorSpace: ['Lab', { WhitePoint: [0.95, 1, 1.09] }], BitsPerComponent: 8 }), recursos, TODAS)).toEqual({ erro: 'espaço Lab' });
    expect('erro' in separarImagem(l, imagem([0], { Width: 1, Height: 1, ColorSpace: 'Qualquer', BitsPerComponent: 8 }), recursos, TODAS)).toBe(true);
  });

  it('dados em falta, dimensões a zero, sem espaço de cor', () => {
    const { l, imagem, recursos } = criar();
    expect(separarImagem(l, imagem([1, 2], { Width: 2, Height: 1, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8 }), recursos, TODAS)).toEqual({ erro: 'dados da imagem incompletos' });
    expect(separarImagem(l, imagem([1], { Width: 0, Height: 1, ColorSpace: 'DeviceGray' }), recursos, TODAS)).toEqual({ erro: 'imagem sem dimensões' });
    expect(separarImagem(l, imagem([1], { Width: 1, Height: 1 }), recursos, TODAS)).toEqual({ erro: 'imagem sem espaço de cor' });
  });

  it('imagens muito grandes reduzem-se por saltos', () => {
    const { l, imagem, recursos } = criar();
    // 4×4 de cinzento, cada pixel com o seu valor; com limite de 4 pixeis fica 2×2 (pixeis 0, 2, 8, 10)
    const dados = Array.from({ length: 16 }, (_, i) => 255 - i * 10);
    const xo = imagem(dados, { Width: 4, Height: 4, ColorSpace: 'DeviceGray', BitsPerComponent: 8 });
    const r = separarImagem(l, xo, recursos, TODAS, { maxPixeis: 4 });
    expect('ok' in r && [r.ok.largura, r.ok.altura]).toEqual([2, 2]);
    expect(planos(r)).toEqual({ K: [0, 20, 80, 100] });
  });
});
