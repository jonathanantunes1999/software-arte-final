/** Só o que usamos do opentype.js (MIT). */
declare module 'opentype.js' {
  export type Comando =
    | { type: 'M' | 'L'; x: number; y: number }
    | { type: 'Q'; x1: number; y1: number; x: number; y: number }
    | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: 'Z' };
  export interface Glifo {
    name?: string;
    advanceWidth?: number;
    path: { commands: Comando[] };
  }
  export interface Fonte {
    unitsPerEm: number;
    numGlyphs: number;
    glyphs: { get(i: number): Glifo; length: number };
    isCIDFont?: boolean;
    cffEncoding?: { charset: (string | number)[]; encoding: Record<number, string> | (string | undefined)[] };
    tables: Record<string, unknown>;
  }
  export function parse(buffer: ArrayBuffer): Fonte;
}
