/// <reference lib="webworker" />
// Lê QR codes numa página renderizada, fora da thread da interface: pode demorar centenas de ms.
import type { QrLido } from '../analise/qr-leitura';
import { lerQrsDaPagina } from '../analise/qr-leitura';

export interface PedidoQr {
  id: number;
  largura: number;
  altura: number;
  pxPorMm: number;
  buffer: ArrayBuffer;
}
export interface RespostaQr {
  id: number;
  encontrados: QrLido[];
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<PedidoQr>) => {
  const { id, largura, altura, pxPorMm, buffer } = ev.data;
  let encontrados: QrLido[] = [];
  try {
    encontrados = lerQrsDaPagina(new Uint8ClampedArray(buffer), largura, altura, pxPorMm);
  } catch {
    /* uma página que falhe não pára as outras */
  }
  const resposta: RespostaQr = { id, encontrados };
  ctx.postMessage(resposta);
};
