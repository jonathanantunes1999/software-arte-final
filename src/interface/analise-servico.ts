import type { Alerta, ConfigAlertas } from '../alertas/tipos';
import type { DocumentoInfo } from '../analise/documento';
import type { Entrada, Saida } from './trabalhador';

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

  constructor(private ouvintes: OuvintesAnalise) {
    this.worker.onmessage = (ev: MessageEvent<Saida>) => {
      const m = ev.data;
      if (m.id !== this.id) return;
      if (m.tipo === 'medidas') this.ouvintes.aoMedir(m.info);
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

  atualizarConfig(config: ConfigAlertas): void {
    if (this.id === 0) return;
    const msg: Entrada = { tipo: 'config', id: this.id, config };
    this.worker.postMessage(msg);
  }

  terminar(): void {
    this.worker.terminate();
  }
}
