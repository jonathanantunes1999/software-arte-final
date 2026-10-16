<script lang="ts">
  import { onMount } from 'svelte';
  import { desktop, type EstadoNotch, type EstadoPublicado } from './desktop';

  /**
   * A pílula do "modo notch": uma janela pequena, preta e transparente à volta, fixa no topo do
   * ecrã. Na notch dos Macs funde-se com ela (as "orelhas" ficam de cada lado); nos outros sistemas
   * é uma pílula solta. Larga-se um PDF lá em cima e a janela principal nasce dela.
   */

  const ponte = desktop?.notch;
  let temNotch = $state(false);
  let estado = $state<EstadoPublicado | null>(null);
  let aArrastar = $state(false);
  let intro = $state(true);
  let erro = $state('');
  let saindo = $state(false);

  type Visual = 'repouso' | 'arrasto' | 'analisa' | 'resultado';
  const visual = $derived<Visual>(
    aArrastar ? 'arrasto' : estado?.aberto ? (estado.emAnalise ? 'analisa' : 'resultado') : 'repouso',
  );
  /** Tamanho da janela que cada aspeto pede ao processo principal */
  const tamanhoPedido = $derived<EstadoNotch>(visual === 'arrasto' || erro ? 'aberto' : visual === 'repouso' && !intro ? 'repouso' : 'estado');

  let tamanhoAtual: EstadoNotch = 'repouso';
  $effect(() => {
    const novo = tamanhoPedido;
    if (novo === tamanhoAtual) return;
    const encolhe = (novo === 'repouso' && tamanhoAtual !== 'repouso') || (novo === 'estado' && tamanhoAtual === 'aberto');
    if (encolhe) {
      // primeiro a pílula recolhe (animação), só depois a janela encolhe
      saindo = true;
      setTimeout(() => {
        saindo = false;
        tamanhoAtual = novo;
        ponte?.tamanho(novo);
      }, 170);
    } else {
      tamanhoAtual = novo;
      ponte?.tamanho(novo);
    }
  });

  onMount(() => {
    document.documentElement.classList.add('modo-notch');
    ponte?.info().then((i) => {
      temNotch = !!i?.temNotch;
      if (i?.estado) estado = i.estado;
    });
    // o retorno de uma função passada à ponte também a atravessa: tem de ser vazio (um objeto reativo não se clona)
    const parar = ponte?.aoEstado((e) => {
      estado = e;
    });
    // ao arrancar a pílula diz ao que vem, e depois fica discreta
    const t = setTimeout(() => (intro = false), 4200);
    return () => {
      parar?.();
      clearTimeout(t);
    };
  });

  const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;
  const resultado = $derived(
    !estado
      ? ''
      : estado.erro || estado.aviso
        ? [estado.erro ? plural(estado.erro, 'erro', 'erros') : '', estado.aviso ? plural(estado.aviso, 'aviso', 'avisos') : ''].filter(Boolean).join(' · ')
        : 'Tudo em ordem',
  );
  const gravidade = $derived(estado?.erro ? 'erro' : estado?.aviso ? 'aviso' : 'ok');
  const fracao = $derived(estado && estado.total ? Math.min(1, estado.feitas / estado.total) : 0);

  // --- arrastar e largar
  let contador = 0;
  const temFicheiros = (ev: DragEvent) => !!ev.dataTransfer?.types.includes('Files');

  function aoEntrar(ev: DragEvent) {
    if (!temFicheiros(ev)) return;
    ev.preventDefault();
    contador++;
    erro = '';
    aArrastar = true;
  }
  function aoSobrepor(ev: DragEvent) {
    if (!temFicheiros(ev)) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
  }
  function aoSair() {
    contador = Math.max(0, contador - 1);
    if (contador === 0) aArrastar = false;
  }
  async function aoLargar(ev: DragEvent) {
    ev.preventDefault();
    contador = 0;
    aArrastar = false;
    const f = ev.dataTransfer?.files?.[0];
    if (!f || !ponte) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      erro = 'Só PDFs';
      setTimeout(() => (erro = ''), 1800);
      return;
    }
    const caminho = desktop?.caminhoDe(f) ?? '';
    const ok = caminho ? await ponte.soltar(caminho) : await ponte.soltarBytes(f.name, new Uint8Array(await f.arrayBuffer()));
    if (!ok) {
      erro = 'Não consegui abrir';
      setTimeout(() => (erro = ''), 2200);
    }
  }
</script>

<svelte:window ondragenter={aoEntrar} ondragover={aoSobrepor} ondragleave={aoSair} ondrop={aoLargar} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="cena" class:com-notch={temNotch}>
  <div
    class="pilula {visual}"
    class:saindo
    class:erro={!!erro}
    role="button"
    tabindex="0"
    aria-label="Arte Final. Larga um PDF aqui."
    onclick={() => ponte?.abrirJanela()}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && ponte?.abrirJanela()}
    oncontextmenu={(e) => {
      e.preventDefault();
      ponte?.menu();
    }}
  >
    {#if visual === 'arrasto' || erro}
      <div class="largar">
        <svg viewBox="0 0 48 48" width="46" height="46" aria-hidden="true">
          <circle class="anel" cx="24" cy="24" r="21" />
          <path d="M24 33V15m0 0l-7 7m7-7l7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div>
          <strong>{erro || 'Larga o PDF aqui'}</strong>
          <span>{erro ? 'Arrasta um ficheiro .pdf' : 'e vê o que a gráfica vai ver'}</span>
        </div>
      </div>
    {:else}
      <div class="linha" class:com-notch={temNotch}>
        <span class="orelha esq" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <defs><linearGradient id="g-n" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ee0ff" /><stop offset="1" stop-color="#8b7bff" /></linearGradient></defs>
            <rect width="24" height="24" rx="7" fill="url(#g-n)" />
            <path d="M8 5.5v10.5h10.5M5.5 8h2.5M16 18.5v-2.5" fill="none" stroke="#04121a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>

        {#if temNotch}
          <!-- no meio está a notch física: não se vê nada, por isso fica vazio e o estado vai para a orelha direita, em compacto -->
          <span class="meio-notch" aria-hidden="true"></span>
          <span class="orelha dir compacta">
            {#if visual === 'analisa'}
              <span class="texto mono">{estado && estado.total > 1 ? `${estado.feitas}/${estado.total}` : '…'}</span>
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                <circle cx="10" cy="10" r="7" class="pista" />
                <circle cx="10" cy="10" r="7" class="progresso" class:gira={!fracao} style:stroke-dasharray={2 * Math.PI * 7} style:stroke-dashoffset={2 * Math.PI * 7 * (1 - (fracao || 0.25))} />
              </svg>
            {:else if visual === 'resultado'}
              {#if estado?.erro}<span class="chip erro mono" title="Erros"><i></i>{estado.erro}</span>{/if}
              {#if estado?.aviso}<span class="chip aviso mono" title="Avisos"><i></i>{estado.aviso}</span>{/if}
              {#if !estado?.erro && !estado?.aviso}<span class="chip ok mono" title="Tudo em ordem"><i></i>OK</span>{/if}
            {:else if intro}
              <span class="texto mono suave">Larga um PDF</span>
              <i class="bolinha repouso"></i>
            {:else}
              <i class="bolinha repouso"></i>
            {/if}
          </span>
        {:else}
          <span class="meio">
            {#if visual === 'analisa'}
              <span class="texto mono">A analisar{estado && estado.total > 1 ? ` ${estado.feitas}/${estado.total}` : '…'}</span>
            {:else if visual === 'resultado'}
              <span class="texto mono {gravidade}">{resultado}</span>
            {:else if intro}
              <span class="texto mono suave">Arrasta um PDF para aqui</span>
            {:else}
              <span class="texto mono suave">Arte Final</span>
            {/if}
          </span>

          <span class="orelha dir" aria-hidden="true">
            {#if visual === 'analisa'}
              <svg viewBox="0 0 20 20" width="18" height="18">
                <circle cx="10" cy="10" r="7" class="pista" />
                <circle cx="10" cy="10" r="7" class="progresso" class:gira={!fracao} style:stroke-dasharray={2 * Math.PI * 7} style:stroke-dashoffset={2 * Math.PI * 7 * (1 - (fracao || 0.25))} />
              </svg>
            {:else if visual === 'resultado'}
              <i class="bolinha {gravidade}"></i>
            {:else}
              <i class="bolinha repouso"></i>
            {/if}
          </span>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  :global(html.modo-notch),
  :global(html.modo-notch body),
  :global(html.modo-notch #app) {
    background: transparent !important;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
  }
  .cena {
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  .pilula {
    width: 100%;
    height: 100%;
    background: #000;
    color: #eef1f7;
    border-radius: 0 0 20px 20px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-top: 0;
    overflow: hidden;
    cursor: pointer;
    transform-origin: top center;
    animation: nasce 0.34s cubic-bezier(0.2, 0.9, 0.25, 1);
    box-shadow: 0 8px 26px rgb(0 0 0 / 0.45);
  }
  /* pílula solta (sem notch física): arredondada por todos os lados */
  .cena:not(.com-notch) .pilula {
    border-radius: 999px;
    border-top: 1px solid rgb(255 255 255 / 0.08);
  }
  .cena:not(.com-notch) .pilula.arrasto,
  .cena:not(.com-notch) .pilula.erro {
    border-radius: 28px;
  }
  .pilula.arrasto,
  .pilula.erro {
    border-radius: 0 0 30px 30px;
    background: radial-gradient(120% 140% at 50% 0%, #0b1a22 0%, #000 70%);
    border-color: rgb(94 224 255 / 0.45);
    box-shadow: 0 0 0 1px rgb(94 224 255 / 0.2), 0 10px 40px rgb(94 224 255 / 0.25);
  }
  .pilula.erro {
    border-color: rgb(255 93 115 / 0.6);
    box-shadow: 0 0 0 1px rgb(255 93 115 / 0.25), 0 10px 40px rgb(255 93 115 / 0.25);
  }
  .pilula.saindo {
    animation: recolhe 0.17s ease-in forwards;
  }
  @keyframes nasce {
    from {
      transform: scale(0.55, 0.3);
      opacity: 0.4;
    }
  }
  @keyframes recolhe {
    to {
      transform: scale(0.7, 0.5);
      opacity: 0.2;
    }
  }
  .linha {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    gap: 10px;
  }
  .orelha {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
  }
  /* largura da notch física (cerca de 190 pt) */
  .meio-notch {
    flex: none;
    width: 190px;
  }
  .linha.com-notch {
    padding: 0 10px;
  }
  .orelha.compacta {
    width: auto;
    min-width: 24px;
    gap: 7px;
    display: flex;
    justify-content: flex-end;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 700;
  }
  .chip i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
  }
  .chip.erro {
    color: #ff5d73;
  }
  .chip.aviso {
    color: #ffb547;
  }
  .chip.ok {
    color: #3ddc97;
  }
  .meio {
    flex: 1;
    display: flex;
    justify-content: center;
    min-width: 0;
  }
  .texto {
    font: 600 12.5px ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    letter-spacing: -0.01em;
    white-space: nowrap;
    animation: entra 0.25s ease both;
  }
  .texto.suave {
    color: #8d95a9;
  }
  .texto.erro {
    color: #ff5d73;
  }
  .texto.aviso {
    color: #ffb547;
  }
  .texto.ok {
    color: #3ddc97;
  }
  .bolinha {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #8d95a9;
    animation: pulsa 2.6s ease-out infinite;
  }
  .bolinha.erro {
    background: #ff5d73;
  }
  .bolinha.aviso {
    background: #ffb547;
  }
  .bolinha.ok {
    background: #3ddc97;
  }
  .bolinha.repouso {
    background: #5ee0ff;
  }
  @keyframes pulsa {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 0%, transparent);
    }
    70%,
    100% {
      box-shadow: 0 0 0 8px transparent;
    }
  }
  .pista {
    fill: none;
    stroke: rgb(255 255 255 / 0.15);
    stroke-width: 2.4;
  }
  .progresso {
    fill: none;
    stroke: #5ee0ff;
    stroke-width: 2.4;
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: center;
    transition: stroke-dashoffset 0.25s;
  }
  .progresso.gira {
    animation: roda 0.9s linear infinite;
  }
  @keyframes roda {
    to {
      transform: rotate(270deg);
    }
  }
  .largar {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 14px 24px;
    color: #5ee0ff;
    animation: entra 0.3s 0.08s ease both;
  }
  .pilula.erro .largar {
    color: #ff5d73;
  }
  .largar div {
    display: grid;
    text-align: left;
  }
  .largar strong {
    font-size: 17px;
    color: #eef1f7;
    letter-spacing: -0.01em;
  }
  .largar span {
    font-size: 12px;
    color: #8d95a9;
  }
  .anel {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-dasharray: 5 5;
    transform-origin: center;
    animation: roda-lento 9s linear infinite;
  }
  @keyframes roda-lento {
    to {
      transform: rotate(360deg);
    }
  }
</style>
