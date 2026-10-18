/// <reference lib="webworker" />
// Corre a análise fora da thread da interface: um catálogo de 800 páginas não pode congelar a janela.
import { calcularAlertas, ordenarAlertas } from '../alertas/registo';
import type { Alerta, ConfigAlertas } from '../alertas/tipos';
import { analisarDocumento, inspecionarPagina, prepararInspecao, type AnaliseDocumento, type ContextoInspecao } from '../analise/analisador';
import { abrirPdf, lerPaginas, type DocumentoInfo } from '../analise/documento';
import type { PaginaIR } from '../analise/ir';
import { aplicarCorrecoes, type PedidoCorrecoes, type ResumoCorrecoes } from '../correcoes/aplicar';
import { PDFDocument } from 'pdf-lib';
import { aplicarEdicoes, listarObjetos } from '../edicao/objetos';
import type { Edicao, ObjetoEditavel, ResumoEdicao } from '../edicao/tipos';
import { alertasTintaImagens, medirTintaDasImagens, type TintaPorImagem } from '../alertas/tinta-imagens';
import { inventariar, type Inventario } from '../correcoes/inventario';
import { inventariarFontes, type FonteInventariada } from '../texto/inventario-fontes';
import { separarPagina, type ResultadoSeparacao } from '../separacoes/montar';

export type Entrada =
  | { tipo: 'abrir'; id: number; bytes: Uint8Array; config: ConfigAlertas }
  | { tipo: 'config'; id: number; config: ConfigAlertas }
  /** Interpreta uma página com contornos, para o leitor de cor. `sobreposicoes`: layers ligadas (true) ou desligadas (false) pelo utilizador */
  | { tipo: 'inspecionar'; id: number; pedido: number; pagina: number; sobreposicoes: Record<string, boolean> }
  /** Aplica correções a uma cópia do PDF e devolve os bytes novos */
  | { tipo: 'corrigir'; id: number; pedido: number; correcoes: PedidoCorrecoes; edicoes?: Edicao[] }
  /** Os objetos editáveis de uma página (formas, texto, imagens, grupos) */
  | { tipo: 'objetos'; id: number; pedido: number; pagina: number }
  /** Aplica edições de objetos (apagar, mover, cor…) a uma cópia do PDF e devolve os bytes novos */
  | { tipo: 'editar'; id: number; pedido: number; edicoes: Edicao[] }
  /** Monta o PDF com as placas (separações) de uma página */
  | { tipo: 'separar'; id: number; pedido: number; pagina: number; sobreposicoes: Record<string, boolean>; simularOverprint: boolean };

export type Saida =
  | { tipo: 'medidas'; id: number; info: DocumentoInfo }
  | { tipo: 'progresso'; id: number; feitas: number; total: number }
  | { tipo: 'alertas'; id: number; alertas: Alerta[]; avisos: string[]; paginasGraficas: number[]; inventario: Inventario }
  | { tipo: 'corrigido'; id: number; pedido: number; bytes: Uint8Array; resumo: ResumoCorrecoes }
  | { tipo: 'corrigir-falhou'; id: number; pedido: number; mensagem: string }
  | { tipo: 'objetos'; id: number; pedido: number; pagina: number; objetos: ObjetoEditavel[] }
  | { tipo: 'editado'; id: number; pedido: number; bytes: Uint8Array; resumo: ResumoEdicao }
  | { tipo: 'editar-falhou'; id: number; pedido: number; mensagem: string }
  | { tipo: 'inspecao'; id: number; pedido: number; ir: PaginaIR; totalCamadas: number }
  | { tipo: 'separacao'; id: number; pedido: number; resultado: ResultadoSeparacao }
  | { tipo: 'separacao-falhou'; id: number; pedido: number; mensagem: string }
  | { tipo: 'erro'; id: number; mensagem: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const enviar = (m: Saida) => ctx.postMessage(m);

let analise: AnaliseDocumento | null = null;
let idAtual = 0;
let config: ConfigAlertas | null = null;
let contexto: ContextoInspecao | null = null;
/** Os bytes do ficheiro aberto, para as correções partirem sempre do original */
let bytesOriginais: Uint8Array | null = null;
/** As fontes não mudam com os limites: calculam-se uma vez por ficheiro */
let fontesInventariadas: FonteInventariada[] | null = null;
/** Tinta máxima das imagens CMYK: custa descodificá-las, por isso mede-se depois dos alertas e uma só vez */
let tintaImagens: TintaPorImagem | null = null;

/** Layers desligadas: as do ficheiro, com o que o utilizador ligou ou desligou por cima */
function ocgOcultosCom(c: ContextoInspecao, sobreposicoes: Record<string, boolean>): Set<string> {
  const ocultos = new Set(c.ocgPorOmissao);
  for (const [ocg, visivel] of Object.entries(sobreposicoes)) {
    if (visivel) ocultos.delete(ocg);
    else ocultos.add(ocg);
  }
  return ocultos;
}

/** Aplica as edições de objetos a uma cópia carregada do original e grava */
async function editarBytes(bytes: Uint8Array, edicoes: Edicao[]): Promise<{ bytes: Uint8Array; resumo: ResumoEdicao }> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const resumo = aplicarEdicoes(pdf, edicoes);
  return { bytes: await pdf.save({ useObjectStreams: false }), resumo };
}

function publicar(id: number) {
  if (!analise || !config) return;
  const avisos = [...new Set(analise.paginas.flatMap((p) => p.ir.avisos))];
  // Páginas só de texto não podem ter QR codes: não vale a pena renderizá-las para os procurar
  const paginasGraficas = analise.paginas.filter((p) => p.ir.eventos.some((e) => e.tipo !== 'texto')).map((p) => p.info.indice);
  if (!fontesInventariadas && contexto) {
    const usadas = new Set(analise.paginas.flatMap((p) => p.ir.fontesUsadas));
    fontesInventariadas = inventariarFontes(contexto.l, analise.fontes, usadas);
  }
  const inventario = { ...inventariar(analise, config), fontes: fontesInventariadas ?? [] };
  const extras = tintaImagens ? alertasTintaImagens(analise, tintaImagens, config) : [];
  enviar({ tipo: 'alertas', id, alertas: ordenarAlertas([...calcularAlertas(analise, config), ...extras]), avisos, paginasGraficas, inventario });
}

ctx.onmessage = async (ev: MessageEvent<Entrada>) => {
  const m = ev.data;

  if (m.tipo === 'objetos') {
    if (m.id !== idAtual || !contexto || m.pagina < 0 || m.pagina >= contexto.info.paginas.length) return;
    enviar({ tipo: 'objetos', id: m.id, pedido: m.pedido, pagina: m.pagina, objetos: listarObjetos(contexto, m.pagina) });
    return;
  }

  if (m.tipo === 'editar') {
    if (m.id !== idAtual || !bytesOriginais) return;
    try {
      const r = await editarBytes(bytesOriginais, m.edicoes);
      ctx.postMessage({ tipo: 'editado', id: m.id, pedido: m.pedido, bytes: r.bytes, resumo: r.resumo } satisfies Saida, [r.bytes.buffer]);
    } catch (e) {
      enviar({ tipo: 'editar-falhou', id: m.id, pedido: m.pedido, mensagem: (e as Error).message });
    }
    return;
  }

  if (m.tipo === 'corrigir') {
    if (m.id !== idAtual || !bytesOriginais || !config) return;
    try {
      // as edições de objetos entram primeiro: as correções partem do ficheiro já editado
      const editado = m.edicoes?.length ? await editarBytes(bytesOriginais, m.edicoes) : null;
      const r = await aplicarCorrecoes(editado?.bytes ?? bytesOriginais, m.correcoes, config);
      if (editado) r.resumo.edicoes = editado.resumo;
      ctx.postMessage({ tipo: 'corrigido', id: m.id, pedido: m.pedido, bytes: r.bytes, resumo: r.resumo } satisfies Saida, [r.bytes.buffer]);
    } catch (e) {
      enviar({ tipo: 'corrigir-falhou', id: m.id, pedido: m.pedido, mensagem: (e as Error).message });
    }
    return;
  }

  if (m.tipo === 'separar') {
    if (m.id !== idAtual || !contexto || m.pagina < 0 || m.pagina >= contexto.info.paginas.length) return;
    try {
      const resultado = await separarPagina(contexto, m.pagina, ocgOcultosCom(contexto, m.sobreposicoes), m.simularOverprint);
      ctx.postMessage({ tipo: 'separacao', id: m.id, pedido: m.pedido, resultado } satisfies Saida, [resultado.bytes.buffer]);
    } catch (e) {
      enviar({ tipo: 'separacao-falhou', id: m.id, pedido: m.pedido, mensagem: (e as Error).message });
    }
    return;
  }

  if (m.tipo === 'inspecionar') {
    if (m.id !== idAtual || !contexto || m.pagina < 0 || m.pagina >= contexto.info.paginas.length) return;
    const ocultos = ocgOcultosCom(contexto, m.sobreposicoes);
    enviar({ tipo: 'inspecao', id: m.id, pedido: m.pedido, ir: inspecionarPagina(contexto, m.pagina, ocultos), totalCamadas: contexto.totalCamadas });
    return;
  }

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
  contexto = null;
  bytesOriginais = m.bytes;
  fontesInventariadas = null;
  tintaImagens = null;
  try {
    const pdf = await abrirPdf(m.bytes);
    const info = lerPaginas(pdf);
    contexto = prepararInspecao(pdf, info);
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
    // as imagens medem-se a seguir: os alertas já estão no ecrã e este passo pode demorar
    if (contexto && analise) {
      const meu = m.id;
      tintaImagens = medirTintaDasImagens(contexto, analise);
      if (tintaImagens.size && meu === idAtual) publicar(meu);
    }
  } catch (e) {
    enviar({ tipo: 'erro', id: m.id, mensagem: (e as Error).message });
  }
};
