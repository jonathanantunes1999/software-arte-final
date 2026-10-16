<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import { alertasQr } from '../alertas/qr';
  import { ordenarAlertas, VERIFICACOES } from '../alertas/registo';
  import { gerarRelatorio } from '../relatorio/relatorio';
  import type { Alerta, ConfigAlertas } from '../alertas/tipos';
  import type { DocumentoInfo } from '../analise/documento';
  import type { CamadaInfo, PaginaIR } from '../analise/ir';
  import type { QrEncontrado } from '../analise/qr';
  import { ServicoAnalise } from './analise-servico';
  import { MAX_PAGINAS_QR, ServicoQr } from './qr-servico';
  import { abrirPreview, PdfProtegidoErro } from './pdf';
  import { definicoes, guardarDefinicoes } from './definicoes.svelte';
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

  let nome = $state('');
  let info = $state<DocumentoInfo | null>(null);
  let preview = $state.raw<PDFDocumentProxy | null>(null);
  let pagina = $state(0);
  let erro = $state<string | null>(null);
  let aCarregar = $state(false);
  let aArrastar = $state(false);
  let definicoesAbertas = $state(false);
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
      verificacoes: VERIFICACOES.ativas,
      correcoes: corrigido?.resumo ?? null,
      autor: definicoes.autorRelatorio.trim() || undefined,
    });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function descarregarCorrigido() {
    if (!corrigido) return;
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
  const alertas = $derived(ordenarAlertas([...alertasPdf, ...alertasQr(qrs, config)]));

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
  const marcas = $derived(
    (alertaAtivo?.locais ?? [])
      .map((l, i) => ({ ...l, ativa: i === indiceAtivo }))
      .filter((l) => l.pagina === pagina)
      .map((l) => ({ caixa: l.caixa, ativa: l.ativa })),
  );
  const foco = $derived(
    alertaAtivo?.locais?.[indiceAtivo] ? { ...alertaAtivo.locais[indiceAtivo], versao: versaoFoco } : null,
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

  async function abrir(ficheiro: File) {
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
    onabrir={() => entrada.click()}
    ondefinicoes={() => (definicoesAbertas = true)}
    onrelatorio={abrirRelatorio}
  />

  <main>
    <aside class="esquerda">
      <PainelAlertas {info} {alertas} {emAnalise} {progresso} qr={qrEstado} avisos={avisosAnalise} ativo={alertaAtivo ? { id: alertaAtivo.id, indice: indiceAtivo } : null} onselecionar={selecionar} />
    </aside>

    <section class="centro">
      {#if preview && info && paginaInfo}
        <Visualizador doc={preview} bind:pagina total={info.paginas.length} info={paginaInfo} {marcas} {foco} {inspecao} {sobreposicoes} {separacao} escondidas={sepEscondidas} aoMedirPlacas={placasMedidas} comparar={comparando && docCorrigido ? { doc: docCorrigido, separacao: separacaoCorrigida } : null} bind:modoComparacao aoSairComparacao={sairDaComparacao} />
      {:else}
        <div class="vazio">
          <div class="cartao">
            <h1>Arrasta um PDF para aqui</h1>
            <p>Vês logo a medida final, a sangria e o resto.</p>
            <button class="primario" onclick={() => entrada.click()} disabled={aCarregar}>
              {aCarregar ? 'A abrir…' : 'Abrir PDF'}
            </button>
            {#if erro}<p class="erro" role="alert">{erro}</p>{/if}
          </div>
        </div>
      {/if}
      {#if erro && preview}<div class="toast erro" role="alert">{erro}</div>{/if}
    </section>

    <aside class="direita">
      <PainelDireito numeroLayers={camadasPagina.length}>
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
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr) 300px;
    min-height: 0;
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
  .centro {
    position: relative;
    min-width: 0;
    min-height: 0;
    background: var(--area-visualizador);
  }
  .vazio {
    height: 100%;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .cartao {
    text-align: center;
    background: var(--superficie);
    border: 2px dashed var(--borda);
    border-radius: 14px;
    padding: 48px 56px;
    max-width: 460px;
  }
  .cartao h1 {
    margin: 0 0 6px;
    font-size: 20px;
  }
  .cartao p {
    margin: 0 0 20px;
    color: var(--texto-2);
  }
  .cartao p.erro {
    margin: 16px 0 0;
    color: var(--erro);
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
      grid-template-columns: 220px minmax(0, 1fr);
    }
    .direita {
      display: none;
    }
  }
</style>
