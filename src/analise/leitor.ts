import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  decodePDFRawStream,
  type PDFContext,
  type PDFObject,
} from 'pdf-lib';

/** Atalhos para andar na árvore de objetos do pdf-lib, a resolver referências sempre. */
export class Leitor {
  constructor(readonly ctx: PDFContext) {}

  res(o: PDFObject | undefined): PDFObject | undefined {
    let atual = o;
    // Referências a referências existem em ficheiros mal feitos
    for (let i = 0; i < 8 && atual instanceof PDFRef; i++) atual = this.ctx.lookup(atual);
    return atual;
  }

  dict(o: PDFObject | undefined): PDFDict | undefined {
    const r = this.res(o);
    if (r instanceof PDFDict) return r;
    if (r instanceof PDFStream) return r.dict;
    return undefined;
  }

  arr(o: PDFObject | undefined): PDFArray | undefined {
    const r = this.res(o);
    return r instanceof PDFArray ? r : undefined;
  }

  stream(o: PDFObject | undefined): PDFStream | undefined {
    const r = this.res(o);
    return r instanceof PDFStream ? r : undefined;
  }

  num(o: PDFObject | undefined): number | undefined {
    const r = this.res(o);
    return r instanceof PDFNumber ? r.asNumber() : undefined;
  }

  nome(o: PDFObject | undefined): string | undefined {
    const r = this.res(o);
    return r instanceof PDFName ? r.decodeText() : undefined;
  }

  bool(o: PDFObject | undefined): boolean | undefined {
    const r = this.res(o);
    return r instanceof PDFBool ? r.asBoolean() : undefined;
  }

  texto(o: PDFObject | undefined): string | undefined {
    const r = this.res(o);
    return r instanceof PDFString || r instanceof PDFHexString ? r.decodeText() : undefined;
  }

  /** dict[chave], já resolvido */
  get(d: PDFDict | undefined, chave: string): PDFObject | undefined {
    return d ? this.res(d.get(PDFName.of(chave))) : undefined;
  }

  /** Itens de um array, resolvidos */
  itens(a: PDFObject | undefined): (PDFObject | undefined)[] {
    const arr = this.arr(a);
    return arr ? arr.asArray().map((x) => this.res(x)) : [];
  }

  numeros(a: PDFObject | undefined): number[] {
    return this.itens(a).map((x) => (x instanceof PDFNumber ? x.asNumber() : NaN));
  }

  /** Identificador estável de um objeto indireto (para caches) */
  idDe(o: PDFObject | undefined): string | undefined {
    return o instanceof PDFRef ? o.tag : undefined;
  }

  /** Bytes descodificados de um stream (Flate, LZW, ASCII85, ...). Falha para DCT, JPX, CCITT, JBIG2. */
  bytes(s: PDFStream): Uint8Array {
    if (s instanceof PDFRawStream) return decodePDFRawStream(s).decode();
    return s.getContents();
  }
}

export { PDFDict, PDFName, PDFRef, PDFStream, PDFArray };
