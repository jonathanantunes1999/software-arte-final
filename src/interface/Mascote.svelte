<script module lang="ts">
  export type EstadoMascote = 'repouso' | 'analisa' | 'ok' | 'aviso' | 'erro';
</script>

<script lang="ts">
  /**
   * A mascote: um corpo macio (superelipse) com luz, sombra e brilho para ter volume, dois olhos e
   * rubor, e quatro bolas brilhantes nas cores das tintas (ciano, magenta, amarelo, preto) à volta.
   * A cor, o acessório e as bolas são do utilizador (Definições → Mascote). Os olhos seguem o rato,
   * clicar nela faz uma festa, e a analisar voa com as bolas atrás.
   */
  import { definicoes } from './definicoes.svelte';
  import { abrirDefinicoes } from './navegacao.svelte';
  import { BOLAS_CMYK, superelipse, tons, type PerfilMascote } from '../mascote/personalizacao';

  interface Props {
    estado?: EstadoMascote;
    /** Largura em px */
    tamanho?: number;
    /** Reserva espaço atrás para as bolas CMYK, que vão atrás dela quando está a analisar */
    cauda?: boolean;
    /** Os olhos seguem o rato */
    seguir?: boolean;
    /** Clicar faz uma festa */
    interativa?: boolean;
    /** Botão direito abre as Definições da mascote */
    configuravel?: boolean;
    /** Perfil a usar; sem isto usa o das Definições */
    perfil?: PerfilMascote;
    titulo?: string;
  }
  let { estado = 'repouso', tamanho = 120, cauda = false, seguir = true, interativa = true, configuravel = true, perfil, titulo = 'A mascote da Arte Final' }: Props = $props();

  const p = $derived(perfil ?? definicoes.mascote);
  const t = $derived(tons(p.cor));
  const animada = $derived(p.animada);
  const id = `masc${Math.random().toString(36).slice(2, 8)}`;

  const CORPO = superelipse(120, 140, 88, 70, 2.7, 96);
  let raiz: SVGSVGElement | undefined = $state();
  let olhar = $state<{ x: number; y: number } | null>(null);
  let festa = $state(false);

  $effect(() => {
    if (!seguir || !animada || !raiz || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let quadro = 0;
    let desistir: ReturnType<typeof setTimeout>;
    const mover = (e: PointerEvent) => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const r = raiz!.getBoundingClientRect();
        const fx = cauda ? 0.62 : 0.5;
        const dx = e.clientX - (r.left + r.width * fx);
        const dy = e.clientY - (r.top + r.height * 0.58);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 110);
        olhar = { x: (dx / d) * k, y: (dy / d) * k };
        clearTimeout(desistir);
        desistir = setTimeout(() => (olhar = null), 3500);
      });
    };
    window.addEventListener('pointermove', mover, { passive: true });
    return () => {
      cancelAnimationFrame(quadro);
      clearTimeout(desistir);
      window.removeEventListener('pointermove', mover);
    };
  });

  let temporizador: ReturnType<typeof setTimeout>;
  function fazerFesta() {
    if (!interativa || !animada) return;
    festa = false;
    requestAnimationFrame(() => {
      festa = true;
      clearTimeout(temporizador);
      temporizador = setTimeout(() => (festa = false), 900);
    });
  }

  const ox = $derived(olhar ? olhar.x * 7 : 0);
  const oy = $derived(olhar ? olhar.y * 4 : 0);
  const feliz = $derived(estado === 'ok' || festa);

  const vb = $derived(cauda ? { x: -96, y: 14, w: 336, h: 232 } : { x: 14, y: 14, w: 212, h: 232 });
  /** Cada bola: onde paira (repouso), para onde vai quando a mascote voa, e se fica à frente do corpo */
  const BOLAS = [
    { n: 0, cor: BOLAS_CMYK[0], r: 19, rx: 208, ry: 96, vx: 6, vy: 150, frente: false },
    { n: 1, cor: BOLAS_CMYK[1], r: 21, rx: 44, ry: 182, vx: -24, vy: 150, frente: true },
    { n: 2, cor: BOLAS_CMYK[2], r: 11, rx: 60, ry: 62, vx: -50, vy: 150, frente: false },
    { n: 3, cor: BOLAS_CMYK[3], r: 12, rx: 206, ry: 198, vx: -70, vy: 150, frente: true },
  ];
  const bolaTons = $derived(BOLAS.map((b) => tons(b.cor)));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
<svg
  bind:this={raiz}
  class="mascote {estado}"
  class:festa
  class:feliz
  class:segue={olhar !== null}
  class:clicavel={interativa}
  class:parada={!animada}
  class:com-cauda={cauda}
  style:--tinta={t.tinta}
  viewBox="{vb.x} {vb.y} {vb.w} {vb.h}"
  width={tamanho}
  height={(tamanho * vb.h) / vb.w}
  role="img"
  aria-label={titulo}
  onclick={fazerFesta}
  oncontextmenu={(e) => {
    if (!configuravel) return;
    e.preventDefault();
    abrirDefinicoes('mascote');
  }}
>
  <title>{configuravel ? `${titulo}. Botão direito para a personalizar.` : titulo}</title>
  <defs>
    <radialGradient id="{id}-corpo" cx="0.34" cy="0.26" r="0.95">
      <stop offset="0" stop-color={t.luz} />
      <stop offset="0.5" stop-color={t.base} />
      <stop offset="1" stop-color={t.sombra} />
    </radialGradient>
    <linearGradient id="{id}-sombra-baixo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.55" stop-color="#000" stop-opacity="0" />
      <stop offset="1" stop-color={t.sombra} stop-opacity="0.55" />
    </linearGradient>
    {#each BOLAS as b, i (b.n)}
      <radialGradient id="{id}-bola{b.n}" cx="0.35" cy="0.3" r="0.85">
        <stop offset="0" stop-color={bolaTons[i].luz} />
        <stop offset="0.5" stop-color={bolaTons[i].base} />
        <stop offset="1" stop-color={bolaTons[i].sombra} />
      </radialGradient>
    {/each}
    <filter id="{id}-b2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
    <filter id="{id}-b4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
    <filter id="{id}-b7" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" /></filter>
  </defs>

  <ellipse class="chao" cx="120" cy="226" rx="74" ry="9" filter="url(#{id}-b4)" />

  {#if cauda}
    <g class="vento"><rect x="-16" y="116" width="34" height="4" rx="2" /><rect x="8" y="196" width="40" height="4" rx="2" /><rect x="-46" y="164" width="24" height="4" rx="2" /></g>
  {/if}

  <g class="tudo">
    <g class="corpo-todo">
      <!-- bolas que ficam atrás do corpo -->
      {#if p.bolas}
        {#each BOLAS.filter((b) => !b.frente) as b (b.n)}
          <g class="pos" style:--rx="{b.rx}px" style:--ry="{b.ry}px" style:--vx="{b.vx}px" style:--vy="{b.vy}px">
            <g class="flota" style:--n={b.n}>
              <circle r={b.r} fill="url(#{id}-bola{b.n})" stroke={b.n === 3 ? '#7a8098' : 'none'} stroke-width="1.6" />
              <ellipse cx={-b.r * 0.32} cy={-b.r * 0.38} rx={b.r * 0.34} ry={b.r * 0.2} transform="rotate(-30 {-b.r * 0.32} {-b.r * 0.38})" fill="#fff" opacity="0.6" />
            </g>
          </g>
        {/each}
      {/if}

      <!-- corpo, com luz, sombra e brilho -->
      <path d={CORPO} fill="url(#{id}-corpo)" />
      <path d={CORPO} fill="url(#{id}-sombra-baixo)" />
      <ellipse class="brilho" cx="84" cy="100" rx="30" ry="13" transform="rotate(-20 84 100)" fill="#fff" opacity="0.6" filter="url(#{id}-b4)" />
      <ellipse cx="170" cy="190" rx="22" ry="7" transform="rotate(-25 170 190)" fill="#fff" opacity="0.1" filter="url(#{id}-b2)" />

      <!-- bolas que ficam à frente -->
      {#if p.bolas}
        {#each BOLAS.filter((b) => b.frente) as b (b.n)}
          <g class="pos" style:--rx="{b.rx}px" style:--ry="{b.ry}px" style:--vx="{b.vx}px" style:--vy="{b.vy}px">
            <g class="flota" style:--n={b.n}>
              <circle r={b.r} fill="url(#{id}-bola{b.n})" stroke={b.n === 3 ? '#7a8098' : 'none'} stroke-width="1.6" />
              <ellipse cx={-b.r * 0.32} cy={-b.r * 0.38} rx={b.r * 0.34} ry={b.r * 0.2} transform="rotate(-30 {-b.r * 0.32} {-b.r * 0.38})" fill="#fff" opacity="0.6" />
            </g>
          </g>
        {/each}
      {/if}

      <!-- rubor -->
      <g class="rubor" filter="url(#{id}-b4)">
        <ellipse cx="70" cy="152" rx="14" ry="8" fill="#ff7f9f" />
        <ellipse cx="170" cy="152" rx="14" ry="8" fill="#ff7f9f" />
      </g>

      <!-- cara -->
      <g class="cara" style:transform="translate({ox * 0.5}px, {oy * 0.5}px)">
        <!-- sobrancelhas (erro) -->
        <g class="sobrancelhas"><path d="M78 108 L102 114" /><path d="M162 108 L138 114" /></g>

        <g class="olhos" style:transform="translate({ox * 0.5}px, {oy * 0.5}px)">
          {#if feliz}
            <path class="olho-feliz" d="M80 140 Q92 124 104 140" />
            <path class="olho-feliz" d="M136 140 Q148 124 160 140" />
          {:else}
            <g class="olho"><ellipse cx="92" cy="134" rx="8.5" ry="12" /><circle cx="89.5" cy="129" r="3" class="luz" /></g>
            <g class="olho"><ellipse cx="148" cy="134" rx="8.5" ry="12" /><circle cx="145.5" cy="129" r="3" class="luz" /></g>
          {/if}
        </g>

        <!-- boca -->
        {#if feliz}
          <path class="boca cheia" d="M108 150 Q120 168 132 150 Z" />
        {:else if estado === 'aviso'}
          <ellipse class="boca-o" cx="120" cy="156" rx="4.5" ry="5.5" />
        {:else if estado === 'erro'}
          <path class="boca" d="M109 160 Q120 150 131 160" />
        {:else}
          <path class="boca" d="M111 152 Q115.5 158 120 152 Q124.5 158 129 152" />
        {/if}

        {#if estado === 'aviso'}<path class="suor" d="M186 104 q-7 11 0 15 q7 -4 0 -15 z" />{/if}
      </g>

      <!-- acessórios -->
      {#if p.acessorio === 'oculos'}
        <g class="oculos" style:transform="translate({ox * 0.5}px, {oy * 0.5}px)">
          <circle cx="92" cy="134" r="20" /><circle cx="148" cy="134" r="20" /><path d="M112 132 Q120 126 128 132" />
          <path class="reflexo" d="M78 124 Q82 118 90 117" /><path class="reflexo" d="M134 124 Q138 118 146 117" />
        </g>
      {:else if p.acessorio === 'boina'}
        <g class="boina">
          <path d="M70 94 Q70 62 124 60 Q176 62 172 96 Q150 84 120 84 Q92 84 70 94 Z" fill="#5b6bff" />
          <path d="M70 94 Q92 84 120 84 Q150 84 172 96" fill="none" stroke="#3f4ed0" stroke-width="5" stroke-linecap="round" />
          <circle cx="124" cy="58" r="5" fill="#3f4ed0" />
          <ellipse cx="100" cy="72" rx="16" ry="5" transform="rotate(-12 100 72)" fill="#fff" opacity="0.3" filter="url(#{id}-b2)" />
        </g>
      {:else if p.acessorio === 'laco'}
        <g class="laco">
          <path d="M164 84 L186 70 L188 98 Z" fill="#ec008c" /><path d="M164 84 L148 66 L146 96 Z" fill="#ec008c" />
          <circle cx="164" cy="84" r="7" fill="#c4006f" /><ellipse cx="174" cy="82" rx="6" ry="2.5" transform="rotate(-35 174 82)" fill="#fff" opacity="0.4" />
        </g>
      {/if}
    </g>

    <!-- selos de estado -->
    <g class="selo ok-selo"><circle cx="196" cy="70" r="15" /><path d="M189 71 l5 5 l10 -11" /></g>
    <g class="selo aviso-selo"><circle cx="196" cy="70" r="15" /><text x="196" y="72" text-anchor="middle" dominant-baseline="central">!</text></g>
    <g class="selo erro-selo"><circle cx="196" cy="70" r="15" /><path d="M190 64 l12 12 M202 64 l-12 12" /></g>
  </g>
</svg>

<style>
  .mascote {
    display: block;
    overflow: visible;
    user-select: none;
  }
  .clicavel {
    cursor: pointer;
  }
  .chao {
    fill: rgb(0 0 0 / 0.4);
    transform-box: fill-box;
    transform-origin: center;
    animation: chao 3.4s ease-in-out infinite;
  }
  @keyframes chao {
    50% {
      transform: scaleX(0.86);
      opacity: 0.6;
    }
  }

  /* respirar: aperta e estica, preso ao chão */
  .tudo {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: respira 3.4s ease-in-out infinite;
  }
  @keyframes respira {
    0%,
    100% {
      transform: scale(1, 1);
    }
    50% {
      transform: scale(1.015, 0.975);
    }
  }
  .corpo-todo {
    transform-box: fill-box;
    transform-origin: 50% 100%;
  }

  .brilho {
    mix-blend-mode: screen;
  }
  .rubor {
    opacity: 0.55;
    transition: opacity 0.3s;
  }
  .mascote.feliz .rubor,
  .mascote.festa .rubor {
    opacity: 0.95;
  }

  /* olhos */
  .cara,
  .olhos {
    transition: transform 0.14s ease-out;
  }
  .olho {
    fill: var(--tinta);
    transform-box: fill-box;
    transform-origin: 50% 50%;
    animation: pisca 5.4s infinite;
  }
  .olho .luz {
    fill: #fff;
  }
  @keyframes pisca {
    0%,
    93%,
    100% {
      transform: scaleY(1);
    }
    96% {
      transform: scaleY(0.08);
    }
  }
  .olho-feliz {
    fill: none;
    stroke: var(--tinta);
    stroke-width: 5;
    stroke-linecap: round;
  }
  .boca {
    fill: none;
    stroke: var(--tinta);
    stroke-width: 3.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .boca.cheia {
    fill: #b8445c;
    stroke-width: 3;
    fill-opacity: 0.9;
  }
  .boca-o {
    fill: #b8445c;
    stroke: var(--tinta);
    stroke-width: 2.6;
  }
  .sobrancelhas path {
    fill: none;
    stroke: var(--tinta);
    stroke-width: 4;
    stroke-linecap: round;
    opacity: 0;
  }
  .mascote.erro .sobrancelhas path {
    opacity: 1;
  }
  .suor {
    fill: #8ed4ff;
    stroke: #4aa8e0;
    stroke-width: 1.5;
    animation: pinga 1.4s ease-in infinite;
  }
  @keyframes pinga {
    0% {
      transform: translateY(-3px);
      opacity: 0;
    }
    30% {
      opacity: 1;
    }
    100% {
      transform: translateY(14px);
      opacity: 0;
    }
  }

  /* acessórios */
  .oculos circle {
    fill: rgb(255 255 255 / 0.14);
    stroke: var(--tinta);
    stroke-width: 4;
  }
  .oculos path {
    fill: none;
    stroke: var(--tinta);
    stroke-width: 4;
    stroke-linecap: round;
  }
  .oculos .reflexo {
    stroke: #fff;
    stroke-width: 3;
    opacity: 0.7;
  }
  .oculos {
    transition: transform 0.14s ease-out;
  }

  /* a analisar: a voar, com as bolas atrás em onda */
  .mascote.analisa .tudo {
    animation: voa 1.1s ease-in-out infinite;
  }
  @keyframes voa {
    0%,
    100% {
      transform: translateY(-4px) rotate(-6deg);
    }
    50% {
      transform: translateY(-16px) rotate(-3deg);
    }
  }
  .mascote.analisa .olhos {
    transform: translateX(6px);
  }
  /* as bolas: pairam à volta; quando a mascote voa, vão atrás dela */
  .pos {
    transform: translate(var(--rx), var(--ry));
    transition: transform 0.8s cubic-bezier(0.34, 1.25, 0.64, 1);
  }
  .mascote.com-cauda.analisa .pos {
    transform: translate(var(--vx), var(--vy));
  }
  .flota {
    animation: flota 4.2s ease-in-out infinite;
    animation-delay: calc(var(--n) * -1.1s);
  }
  @keyframes flota {
    0%,
    100% {
      transform: translate(0, 3px);
    }
    50% {
      transform: translate(0, -7px);
    }
  }
  .mascote.analisa .flota {
    animation: onda 0.9s ease-in-out infinite;
    animation-delay: calc(var(--n) * -0.14s);
  }
  @keyframes onda {
    0%,
    100% {
      transform: translate(-3px, 4px);
    }
    50% {
      transform: translate(4px, -14px);
    }
  }
  .vento {
    fill: #8d95a9;
    opacity: 0.5;
    animation: vento 0.5s linear infinite;
  }
  @keyframes vento {
    from {
      transform: translateX(22px);
    }
    to {
      transform: translateX(-22px);
    }
  }
  .mascote:not(.analisa) .vento {
    opacity: 0;
    transition: opacity 0.2s;
  }

  /* tudo em ordem / festa: saltinho */
  .mascote.ok .tudo {
    animation: salta 1s ease-in-out infinite;
  }
  .mascote.festa .tudo {
    animation: salta 0.45s ease-in-out 2;
  }
  @keyframes salta {
    0%,
    100% {
      transform: translateY(0) scale(1.04, 0.94);
    }
    45% {
      transform: translateY(-26px) scale(0.96, 1.05);
    }
  }

  /* aviso: treme de nervos */
  .mascote.aviso .tudo {
    animation: abana 0.5s ease-in-out infinite;
  }
  @keyframes abana {
    0%,
    100% {
      transform: rotate(-2.5deg);
    }
    50% {
      transform: rotate(2.5deg);
    }
  }
  .mascote.aviso .olho {
    animation: none;
    transform: scale(1.18);
  }

  /* erro: encolhe e abana a cabeça */
  .mascote.erro .tudo {
    animation: erro 0.5s ease-in-out infinite;
  }
  @keyframes erro {
    0%,
    100% {
      transform: translateX(0) scale(1.02, 0.94);
    }
    25% {
      transform: translateX(-4px) scale(1.02, 0.94);
    }
    75% {
      transform: translateX(4px) scale(1.02, 0.94);
    }
  }
  .mascote.erro .olho {
    animation: none;
    transform: scaleY(0.78);
  }

  /* selos */
  .selo {
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    transform: scale(0.4);
    transition: opacity 0.2s, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .ok-selo circle {
    fill: #2fbf71;
  }
  .aviso-selo circle {
    fill: #ffb547;
  }
  .erro-selo circle {
    fill: #e5393b;
  }
  .ok-selo path,
  .erro-selo path {
    fill: none;
    stroke: #fff;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .aviso-selo text {
    font: 800 20px ui-sans-serif, system-ui, sans-serif;
    fill: #3b2a00;
  }
  .mascote.ok .ok-selo,
  .mascote.aviso .aviso-selo,
  .mascote.erro .erro-selo {
    opacity: 1;
    transform: scale(1);
  }

  /* mascote quieta (escolha do utilizador): sem animações, só a pose do estado */
  .mascote.parada *,
  .mascote.parada {
    animation: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .mascote *,
    .mascote,
    .mascote.parada *,
    .mascote.parada {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
