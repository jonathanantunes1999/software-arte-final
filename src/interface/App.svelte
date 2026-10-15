<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import type { Alerta, ConfigAlertas } from '../alertas/tipos';
  import type { DocumentoInfo } from '../analise/documento';
  import { ServicoAnalise } from './analise-servico';
  import { abrirPreview, PdfProtegidoErro } from './pdf';
  import { definicoes, guardarDefinicoes } from './definicoes.svelte';
  import Cabecalho from './Cabecalho.svelte';
  import Visualizador from './Visualizador.svelte';
  import PainelAlertas from './PainelAlertas.svelte';
  import PainelCaixas from './PainelCaixas.svelte';
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
  let alertas = $state.raw<Alerta[]>([]);
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
    aoAlertar: (a, avisos) => {
      alertas = a;
      avisosAnalise = avisos;
      emAnalise = false;
    },
    aoFalhar: (m) => {
      if (esperaMedidas) esperaMedidas.falha(m);
      else erro = 'A análise falhou. Os alertas podem estar incompletos.';
      emAnalise = false;
    },
  });
  onDestroy(() => servico.terminar());

  function configAtual(): ConfigAlertas {
    const num = (v: unknown, omissao: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : omissao);
    return {
      sangriaReferenciaMm: num(definicoes.sangriaReferenciaMm, 3),
      toleranciaFormatoMm: num(definicoes.toleranciaFormatoMm, 0.5),
      spotsTecnicas: $state.snapshot(definicoes.spotsTecnicas),
      resolucaoAvisoPpi: num(definicoes.resolucaoAvisoPpi, 300),
      resolucaoErroPpi: num(definicoes.resolucaoErroPpi, 150),
    };
  }

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
      alertas = [];
      avisosAnalise = [];
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
  />

  <main>
    <aside class="esquerda">
      <PainelAlertas {info} {alertas} {emAnalise} {progresso} avisos={avisosAnalise} ativo={alertaAtivo ? { id: alertaAtivo.id, indice: indiceAtivo } : null} onselecionar={selecionar} />
    </aside>

    <section class="centro">
      {#if preview && info && paginaInfo}
        <Visualizador doc={preview} bind:pagina total={info.paginas.length} info={paginaInfo} {marcas} {foco} />
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
      <PainelCaixas pagina={paginaInfo} />
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
    grid-template-columns: 280px minmax(0, 1fr) 260px;
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
