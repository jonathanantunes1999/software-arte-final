import type { PDFDocumentProxy } from 'pdfjs-dist';
import { medirLados, type QrEncontrado } from '../analise/qr';
import type { PedidoQr, RespostaQr } from './qr-trabalhador';

/** Resolução a que se renderiza cada página para procurar QR codes */
const DPI = 200;
/** Páginas muito grandes não passam deste tamanho em pixels (o maior lado) */
const MAX_PX = 3000;
/** Quantas páginas se procuram, no máximo: cada uma custa renderizar e ler */
export const MAX_PAGINAS_QR = 60;

export interface OpcoesProcura {
  aoProgredir(feitas: number, total: number): void;
  aoEncontrar(qrs: QrEncontrado[]): void;
  cancelado(): boolean;
}

/**
 * Procura QR codes renderizando as páginas com o pdf.js, uma a uma, e lendo cada imagem num worker.
 * Funciona com QR codes vetoriais e em bitmap, porque lê o que se vê.
 */
export class ServicoQr {
  private worker = new Worker(new URL('./qr-trabalhador.ts', import.meta.url), { type: 'module' });
  private seq = 0;
  private pendentes = new Map<number, (r: RespostaQr) => void>();

  constructor() {
    this.worker.onmessage = (ev: MessageEvent<RespostaQr>) => {
      this.pendentes.get(ev.data.id)?.(ev.data);
      this.pendentes.delete(ev.data.id);
    };
  }

  private ler(pedido: Omit<PedidoQr, 'id'>): Promise<RespostaQr> {
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pendentes.set(id, resolve);
      this.worker.postMessage({ ...pedido, id } satisfies PedidoQr, [pedido.buffer]);
    });
  }

  async procurar(doc: PDFDocumentProxy, paginas: number[], op: OpcoesProcura): Promise<void> {
    let feitas = 0;
    op.aoProgredir(0, paginas.length);
    for (const indice of paginas) {
      if (op.cancelado()) return;
      try {
        const pagina = await doc.getPage(indice + 1);
        const base = pagina.getViewport({ scale: 1 });
        const escala = Math.min(DPI / 72, MAX_PX / Math.max(base.width, base.height));
        const vp = pagina.getViewport({ scale: escala });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(vp.width));
        canvas.height = Math.max(1, Math.floor(vp.height));
        const c2d = canvas.getContext('2d', { willReadFrequently: true })!;
        c2d.fillStyle = '#ffffff';
        c2d.fillRect(0, 0, canvas.width, canvas.height);
        await pagina.render({ canvas, canvasContext: c2d, viewport: vp }).promise;
        if (op.cancelado()) return;

        const imagem = c2d.getImageData(0, 0, canvas.width, canvas.height);
        const pxPorMm = (escala * 72) / 25.4;
        const { encontrados } = await this.ler({ largura: canvas.width, altura: canvas.height, pxPorMm, buffer: imagem.data.buffer });
        canvas.width = canvas.height = 0;
        pagina.cleanup();

        if (encontrados.length && !op.cancelado()) {
          op.aoEncontrar(
            encontrados.map((q) => {
              // pixels da imagem -> espaço de utilizador da página (o viewport trata da rotação e da CropBox)
              const pts = q.cantos.map((p) => vp.convertToPdfPoint(p.x, p.y) as [number, number]);
              const xs = pts.map((p) => p[0]);
              const ys = pts.map((p) => p[1]);
              const { larguraMm, alturaMm } = medirLados(q.cantos, pxPorMm);
              return {
                pagina: indice,
                texto: q.texto,
                caixa: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
                larguraMm,
                alturaMm,
              };
            }),
          );
        }
      } catch (e) {
        // uma página que falhe (ou um documento já fechado) não pára as outras
        if (op.cancelado()) return;
        console.warn(`QR codes: falhou a página ${indice + 1}`, e);
      }
      op.aoProgredir(++feitas, paginas.length);
    }
  }

  terminar(): void {
    this.worker.terminate();
    this.pendentes.clear();
  }
}
