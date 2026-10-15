/** Descodificador de JPEG (ver o cabeçalho de jpeg-decoder.js). Só o que usamos. */
export class JpegImage {
  opts: { colorTransform?: boolean; tolerantDecoding?: boolean };
  width: number;
  height: number;
  components: unknown[];
  constructor();
  parse(dados: Uint8Array): void;
  /** Componentes intercalados, 1 byte cada (1, 3 ou 4 componentes) */
  getData(largura: number, altura: number): Uint8Array;
  static resetMaxMemoryUsage(bytes: number): void;
}
