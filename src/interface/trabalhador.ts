/// <reference lib="webworker" />
// Corre a análise fora da thread da interface: um catálogo de 800 páginas não pode congelar a janela.
import { calcularAlertas } from '../alertas/registo';
import type { Alerta, ConfigAlertas } from '../alertas/tipos';
import { analisarDocumento, type AnaliseDocumento } from '../analise/analisador';
import { abrirPdf, lerPaginas, type DocumentoInfo } from '../analise/documento';

export type Entrada =
  | { tipo: 'abrir'; id: number; bytes: Uint8Array; config: ConfigAlertas }
  | { tipo: 'config'; id: number; config: ConfigAlertas };

export type Saida =
  | { tipo: 'medidas'; id: number; info: DocumentoInfo }
  | { tipo: 'progresso'; id: number; feitas: number; total: number }
  | { tipo: 'alertas'; id: number; alertas: Alerta[]; avisos: string[]; paginasGraficas: number[] }
  | { tipo: 'erro'; id: number; mensagem: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const enviar = (m: Saida) => ctx.postMessage(m);

let analise: AnaliseDocumento | null = null;
let idAtual = 0;
let config: ConfigAlertas | null = null;

function publicar(id: number) {
  if (!analise || !config) return;
  const avisos = [...new Set(analise.paginas.flatMap((p) => p.ir.avisos))];
  // Páginas só de texto não podem ter QR codes: não vale a pena renderizá-las para os procurar
  const paginasGraficas = analise.paginas.filter((p) => p.ir.eventos.some((e) => e.tipo !== 'texto')).map((p) => p.info.indice);
  enviar({ tipo: 'alertas', id, alertas: calcularAlertas(analise, config), avisos, paginasGraficas });
}

ctx.onmessage = async (ev: MessageEvent<Entrada>) => {
  const m = ev.data;

  if (m.tipo === 'config') {
    // Só recalcula os alertas: a análise do PDF já está feita
    if (m.id === idAtual) {
      config = m.config;
      publicar(m.id);
    }
    return;
  }

  idAtual = m.id;
  config = m.config;
  analise = null;
  try {
    const pdf = await abrirPdf(m.bytes);
    const info = lerPaginas(pdf);
    enviar({ tipo: 'medidas', id: m.id, info });

    let ultimo = 0;
    analise = analisarDocumento(pdf, info, (feitas, total) => {
      const agora = performance.now();
      if (agora - ultimo > 150 || feitas === total) {
        ultimo = agora;
        enviar({ tipo: 'progresso', id: m.id, feitas, total });
      }
    });
    publicar(m.id);
  } catch (e) {
    enviar({ tipo: 'erro', id: m.id, mensagem: (e as Error).message });
  }
};
