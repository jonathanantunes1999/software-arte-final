<script lang="ts">
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import { lerDocumento, type DocumentoInfo } from '../analise/documento';
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
      const [dados, novoPreview] = await Promise.all([lerDocumento(bytes), abrirPreview(bytes)]);
      preview?.loadingTask.destroy();
      preview = novoPreview;
      info = dados;
      nome = ficheiro.name;
      pagina = 0;
    } catch (e) {
      erro =
        e instanceof PdfProtegidoErro
          ? e.message
          : 'Não consegui abrir este ficheiro. Confirma que é um PDF válido.';
      console.error(e);
    } finally {
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
    onabrir={() => entrada.click()}
    ondefinicoes={() => (definicoesAbertas = true)}
  />

  <main>
    <aside class="esquerda">
      <PainelAlertas {info} bind:pagina />
    </aside>

    <section class="centro">
      {#if preview && info && paginaInfo}
        <Visualizador doc={preview} bind:pagina total={info.paginas.length} info={paginaInfo} />
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
