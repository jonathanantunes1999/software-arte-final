<script lang="ts">
  import { onMount } from 'svelte';
  import { desktop } from './desktop';

  /**
   * A janelinha do "modo notch". A app fica escondida; quando se arrasta um ficheiro e se aproxima do
   * topo do ecrã, o processo principal mostra esta janela (na notch dos Macs que a têm, ou como pílula
   * solta nos outros) com "Coloca aqui o PDF". Ao largar, a janela principal nasce daqui e esta
   * desaparece. Nos primeiros arranques mostra também uma dica, para se saber que existe.
   */

  const ponte = desktop?.notch;
  let temNotch = $state(false);
  /** O processo principal mostrou a janelinha ('aberto' ou 'dica') */
  let modo = $state<'aberto' | 'dica' | null>(null);
  /** O ficheiro está mesmo por cima da janelinha */
  let sobre = $state(false);
  let erro = $state('');
  /** A animação de saída está a correr */
  let saindo = $state(false);

  onMount(() => {
    document.documentElement.classList.add('modo-notch');
    ponte?.info().then((i) => (temNotch = !!i?.temNotch));
    // o valor que as funções devolvem atravessa a ponte: têm de devolver vazio
    const pararMostrar = ponte?.aoMostrar((tipo) => {
      saindo = false;
      sobre = false;
      erro = '';
      modo = tipo === 'dica' ? 'dica' : 'aberto';
    });
    const pararEsconder = ponte?.aoEsconder(() => {
      saindo = true;
      setTimeout(() => {
        modo = null;
        saindo = false;
        sobre = false;
      }, 170);
    });
    return () => {
      pararMostrar?.();
      pararEsconder?.();
    };
  });

  // --- arrastar e largar
  let contador = 0;
  const temFicheiros = (ev: DragEvent) => !!ev.dataTransfer?.types.includes('Files');

  function aoEntrar(ev: DragEvent) {
    if (!temFicheiros(ev)) return;
    ev.preventDefault();
    contador++;
    sobre = true;
    erro = '';
    if (modo === 'dica') modo = 'aberto';
  }
  function aoSobrepor(ev: DragEvent) {
    if (!temFicheiros(ev)) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
  }
  function aoSair() {
    contador = Math.max(0, contador - 1);
    if (contador === 0) sobre = false;
  }
  async function aoLargar(ev: DragEvent) {
    ev.preventDefault();
    contador = 0;
    sobre = false;
    const f = ev.dataTransfer?.files?.[0];
    if (!f || !ponte) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      erro = 'Só PDFs';
      setTimeout(() => (erro = ''), 1800);
      return;
    }
    // o processo principal abre a janela principal e esconde esta
    const caminho = desktop?.caminhoDe(f) ?? '';
    const ok = caminho ? await ponte.soltar(caminho) : await ponte.soltarBytes(f.name, new Uint8Array(await f.arrayBuffer()));
    if (!ok) {
      erro = 'Não consegui abrir';
      setTimeout(() => (erro = ''), 2200);
    }
  }
</script>

<svelte:window ondragenter={aoEntrar} ondragover={aoSobrepor} ondragleave={aoSair} ondrop={aoLargar} />

<div class="cena" class:com-notch={temNotch}>
  {#if modo}
    <div class="zona {modo}" class:saindo class:sobre class:erro={!!erro} class:com-notch={temNotch}>
      {#if modo === 'aberto'}
        <div class="largar">
          <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
            <circle class="anel" cx="24" cy="24" r="21" />
            <path d="M24 33V15m0 0l-7 7m7-7l7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <div>
            <strong>{erro || (sobre ? 'Larga para abrir' : 'Coloca aqui o PDF')}</strong>
            <span>{erro ? 'Arrasta um ficheiro .pdf' : 'e a Arte Final abre-o já'}</span>
          </div>
        </div>
      {:else}
        <div class="texto-dica">
          <strong>Arte Final</strong>
          <span>Arrasta um PDF para o topo do ecrã e ele abre aqui</span>
        </div>
      {/if}
    </div>
  {/if}
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
  .zona {
    width: 100%;
    height: 100%;
    background: #000;
    color: #eef1f7;
    border-radius: 0 0 26px 26px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-top: 0;
    overflow: hidden;
    transform-origin: top center;
    animation: nasce 0.34s cubic-bezier(0.2, 0.9, 0.25, 1);
    box-shadow: 0 8px 30px rgb(0 0 0 / 0.5);
    display: grid;
    place-items: center;
  }
  /* sem notch física: pílula solta, arredondada por todos os lados */
  .zona:not(.com-notch) {
    border-radius: 999px;
    border-top: 1px solid rgb(255 255 255 / 0.08);
  }
  .zona:not(.com-notch).aberto,
  .zona:not(.com-notch).dica {
    border-radius: 30px;
  }
  /* na notch física os primeiros ~38 pt são a notch: o conteúdo começa por baixo */
  .zona.com-notch {
    padding-top: 38px;
  }
  .zona.aberto.sobre {
    background: radial-gradient(120% 140% at 50% 0%, #0b1a22 0%, #000 72%);
    border-color: rgb(94 224 255 / 0.5);
    box-shadow: 0 0 0 1px rgb(94 224 255 / 0.2), 0 12px 44px rgb(94 224 255 / 0.28);
  }
  .zona.erro {
    border-color: rgb(255 93 115 / 0.65);
    box-shadow: 0 0 0 1px rgb(255 93 115 / 0.25), 0 12px 44px rgb(255 93 115 / 0.25);
  }
  .zona.saindo {
    animation: recolhe 0.17s ease-in forwards;
  }
  @keyframes nasce {
    from {
      transform: scale(0.5, 0.25);
      opacity: 0.35;
    }
  }
  @keyframes recolhe {
    to {
      transform: scale(0.65, 0.4);
      opacity: 0;
    }
  }
  .largar {
    display: flex;
    align-items: center;
    gap: 18px;
    color: #5ee0ff;
    animation: entra 0.3s 0.08s ease both;
  }
  .zona.erro .largar {
    color: #ff5d73;
  }
  .largar div,
  .texto-dica {
    display: grid;
    text-align: left;
  }
  .largar strong {
    font-size: 19px;
    color: #eef1f7;
    letter-spacing: -0.015em;
  }
  .largar span {
    font-size: 12.5px;
    color: #8d95a9;
  }
  .texto-dica {
    text-align: center;
    gap: 2px;
    animation: entra 0.3s 0.08s ease both;
  }
  .texto-dica strong {
    font-size: 14px;
    letter-spacing: -0.01em;
  }
  .texto-dica span {
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
