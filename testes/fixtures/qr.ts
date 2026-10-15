import qrcode from 'qrcode-generator';
import { mm } from './gerar';

/** Matriz de módulos de um QR code: true = escuro. */
export function matrizQr(texto: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/**
 * Desenha o QR code numa imagem RGBA branca, com `modulo` pixels por módulo e uma zona de silêncio
 * de 4 módulos, no ponto (x, y) em pixels. Devolve o tamanho do símbolo em pixels.
 */
export function desenharQrEmImagem(
  dados: Uint8ClampedArray,
  largura: number,
  texto: string,
  x: number,
  y: number,
  modulo: number,
  invertido = false,
): number {
  const m = matrizQr(texto);
  const n = m.length;
  const total = (n + 8) * modulo;
  for (let py = 0; py < total; py++) {
    for (let px = 0; px < total; px++) {
      const r = Math.floor(py / modulo) - 4;
      const c = Math.floor(px / modulo) - 4;
      const escuro = r >= 0 && c >= 0 && r < n && c < n && m[r][c];
      const preto = invertido ? !escuro : escuro;
      const v = preto ? 0 : 255;
      const i = ((y + py) * largura + (x + px)) * 4;
      dados[i] = dados[i + 1] = dados[i + 2] = v;
      dados[i + 3] = 255;
    }
  }
  return n * modulo;
}

export function imagemBranca(largura: number, altura: number): Uint8ClampedArray {
  return new Uint8ClampedArray(largura * altura * 4).fill(255);
}

/**
 * Content stream de um QR code vetorial: um quadrado preto por módulo escuro. `tamanhoMm` é o lado
 * do símbolo, sem zona de silêncio. O canto inferior esquerdo fica em (xMm, yMm).
 */
export function qrVetorial(texto: string, xMm: number, yMm: number, tamanhoMm: number, cor = '0 0 0 1 k'): string {
  const m = matrizQr(texto);
  const n = m.length;
  const lado = tamanhoMm / n;
  const partes: string[] = [cor];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (m[r][c]) partes.push(`${mm(xMm + c * lado)} ${mm(yMm + (n - 1 - r) * lado)} ${mm(lado)} ${mm(lado)} re`);
    }
  }
  partes.push('f');
  return partes.join(' ');
}
