import { readFileSync } from 'node:fs';
import { PDFContext, PDFDict } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { Leitor } from '../../src/analise/leitor';
import { abrirFontePdf, unicodeDoNome, type FonteConvertivel } from '../../src/texto/fonte-pdf';

const ler = (f: string) => new Uint8Array(readFileSync(new URL(`../fixtures/fontes/${f}`, import.meta.url)));

function mundo() {
  const ctx = PDFContext.create();
  const l = new Leitor(ctx);
  const stream = (bytes: Uint8Array, dict: Record<string, unknown> = {}) => ctx.register(ctx.stream(bytes, dict as never));
  const descritor = (extra: Record<string, unknown>, flags = 32) => ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: 'Teste', Flags: flags, ...extra } as never));
  const abrir = (d: Record<string, unknown>) => abrirFontePdf(l, ctx.obj({ Type: 'Font', ...d } as never) as unknown as PDFDict);
  return { ctx, stream, descritor, abrir };
}
const ok = (r: ReturnType<typeof abrirFontePdf>): FonteConvertivel => {
  if (!('ok' in r)) throw new Error(r.erro);
  return r.ok;
};
const primeiro = (f: FonteConvertivel, c: number) => {
  const g = f.glifo(c);
  const m = g?.find((x) => x.t === 'M') as { x: number; y: number } | undefined;
  return m ? [Math.round(m.x * 1000) / 1000, Math.round(m.y * 1000) / 1000] : null;
};

describe('nomes de glifos → Unicode', () => {
  it('lista AGL, variantes com ponto, uniXXXX e uXXXXX', () => {
    expect(unicodeDoNome('A')).toBe(0x41);
    expect(unicodeDoNome('eacute')).toBe(0xe9);
    expect(unicodeDoNome('A.alt')).toBe(0x41);
    expect(unicodeDoNome('uni20AC')).toBe(0x20ac);
    expect(unicodeDoNome('u1F600')).toBe(0x1f600);
    expect(unicodeDoNome('naoexiste')).toBeUndefined();
  });
});

describe('fontes simples', () => {
  it('TrueType com WinAnsiEncoding: o código 65 dá o glifo A, normalizado a 1 em', () => {
    const { stream, descritor, abrir } = mundo();
    const f = ok(abrir({ Subtype: 'TrueType', Encoding: 'WinAnsiEncoding', FontDescriptor: descritor({ FontFile2: stream(ler('teste.ttf')) }) }));
    expect(f.composta).toBe(false);
    expect(primeiro(f, 0x41)).toEqual([0.1, 0.7]);
    expect(primeiro(f, 0x42)).toEqual([0.25, 0.7]);
    expect(f.glifo(0x5a)).toBeNull(); // Z não existe
    expect(f.glifo(0x20)).toEqual([]); // espaço: existe mas não desenha
  });

  it('/Differences troca o nome do glifo de um código', () => {
    const { stream, descritor, abrir } = mundo();
    const enc = { Type: 'Encoding', BaseEncoding: 'WinAnsiEncoding', Differences: [1, 'A', 'O'] };
    const f = ok(abrir({ Subtype: 'TrueType', Encoding: enc, FontDescriptor: descritor({ FontFile2: stream(ler('teste.ttf')) }) }));
    expect(primeiro(f, 1)).toEqual([0.1, 0.7]); // A
    expect(f.glifo(2)!.filter((x) => x.t === 'M')).toHaveLength(2); // O, o anel
  });

  it('TrueType simbólico, sem /Encoding: o código passa direto pelo cmap', () => {
    const { stream, descritor, abrir } = mundo();
    const f = ok(abrir({ Subtype: 'TrueType', FontDescriptor: descritor({ FontFile2: stream(ler('teste.ttf')) }, 4) }));
    expect(primeiro(f, 0x41)).toEqual([0.1, 0.7]);
  });

  it('OpenType (FontFile3 /OpenType) como fonte simples', () => {
    const { stream, descritor, abrir } = mundo();
    const f = ok(abrir({ Subtype: 'Type1', Encoding: 'WinAnsiEncoding', FontDescriptor: descritor({ FontFile3: stream(ler('teste.otf'), { Subtype: 'OpenType' }) }) }));
    expect(primeiro(f, 0x42)).toEqual([0, 0]);
  });

  it('CFF (Type1C) com /Encoding: pelo nome do glifo', () => {
    const { stream, descritor, abrir } = mundo();
    const f = ok(abrir({ Subtype: 'Type1', Encoding: 'WinAnsiEncoding', FontDescriptor: descritor({ FontFile3: stream(ler('teste.cff'), { Subtype: 'Type1C' }) }) }));
    expect(primeiro(f, 0x41)).toEqual([0.1, 0]);
    expect(f.glifo(0x43)!.filter((x) => x.t === 'C')).toHaveLength(4);
  });

  it('CFF (Type1C) sem /Encoding: codificação própria da fonte', () => {
    const { stream, descritor, abrir } = mundo();
    const f = ok(abrir({ Subtype: 'Type1', FontDescriptor: descritor({ FontFile3: stream(ler('teste.cff'), { Subtype: 'Type1C' }) }, 4) }));
    expect(primeiro(f, 0x41)).toEqual([0.1, 0]);
  });
});

describe('fontes compostas (Identity-H)', () => {
  it('CIDFontType2 com CIDToGIDMap /Identity: o CID é o glifo', () => {
    const { stream, descritor, abrir, ctx } = mundo();
    const cid = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'CIDFontType2', CIDToGIDMap: 'Identity', FontDescriptor: descritor({ FontFile2: stream(ler('teste.ttf')) }) } as never));
    const f = ok(abrir({ Subtype: 'Type0', Encoding: 'Identity-H', DescendantFonts: [cid] }));
    expect(f.composta).toBe(true);
    expect(primeiro(f, 2)).toEqual([0.1, 0.7]); // gid 2 = A
    expect(primeiro(f, 3)).toEqual([0.25, 0.7]);
  });

  it('CIDToGIDMap como stream: tabela CID → glifo', () => {
    const { stream, descritor, abrir, ctx } = mundo();
    // CID 5 → glifo 3 (B); CID 6 → glifo 2 (A)
    const mapa = new Uint8Array(14);
    mapa[10] = 0;
    mapa[11] = 3;
    mapa[12] = 0;
    mapa[13] = 2;
    const cid = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'CIDFontType2', CIDToGIDMap: stream(mapa), FontDescriptor: descritor({ FontFile2: stream(ler('teste.ttf')) }) } as never));
    const f = ok(abrir({ Subtype: 'Type0', Encoding: 'Identity-H', DescendantFonts: [cid] }));
    expect(primeiro(f, 5)).toEqual([0.25, 0.7]);
    expect(primeiro(f, 6)).toEqual([0.1, 0.7]);
    expect(f.glifo(0)).toBeNull();
  });

  it('CIDFontType0 com CFF por nome: o CID é o índice do glifo', () => {
    const { stream, descritor, abrir, ctx } = mundo();
    const cid = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'CIDFontType0', FontDescriptor: descritor({ FontFile3: stream(ler('teste.cff'), { Subtype: 'CIDFontType0C' }) }) } as never));
    const f = ok(abrir({ Subtype: 'Type0', Encoding: 'Identity-H', DescendantFonts: [cid] }));
    expect(primeiro(f, 2)).toEqual([0.1, 0]);
  });
});

describe('o que não se converte', () => {
  const motivo = (r: ReturnType<typeof abrirFontePdf>) => ('erro' in r ? r.erro : 'ok');

  it('não incorporada, Type 1, Type 3, vertical, outros CMaps', () => {
    const { stream, descritor, abrir, ctx } = mundo();
    expect(motivo(abrir({ Subtype: 'TrueType' }))).toContain('não incorporada');
    expect(motivo(abrir({ Subtype: 'TrueType', FontDescriptor: descritor({}) }))).toContain('não incorporada');
    expect(motivo(abrir({ Subtype: 'Type1', FontDescriptor: descritor({ FontFile: stream(new Uint8Array(4)) }) }))).toContain('Type 1');
    const t3 = abrir({ Subtype: 'Type3' });
    expect('erro' in t3 && t3.jaVetorial).toBe(true);
    const cid = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'CIDFontType2', FontDescriptor: descritor({ FontFile2: stream(ler('teste.ttf')) }) } as never));
    expect(motivo(abrir({ Subtype: 'Type0', Encoding: 'Identity-V', DescendantFonts: [cid] }))).toContain('vertical');
    expect(motivo(abrir({ Subtype: 'Type0', Encoding: 'UniJIS-UCS2-H', DescendantFonts: [cid] }))).toContain('CMap');
  });

  it('ficheiro de fonte partido', () => {
    const { stream, descritor, abrir } = mundo();
    expect(motivo(abrir({ Subtype: 'TrueType', FontDescriptor: descritor({ FontFile2: stream(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])) }) }))).toContain('ilegível');
  });
});
