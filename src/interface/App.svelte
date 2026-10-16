<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import type { Caixa } from '../analise/caixas';
  import type { TipoCorrecao } from '../alertas/correcao-sugerida';
  import { desktop, ficheiroDe, type FicheiroAberto } from './desktop';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import { alertasQr } from '../alertas/qr';
  import { extrairTexto } from '../revisao/extrair';
  import { revisarTexto } from '../revisao/revisar';
  import { ordenarAlertas, VERIFICACOES } from '../alertas/registo';
  import { gerarRelatorio } from '../relatorio/relatorio';
  import type { Alerta, ConfigAlertas } from '../alertas/tipos';
  import type { DocumentoInfo } from '../analise/documento';
  import type { CamadaInfo, PaginaIR } from '../analise/ir';
  import type { QrEncontrado } from '../analise/qr';
  import { ServicoAnalise } from './analise-servico';
  import { MAX_PAGINAS_QR, ServicoQr } from './qr-servico';
  import { abrirPreview, PdfProtegidoErro } from './pdf';
  import { definicoes, definicoesPorOmissao, guardarDefinicoes } from './definicoes.svelte';
  import Cabecalho from './Cabecalho.svelte';
  import Visualizador from './Visualizador.svelte';
  import PainelAlertas from './PainelAlertas.svelte';
  import PainelCaixas from './PainelCaixas.svelte';
  import PainelDireito from './PainelDireito.svelte';
  import PainelLayers from './PainelLayers.svelte';
  import PainelSeparacoes from './PainelSeparacoes.svelte';
  import PainelCorrecoes from './PainelCorrecoes.svelte';
  import type { PedidoCorrecoes, ResumoCorrecoes } from '../correcoes/aplicar';
  import type { Inventario } from '../correcoes/inventario';
  import type { Placa } from '../separacoes/placas';
  import type { Contagens } from '../separacoes/reescrever';
  import DialogoDefinicoes from './DialogoDefinicoes.svelte';
  import TiraPaginas from './TiraPaginas.svelte';
  import AjudaAtalhos from './AjudaAtalhos.svelte';
  import Inicio from './Inicio.svelte';

  let nome = $state('');
  let info = $state<DocumentoInfo | null>(null);
  let preview = $state.raw<PDFDocumentProxy | null>(null);
  let pagina = $state(0);
  let erro = $state<string | null>(null);
  let aCarregar = $state(false);
  let aArrastar = $state(false);
  let definicoesAbertas = $state(false);
  let ajudaAberta = $state(false);
  let entrada: HTMLInputElement;

  // --- análise (corre num worker)
  /** Alertas que saem da análise do PDF. Os dos QR codes juntam-se em `alertas`. */
  let alertasPdf = $state.raw<Alerta[]>([]);
  let inventario = $state.raw<Inventario | null>(null);
  /** Páginas onde os alertas dizem que falta sangria (ausente ou curta) */
  const paginasSemSangria = $derived(
    new Set(
      alertasPdf
        .filter((a) => a.id === 'sangria-ausente' || a.id === 'sangria-curta')
        .flatMap((a) => (a.locais?.length ? a.locais.map((l) => l.pagina) : a.pagina !== undefined ? [a.pagina] : [])),
    ).size,
  );
  let emAnalise = $state(false);
  let progresso = $state({ feitas: 0, total: 0 });
  let avisosAnalise = $state<string[]>([]);
  /** Alerta selecionado e qual dos seus locais está em foco */
  let ativo = $state<{ id: string; indice: number } | null>(null);
  let versaoFoco = $state(0);
  let esperaMedidas: { ok: (i: DocumentoInfo) => void; falha: (m: string) => void } | null = null;

  const servico = new ServicoAnalise({
    aoMedir: (i) => esperaMedidas?.ok(i),
    aoProgredir: (feitas, total) => (progresso = { feitas, total }),
    aoAlertar: (a, avisos, paginasGraficas, inv) => {
      alertasPdf = a;
      inventario = inv;
      avisosAnalise = avisos;
      emAnalise = false;
      // A procura de QR codes só arranca uma vez por ficheiro, quando a análise acaba
      // (aoAlertar volta a chamar-se quando se mudam limites, e aí não se procura de novo)
      if (qrPendente) {
        qrPendente = false;
        paginasComGraficos = paginasGraficas;
        qrPronto = true;
        iniciarQr();
        iniciarRevisaoTexto();
      }
    },
    aoFalhar: (m) => {
      if (esperaMedidas) esperaMedidas.falha(m);
      else erro = 'A análise falhou. Os alertas podem estar incompletos.';
      emAnalise = false;
    },
  });
  const servicoQr = new ServicoQr();

  // --- correções: criam uma cópia; o ficheiro aberto nunca é alterado
  const contar = (as: Alerta[]) => ({ erros: as.filter((a) => a.gravidade === 'erro').length, avisos: as.filter((a) => a.gravidade === 'aviso').length, infos: as.filter((a) => a.gravidade === 'info').length });
  let aCorrigir = $state(false);
  let falhouCorrecao = $state(false);
  let corrigido = $state.raw<{ bytes: Uint8Array; resumo: ResumoCorrecoes; nome: string } | null>(null);
  let alertasDepois = $state<{ erros: number; avisos: number; infos: number } | null>(null);
  let servicoCorrigido: ServicoAnalise | null = null;
  const alertasAntes = $derived(contar(alertasPdf));

  function descartarCorrecao() {
    sairDaComparacao();
    servicoCorrigido?.terminar();
    servicoCorrigido = null;
    corrigido = null;
    alertasDepois = null;
    falhouCorrecao = false;
  }

  async function aplicarCorrecoes(pedido: PedidoCorrecoes) {
    aCorrigir = true;
    falhouCorrecao = false;
    const r = await servico.corrigir(pedido);
    aCorrigir = false;
    if (!r) {
      falhouCorrecao = true;
      return;
    }
    descartarCorrecao();
    corrigido = { bytes: r.bytes, resumo: r.resumo, nome: nome.replace(/\.pdf$/i, '') + '_corrigido.pdf' };
    // analisa a cópia para mostrar quantos alertas ficam
    servicoCorrigido = new ServicoAnalise({
      aoMedir: () => {},
      aoProgredir: () => {},
      aoAlertar: (a) => (alertasDepois = contar(a)),
      aoFalhar: () => (alertasDepois = { erros: 0, avisos: 0, infos: 0 }),
    });
    servicoCorrigido.abrir(r.bytes.slice(), configAtual());
  }

  // --- comparar o original com a cópia corrigida
  let comparando = $state(false);
  let modoComparacao = $state<'antes' | 'depois' | 'diferenca'>('diferenca');
  let docCorrigido = $state.raw<PDFDocumentProxy | null>(null);
  let separacaoCorrigida = $state.raw<{ doc: PDFDocumentProxy; placas: Placa[]; chave: string } | null>(null);
  let geracaoComp = 0;

  function sairDaComparacao() {
    geracaoComp++;
    comparando = false;
    docCorrigido?.loadingTask.destroy();
    docCorrigido = null;
    separacaoCorrigida?.doc.loadingTask.destroy();
    separacaoCorrigida = null;
  }

  async function compararComCorrigido() {
    if (!corrigido) return;
    const minha = ++geracaoComp;
    const doc = await abrirPreview(corrigido.bytes);
    if (minha !== geracaoComp) {
      doc.loadingTask.destroy();
      return;
    }
    docCorrigido?.loadingTask.destroy();
    docCorrigido = doc;
    comparando = true;
  }

  // se as separações estão ligadas, compara-se também o resultado nas placas (é aí que o overprint se vê)
  $effect(() => {
    const ligado = comparando && sepAtiva && !!servicoCorrigido;
    const p = pagina;
    const sob = $state.snapshot(sobreposicoes);
    const simular = sepSimular;
    if (!ligado) {
      untrack(() => {
        separacaoCorrigida?.doc.loadingTask.destroy();
        separacaoCorrigida = null;
      });
      return;
    }
    untrack(() => void separarCorrigido(p, sob, simular));
  });

  async function separarCorrigido(p: number, sob: Record<string, boolean>, simular: boolean) {
    const minha = ++geracaoComp;
    const r = await servicoCorrigido!.separar(p, sob, simular);
    if (!r || minha !== geracaoComp) return;
    const doc = await abrirPreview(r.bytes);
    if (minha !== geracaoComp) {
      doc.loadingTask.destroy();
      return;
    }
    separacaoCorrigida?.doc.loadingTask.destroy();
    separacaoCorrigida = { doc, placas: r.placas, chave: `${p}:${minha}` };
  }

  /** Abre o relatório para o cliente num separador novo (de onde se imprime ou guarda em PDF) */
  function abrirRelatorio() {
    if (!info) return;
    const html = gerarRelatorio({
      nomeFicheiro: nome,
      geradoEm: new Date(),
      info,
      alertas,
      inventario,
      verificacoes: [...VERIFICACOES.ativas, ...(definicoes.revisarTexto ? ['texto em PT-PT (por regras)'] : [])],
      correcoes: corrigido?.resumo ?? null,
      autor: definicoes.autorRelatorio.trim() || undefined,
    });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function descarregarCorrigido() {
    if (!corrigido) return;
    // Desktop: diálogo nativo de gravar, na pasta do original e nunca por cima dele
    if (desktop) {
      void desktop.guardar(corrigido.nome, corrigido.bytes, caminhoOriginal);
      return;
    }
    const url = URL.createObjectURL(new Blob([corrigido.bytes.slice()], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = corrigido.nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // --- inspeção visual: página interpretada com contornos (leitor de cor) e layers
  /** Layers que o utilizador ligou (true) ou desligou (false); o que falta segue o ficheiro */
  let sobreposicoes = $state<Record<string, boolean>>({});
  let inspecao = $state.raw<PaginaIR | null>(null);
  let aInspecionar = $state(false);
  let totalCamadas = $state(0);
  /** Layers vistas por página: desligar uma layer pode esconder as que estão dentro dela, e a lista não pode encolher */
  let camadasVistas = $state.raw<Record<number, CamadaInfo[]>>({});
  const camadasPagina = $derived(camadasVistas[pagina] ?? []);
  let geracaoInspecao = 0;

  $effect(() => {
    const p = pagina;
    const ligado = !!info;
    const sob = $state.snapshot(sobreposicoes);
    if (!ligado) return;
    untrack(() => void inspecionar(p, sob));
  });

  async function inspecionar(p: number, sob: Record<string, boolean>) {
    const minha = ++geracaoInspecao;
    aInspecionar = true;
    const r = await servico.inspecionar(p, sob);
    if (!r || minha !== geracaoInspecao) return;
    aInspecionar = false;
    inspecao = r.ir;
    totalCamadas = r.totalCamadas;
    const antigas = camadasVistas[p] ?? [];
    const novas = r.ir.camadas.filter((c) => !antigas.some((a) => a.id === c.id));
    if (novas.length) camadasVistas = { ...camadasVistas, [p]: [...antigas, ...novas] };
  }

  // --- separações: PDF com uma página por placa, montado no worker
  let sepAtiva = $state(false);
  let sepSimular = $state(true);
  let sepEscondidas = $state<Record<string, boolean>>({});
  let sepVazias = $state<Record<string, boolean>>({});
  let sepAvisos = $state<Contagens | null>(null);
  let sepFalhou = $state(false);
  let aSeparar = $state(false);
  let separacao = $state.raw<{ doc: PDFDocumentProxy; placas: Placa[]; chave: string } | null>(null);
  let geracaoSep = 0;

  $effect(() => {
    const ativa = sepAtiva;
    const p = pagina;
    const sob = $state.snapshot(sobreposicoes);
    const simular = sepSimular;
    const ligado = !!info;
    if (!ativa || !ligado) {
      untrack(() => limparSeparacao());
      return;
    }
    untrack(() => void separar(p, sob, simular));
  });

  function limparSeparacao() {
    geracaoSep++;
    separacao?.doc.loadingTask.destroy();
    separacao = null;
    sepAvisos = null;
    sepFalhou = false;
    aSeparar = false;
  }

  async function separar(p: number, sob: Record<string, boolean>, simular: boolean) {
    const minha = ++geracaoSep;
    aSeparar = true;
    sepFalhou = false;
    const r = await servico.separar(p, sob, simular);
    if (minha !== geracaoSep) return;
    if (!r) {
      aSeparar = false;
      sepFalhou = true;
      return;
    }
    try {
      const doc = await abrirPreview(r.bytes);
      if (minha !== geracaoSep) {
        doc.loadingTask.destroy();
        return;
      }
      separacao?.doc.loadingTask.destroy();
      separacao = { doc, placas: r.placas, chave: `${p}:${minha}` };
      sepAvisos = r.avisos;
    } catch (e) {
      console.error(e);
      sepFalhou = true;
    }
    aSeparar = false;
  }

  function placasMedidas(chave: string, vazias: string[]) {
    if (separacao?.chave === chave) sepVazias = Object.fromEntries(vazias.map((id) => [id, true]));
  }
  const alternarPlaca = (id: string, visivel: boolean) => (sepEscondidas = { ...sepEscondidas, [id]: !visivel });
  const todasPlacas = () => (sepEscondidas = {});
  const nenhumaPlaca = () => (sepEscondidas = Object.fromEntries((separacao?.placas ?? []).map((pl) => [pl.id, true])));
  const soPlaca = (id: string) => (sepEscondidas = Object.fromEntries((separacao?.placas ?? []).filter((pl) => pl.id !== id).map((pl) => [pl.id, true])));

  function alternarLayer(id: string, visivel: boolean) {
    sobreposicoes = { ...sobreposicoes, [id]: visivel };
  }
  function reporLayers() {
    sobreposicoes = {};
  }
  function mostrarTodasLayers() {
    sobreposicoes = Object.fromEntries(Object.values(camadasVistas).flat().map((c) => [c.id, true]));
  }
  onDestroy(() => {
    servicoCorrigido?.terminar();
    servico.terminar();
    servicoQr.terminar();
  });

  // --- QR codes (lêem-se das páginas renderizadas, em segundo plano)
  let qrs = $state.raw<QrEncontrado[]>([]);
  let qrEstado = $state({ emCurso: false, feitas: 0, total: 0, limitado: false, limite: MAX_PAGINAS_QR });
  let paginasComGraficos: number[] = [];
  let qrPendente = false;
  let qrPronto = false;
  let geracaoQr = 0;

  function pararQr() {
    geracaoQr++;
    qrEstado = { ...qrEstado, emCurso: false, feitas: 0, total: 0, limitado: false };
  }

  async function iniciarQr() {
    pararQr();
    qrs = [];
    if (!definicoes.verificarQrCodes || !preview) return;
    const minha = geracaoQr;
    const doc = preview;
    const paginas = paginasComGraficos.slice(0, MAX_PAGINAS_QR);
    if (!paginas.length) return;
    qrEstado = { ...qrEstado, emCurso: true, feitas: 0, total: paginas.length, limitado: paginasComGraficos.length > MAX_PAGINAS_QR };
    await servicoQr.procurar(doc, paginas, {
      aoProgredir: (feitas, total) => {
        if (minha === geracaoQr) qrEstado = { ...qrEstado, feitas, total };
      },
      aoEncontrar: (novos) => {
        if (minha === geracaoQr) qrs = [...qrs, ...novos];
      },
      cancelado: () => minha !== geracaoQr,
    });
    if (minha === geracaoQr) qrEstado = { ...qrEstado, emCurso: false };
  }

  // Ligar ou desligar a procura de QR codes nas definições, com um ficheiro já aberto
  $effect(() => {
    const ligado = definicoes.verificarQrCodes;
    untrack(() => {
      if (!qrPronto) return;
      if (!ligado) {
        pararQr();
        qrs = [];
      } else if (!qrEstado.emCurso && qrs.length === 0) iniciarQr();
    });
  });

  // --- revisão do texto (lê-se do pdf.js, em segundo plano)
  let alertasTexto = $state.raw<Alerta[]>([]);
  let geracaoTexto = 0;

  async function iniciarRevisaoTexto() {
    const minha = ++geracaoTexto;
    alertasTexto = [];
    if (!definicoes.revisarTexto || !preview) return;
    try {
      const paginas = await extrairTexto(preview, undefined, () => minha !== geracaoTexto);
      if (minha === geracaoTexto) alertasTexto = revisarTexto(paginas);
    } catch {
      // o texto é um extra: se o pdf.js falhar, os restantes alertas não se perdem
    }
  }

  $effect(() => {
    const ligado = definicoes.revisarTexto;
    untrack(() => {
      if (!qrPronto) return;
      if (ligado) iniciarRevisaoTexto();
      else {
        geracaoTexto++;
        alertasTexto = [];
      }
    });
  });

  function configAtual(): ConfigAlertas {
    const num = (v: unknown, omissao: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : omissao);
    return {
      sangriaReferenciaMm: num(definicoes.sangriaReferenciaMm, 3),
      toleranciaFormatoMm: num(definicoes.toleranciaFormatoMm, 0.5),
      spotsTecnicas: $state.snapshot(definicoes.spotsTecnicas),
      resolucaoAvisoPpi: num(definicoes.resolucaoAvisoPpi, 300),
      resolucaoErroPpi: num(definicoes.resolucaoErroPpi, 150),
      linhaMinimaPt: num(definicoes.linhaMinimaPt, 0.25),
      textoPretoMaxPt: num(definicoes.textoPretoMaxPt, 12),
      fundoPretoMinimoPercent: num(definicoes.fundoPretoMinimoPercent, 25),
      zonaSegurancaMm: num(definicoes.zonaSegurancaMm, 3),
      verificarMarcasCorte: definicoes.verificarMarcasCorte !== false,
      qrTamanhoMinimoMm: num(definicoes.qrTamanhoMinimoMm, 20),
      overprintLinhaMaxPt: num(definicoes.overprintLinhaMaxPt, 1),
      marcasCorteCor: definicoes.marcasCorteCor === 'preto' ? 'preto' : 'registo',
      tintaTotalMaxPercent: num(definicoes.tintaTotalMaxPercent, 300),
      multiploPaginas: Math.round(num(definicoes.multiploPaginas, 4)),
    };
  }

  const config = $derived(configAtual());
  /** Todos os alertas, os do PDF e os dos QR codes, ordenados por gravidade */
  const alertas = $derived(ordenarAlertas([...alertasPdf, ...alertasQr(qrs, config), ...alertasTexto]));

  // Mudar limites nas definições recalcula só os alertas, sem reler o PDF
  $effect(() => {
    servico.atualizarConfig(configAtual());
  });

  // Se o alerta selecionado deixou de existir (ex.: mudou-se um limite), limpa a seleção
  $effect(() => {
    if (ativo && !alertas.some((a) => a.id === ativo!.id)) ativo = null;
  });

  const alertaAtivo = $derived(ativo ? alertas.find((a) => a.id === ativo!.id) : undefined);
  const indiceAtivo = $derived(alertaAtivo?.locais?.length ? Math.min(ativo!.indice, alertaAtivo.locais.length - 1) : 0);

  /** O que o visualizador desenha na página atual e para onde faz zoom */
  /** Alerta sobre o qual está o rato na lista */
  let alertaHover = $state<string | null>(null);
  const MAX_MARCAS = 150;
  /** Todos os locais de alertas desta página, não só o do alerta selecionado */
  const marcas = $derived.by(() => {
    const r: { caixa: Caixa; ativa: boolean; alertaId: string; indice: number; gravidade: Alerta['gravidade']; numero: number }[] = [];
    alertas.forEach((a, k) => {
      (a.locais ?? []).forEach((l, i) => {
        if (l.pagina !== pagina || r.length >= MAX_MARCAS) return;
        // as notas não poluem a página: só aparecem quando se passa o rato na lista ou se selecionam
        const em = ativo?.id === a.id || alertaHover === a.id;
        if (a.gravidade === 'info' && !em) return;
        r.push({ caixa: l.caixa, ativa: ativo?.id === a.id && i === indiceAtivo, alertaId: a.id, indice: i, gravidade: a.gravidade, numero: k + 1 });
      });
    });
    // os maiores primeiro: os pequenos ficam por cima e continuam clicáveis
    const area = (c: Caixa) => (c.x1 - c.x0) * (c.y1 - c.y0);
    return r.sort((x, y) => area(y.caixa) - area(x.caixa));
  });

  /** Clicar num local na página seleciona o alerta e esse local, sem mexer no zoom */
  function selecionarPorMarca(alertaId: string, indice: number) {
    ativo = { id: alertaId, indice };
  }

  /** Alertas por página (uma vez por alerta), para os emblemas das miniaturas */
  const alertasPorPagina = $derived.by(() => {
    const m: Record<number, { erro: number; aviso: number; info: number }> = {};
    for (const a of alertas) {
      const paginas = new Set<number>((a.locais ?? []).map((l) => l.pagina));
      if (!paginas.size && a.pagina !== undefined) paginas.add(a.pagina);
      for (const p of paginas) (m[p] ??= { erro: 0, aviso: 0, info: 0 })[a.gravidade]++;
    }
    return m;
  });

  const foco = $derived(
    // só há foco (zoom) depois de o utilizador pedir um local na lista; clicar numa marca da página não mexe no zoom
    versaoFoco > 0 && alertaAtivo?.locais?.[indiceAtivo] ? { ...alertaAtivo.locais[indiceAtivo], versao: versaoFoco } : null,
  );

  function selecionar(a: Alerta) {
    const n = a.locais?.length ?? 0;
    // clicar outra vez no mesmo alerta passa ao local seguinte
    ativo = { id: a.id, indice: ativo?.id === a.id && n ? (indiceAtivo + 1) % n : 0 };
    const local = a.locais?.[ativo.indice];
    if (local) {
      pagina = local.pagina;
      versaoFoco++;
    } else if (a.pagina !== undefined) {
      pagina = a.pagina;
    }
  }

  const paginaInfo = $derived(info ? info.paginas[Math.min(pagina, info.paginas.length - 1)] : null);

  // Guardar definições sempre que mudam
  $effect(() => {
    guardarDefinicoes($state.snapshot(definicoes));
  });

  // Tema
  $effect(() => {
    const raiz = document.documentElement;
    if (definicoes.tema === 'auto') raiz.removeAttribute('data-tema');
    else raiz.setAttribute('data-tema', definicoes.tema);
  });

  // --- "Corrigir" a partir de um alerta: abre o painel Correções e prepara a opção certa
  type AbaDireita = 'layers' | 'separacoes' | 'correcoes' | 'caixas';
  let abaDireita = $state<AbaDireita>('layers');
  let pedidoCorrecao = $state<{ tipo: TipoCorrecao; n: number } | null>(null);
  function podeCorrigir(tipo: TipoCorrecao): boolean {
    const inv = inventario;
    if (!inv) return true;
    if (tipo === 'curvas') return inv.fontes.some((f) => f.convertivel);
    if (tipo === 'rgb-cmyk') return inv.rgb.vetores + inv.rgb.imagens > 0;
    if (tipo === 'juntar-spots') return inv.juncoesSugeridas.length > 0;
    if (tipo === 'faca-em-spot') return inv.coresDeTraco.length > 0;
    return true;
  }
  function pedirCorrecao(tipo: TipoCorrecao) {
    abaDireita = 'correcoes';
    pedidoCorrecao = { tipo, n: (pedidoCorrecao?.n ?? 0) + 1 };
  }

  /** Caminho do ficheiro aberto, só na versão desktop (para a cópia corrigida ir para a mesma pasta) */
  let caminhoOriginal = '';

  async function abrir(ficheiro: File, caminho = desktop?.caminhoDe(ficheiro) ?? '') {
    caminhoOriginal = caminho;
    erro = null;
    aCarregar = true;
    try {
      const bytes = new Uint8Array(await ficheiro.arrayBuffer());
      // O pdf.js copia os bytes; o worker fica com os originais
      const novoPreview = await abrirPreview(bytes);
      const medidas = new Promise<DocumentoInfo>((ok, falha) => (esperaMedidas = { ok, falha: (m) => falha(new Error(m)) }));
      pararQr();
      qrs = [];
      qrPronto = false;
      qrPendente = true;
      geracaoTexto++;
      alertasTexto = [];
      alertasPdf = [];
      avisosAnalise = [];
      sobreposicoes = {};
      sepEscondidas = {};
      sepVazias = {};
      sairDaComparacao();
      descartarCorrecao();
      inventario = null;
      limparSeparacao();
      inspecao = null;
      camadasVistas = {};
      totalCamadas = 0;
      ativo = null;
      progresso = { feitas: 0, total: 0 };
      emAnalise = true;
      servico.abrir(bytes, configAtual());
      const dados = await medidas;
      preview?.loadingTask.destroy();
      preview = novoPreview;
      info = dados;
      nome = ficheiro.name;
      pagina = 0;
    } catch (e) {
      emAnalise = false;
      erro =
        e instanceof PdfProtegidoErro
          ? e.message
          : 'Não consegui abrir este ficheiro. Confirma que é um PDF válido.';
      console.error(e);
    } finally {
      esperaMedidas = null;
      aCarregar = false;
    }
  }

  // --- painéis laterais redimensionáveis
  const MIN_LATERAL = 220;
  const MAX_LATERAL = 560;
  const limitar = (v: number) => Math.min(MAX_LATERAL, Math.max(MIN_LATERAL, v));
  function arrastarDivisor(lado: 'esq' | 'dir', ev: PointerEvent) {
    const alvo = ev.currentTarget as HTMLElement;
    alvo.setPointerCapture(ev.pointerId);
    const x0 = ev.clientX;
    const w0 = lado === 'esq' ? definicoes.larguraEsquerda : definicoes.larguraDireita;
    const mover = (e: PointerEvent) => {
      const w = limitar(w0 + (lado === 'esq' ? e.clientX - x0 : x0 - e.clientX));
      if (lado === 'esq') definicoes.larguraEsquerda = w;
      else definicoes.larguraDireita = w;
    };
    const acabar = () => {
      alvo.removeEventListener('pointermove', mover);
      alvo.removeEventListener('pointerup', acabar);
      alvo.removeEventListener('pointercancel', acabar);
    };
    alvo.addEventListener('pointermove', mover);
    alvo.addEventListener('pointerup', acabar);
    alvo.addEventListener('pointercancel', acabar);
  }
  function teclaDivisor(lado: 'esq' | 'dir', ev: KeyboardEvent) {
    const passo = ev.key === 'ArrowLeft' ? -16 : ev.key === 'ArrowRight' ? 16 : 0;
    if (!passo) return;
    ev.preventDefault();
    if (lado === 'esq') definicoes.larguraEsquerda = limitar(definicoes.larguraEsquerda + passo);
    else definicoes.larguraDireita = limitar(definicoes.larguraDireita - passo);
  }
  function reporLargura(lado: 'esq' | 'dir') {
    const base = definicoesPorOmissao();
    if (lado === 'esq') definicoes.larguraEsquerda = base.larguraEsquerda;
    else definicoes.larguraDireita = base.larguraDireita;
  }

  // --- atalhos globais (os do visualizador estão no próprio visualizador)
  function proximoAlerta(delta: number) {
    if (!alertas.length) return;
    const i = ativo ? alertas.findIndex((a) => a.id === ativo!.id) : -1;
    const k = i < 0 ? (delta > 0 ? 0 : alertas.length - 1) : (i + delta + alertas.length) % alertas.length;
    const a = alertas[k];
    ativo = { id: a.id, indice: 0 };
    const l = a.locais?.[0];
    if (l) {
      pagina = l.pagina;
      versaoFoco++;
    } else if (a.pagina !== undefined) pagina = a.pagina;
  }
  function aoTeclarApp(ev: KeyboardEvent) {
    const alvo = ev.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(alvo.tagName) || definicoesAbertas) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'o') {
      ev.preventDefault();
      pedirAbrir();
    } else if (!ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      if (ev.key === '?') ajudaAberta = !ajudaAberta;
      else if (ev.key === 'n' || ev.key === 'N') proximoAlerta(1);
      else if (ev.key === 'p' || ev.key === 'P') proximoAlerta(-1);
    }
  }

  /** PDF de demonstração, gerado no momento (nada para descarregar) */
  async function abrirExemplo() {
    const { gerarExemplo } = await import('../demo/exemplo');
    const bytes = await gerarExemplo();
    abrir(new File([bytes.slice()], 'exemplo-cartaz.pdf', { type: 'application/pdf' }), '');
  }

  async function pedirAbrir() {
    if (!desktop) return entrada.click();
    const f = await desktop.abrir();
    if (f) abrir(ficheiroDe(f), f.caminho);
  }

  function abrirDeFora(f: FicheiroAberto) {
    abrir(ficheiroDe(f), f.caminho);
  }

  /** Há pílula no topo do ecrã (modo notch): a janela pode recolher-se para lá */
  let comPilula = $state(false);

  onMount(() => {
    if (!desktop) return;
    desktop.ficheiroInicial().then((f) => f && abrirDeFora(f));
    desktop.modoNotch().then((v) => (comPilula = v));
    const parar = [desktop.aoAbrirFicheiro(abrirDeFora), desktop.aoModoNotch((v) => {
      comPilula = v;
    })];
    return () => parar.forEach((p) => p());
  });

  function aoEscolher(ev: Event) {
    const f = (ev.currentTarget as HTMLInputElement).files?.[0];
    if (f) abrir(f);
    (ev.currentTarget as HTMLInputElement).value = '';
  }

  function aoLargar(ev: DragEvent) {
    ev.preventDefault();
    aArrastar = false;
    const f = ev.dataTransfer?.files?.[0];
    if (f) abrir(f);
  }

  function aoArrastar(ev: DragEvent) {
    if (ev.dataTransfer?.types.includes('Files')) {
      ev.preventDefault();
      aArrastar = true;
    }
  }
</script>

<svelte:window
  onkeydown={aoTeclarApp}
  ondragover={aoArrastar}
  ondragleave={(e) => {
    if (e.relatedTarget === null) aArrastar = false;
  }}
  ondrop={aoLargar}
/>

<input bind:this={entrada} type="file" accept="application/pdf,.pdf" hidden onchange={aoEscolher} />

<div class="app">
  <Cabecalho
    {nome}
    pagina={paginaInfo}
    {info}
    {alertas}
    onabrir={pedirAbrir}
    ondefinicoes={() => (definicoesAbertas = true)}
    onrelatorio={abrirRelatorio}
    onajuda={() => (ajudaAberta = true)}
    {emAnalise}
    {progresso}
    onpilula={() => proximoAlerta(1)}
    onrecolher={comPilula ? () => desktop?.recolher() : undefined}
  />

  <main style:--esq="{definicoes.larguraEsquerda}px" style:--dir="{definicoes.larguraDireita}px">
    <aside class="esquerda">
      <PainelAlertas {info} {alertas} {emAnalise} {progresso} qr={qrEstado} avisos={avisosAnalise} ativo={alertaAtivo ? { id: alertaAtivo.id, indice: indiceAtivo } : null} onselecionar={selecionar} oncorrigir={pedirCorrecao} podeCorrigir={podeCorrigir} onpassar={(id) => (alertaHover = id)} />
    </aside>

    <!-- um separador que se arrasta e se move com as setas é um controlo: o Svelte ainda não o sabe -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div class="divisor esq" role="separator" aria-orientation="vertical" aria-label="Largura do painel de alertas" aria-valuenow={definicoes.larguraEsquerda} aria-valuemin={MIN_LATERAL} aria-valuemax={MAX_LATERAL} tabindex="0" title="Arrasta para mudar a largura. Duplo clique repõe." onpointerdown={(e) => arrastarDivisor('esq', e)} onkeydown={(e) => teclaDivisor('esq', e)} ondblclick={() => reporLargura('esq')}></div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div class="divisor dir" role="separator" aria-orientation="vertical" aria-label="Largura do painel de ferramentas" aria-valuenow={definicoes.larguraDireita} aria-valuemin={MIN_LATERAL} aria-valuemax={MAX_LATERAL} tabindex="0" title="Arrasta para mudar a largura. Duplo clique repõe." onpointerdown={(e) => arrastarDivisor('dir', e)} onkeydown={(e) => teclaDivisor('dir', e)} ondblclick={() => reporLargura('dir')}></div>

    <section class="centro" class:com-tira={!!preview && !!info && info.paginas.length > 1}>
      {#if preview && info && info.paginas.length > 1}
        <TiraPaginas doc={preview} {info} bind:pagina contagens={alertasPorPagina} />
      {/if}
      {#if preview && info && paginaInfo}
        <Visualizador doc={preview} bind:pagina total={info.paginas.length} info={paginaInfo} {marcas} {alertaHover} aoClicarMarca={selecionarPorMarca} {foco} {inspecao} {sobreposicoes} {separacao} escondidas={sepEscondidas} aoMedirPlacas={placasMedidas} comparar={comparando && docCorrigido ? { doc: docCorrigido, separacao: separacaoCorrigida } : null} bind:modoComparacao aoSairComparacao={sairDaComparacao} />
      {:else}
        <Inicio {aCarregar} {erro} onabrir={pedirAbrir} onexemplo={abrirExemplo} />
      {/if}
      {#if erro && preview}<div class="toast erro" role="alert">{erro}</div>{/if}
    </section>

    <aside class="direita">
      <PainelDireito numeroLayers={camadasPagina.length} bind:aba={abaDireita} aoMudar={() => (pedidoCorrecao = null)}>
        {#snippet layers()}
          <PainelLayers
            camadas={camadasPagina}
            {sobreposicoes}
            totalDocumento={totalCamadas}
            aCarregar={aInspecionar && !!info && !camadasVistas[pagina]}
            onalternar={alternarLayer}
            onrepor={reporLayers}
            onmostrarTodas={mostrarTodasLayers}
          />
        {/snippet}
        {#snippet separacoes()}
          <PainelSeparacoes
            ativa={sepAtiva}
            simular={sepSimular}
            placas={separacao?.placas ?? null}
            escondidas={sepEscondidas}
            vazias={sepVazias}
            aCarregar={aSeparar}
            falhou={sepFalhou}
            avisos={sepAvisos}
            onativar={(v) => (sepAtiva = v)}
            onsimular={(v) => (sepSimular = v)}
            onalternar={alternarPlaca}
            ontodas={todasPlacas}
            onnenhuma={nenhumaPlaca}
            onsolo={soPlaca}
          />
        {/snippet}
        {#snippet correcoes()}
          <PainelCorrecoes
            {inventario}
            sugestoes={definicoes.spotsTecnicas}
            {paginasSemSangria}
            sangriaMm={definicoes.sangriaReferenciaMm}
            {aCorrigir}
            resumo={corrigido?.resumo ?? null}
            antes={alertasAntes}
            depois={alertasDepois}
            falhou={falhouCorrecao}
            aoAplicar={aplicarCorrecoes}
            aoDescarregar={descarregarCorrigido}
            aoComparar={compararComCorrigido}
            pedido={pedidoCorrecao}
          />
        {/snippet}
        {#snippet caixas()}
          <PainelCaixas pagina={paginaInfo} />
        {/snippet}
      </PainelDireito>
    </aside>
  </main>

  {#if aArrastar}
    <div class="largar" aria-hidden="true"><span>Larga o PDF para abrir</span></div>
  {/if}

  {#if ajudaAberta}
    <AjudaAtalhos onfechar={() => (ajudaAberta = false)} />
  {/if}

  {#if definicoesAbertas}
    <DialogoDefinicoes onfechar={() => (definicoesAbertas = false)} />
  {/if}
</div>

<style>
  .app {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100%;
  }
  main {
    position: relative;
    display: grid;
    grid-template-columns: var(--esq, 290px) minmax(0, 1fr) var(--dir, 310px);
    min-height: 0;
  }
  /* pega entre painéis: 8 px de área para agarrar, linha fina visível ao passar */
  .divisor {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 9px;
    z-index: 20;
    cursor: col-resize;
    touch-action: none;
  }
  .divisor.esq {
    left: calc(var(--esq, 290px) - 4px);
  }
  .divisor.dir {
    right: calc(var(--dir, 310px) - 4px);
  }
  .divisor::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: transparent;
    transition: background 0.12s;
  }
  .divisor:hover::after,
  .divisor:focus-visible::after {
    background: var(--acento);
  }
  aside {
    background: var(--superficie);
    overflow: auto;
    min-height: 0;
  }
  .esquerda {
    border-right: 1px solid var(--borda);
  }
  .direita {
    border-left: 1px solid var(--borda);
  }
  .centro.com-tira {
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr);
  }
  .centro {
    position: relative;
    min-width: 0;
    min-height: 0;
    background: var(--area-visualizador);
  }
  .toast {
    position: absolute;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    padding: 8px 14px;
    border-radius: 8px;
    box-shadow: var(--sombra);
  }
  .toast.erro {
    background: var(--erro-fundo);
    color: var(--erro);
  }
  .largar {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--acento) 18%, transparent);
    border: 3px dashed var(--acento);
    pointer-events: none;
    z-index: 50;
  }
  .largar span {
    background: var(--superficie);
    padding: 14px 24px;
    border-radius: 10px;
    font-size: 18px;
    font-weight: 600;
    box-shadow: var(--sombra);
  }
  @media (max-width: 1000px) {
    main {
      grid-template-columns: var(--esq, 290px) minmax(0, 1fr);
    }
    .direita,
    .divisor.dir {
      display: none;
    }
  }
</style>
