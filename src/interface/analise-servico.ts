import type { Alerta, ConfigAlertas } from '../alertas/tipos';
import type { DocumentoInfo } from '../analise/documento';
import type { PaginaIR } from '../analise/ir';
import type { Entrada, Saida } from './trabalhador';

export interface Inspecao {
  ir: PaginaIR;
  /** Layers que o ficheiro declara (de todas as páginas) */
  totalCamadas: number;
}

export interface OuvintesAnalise {
  aoMedir(info: DocumentoInfo): void;
  aoProgredir(feitas: number, total: number): void;
  aoAlertar(alertas: Alerta[], avisos: string[], paginasGraficas: number[]): void;
  aoFalhar(mensagem: string): void;
}

/** Fala com o worker de análise. Respostas de pedidos antigos são ignoradas. */
export class ServicoAnalise {
  private worker = new Worker(new URL('./trabalhador.ts', import.meta.url), { type: 'module' });
  private id = 0;
  private pedido = 0;
  private espera = new Map<number, (r: Inspecao | null) => void>();

  constructor(private ouvintes: OuvintesAnalise) {
    this.worker.onmessage = (ev: MessageEvent<Saida>) => {
      const m = ev.data;
      if (m.id !== this.id) return;
      if (m.tipo === 'inspecao') {
        this.espera.get(m.pedido)?.({ ir: m.ir, totalCamadas: m.totalCamadas });
        this.espera.delete(m.pedido);
      } else if (m.tipo === 'medidas') this.ouvintes.aoMedir(m.info);
      else if (m.tipo === 'progresso') this.ouvintes.aoProgredir(m.feitas, m.total);
      else if (m.tipo === 'alertas') this.ouvintes.aoAlertar(m.alertas, m.avisos, m.paginasGraficas);
      else this.ouvintes.aoFalhar(m.mensagem);
    };
  }

  /** O worker fica com os bytes: passa uma cópia se precisares deles. */
  abrir(bytes: Uint8Array, config: ConfigAlertas): void {
    const msg: Entrada = { tipo: 'abrir', id: ++this.id, bytes, config };
    this.worker.postMessage(msg, [bytes.buffer]);
  }

  /** Interpreta uma página com os contornos dos objetos. Um pedido novo cancela os anteriores (respondem null). */
  inspecionar(pagina: number, sobreposicoes: Record<string, boolean>): Promise<Inspecao | null> {
    const pedido = ++this.pedido;
    for (const ok of this.espera.values()) ok(null);
    this.espera.clear();
    return new Promise((ok) => {
      this.espera.set(pedido, ok);
      const msg: Entrada = { tipo: 'inspecionar', id: this.id, pedido, pagina, sobreposicoes };
      this.worker.postMessage(msg);
    });
  }

  atualizarConfig(config: ConfigAlertas): void {
    if (this.id === 0) return;
    const msg: Entrada = { tipo: 'config', id: this.id, config };
    this.worker.postMessage(msg);
  }

  terminar(): void {
    this.worker.terminate();
  }
}
