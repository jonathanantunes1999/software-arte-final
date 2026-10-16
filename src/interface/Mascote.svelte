<script module lang="ts">
  export type EstadoMascote = 'repouso' | 'analisa' | 'ok' | 'aviso' | 'erro';
</script>

<script lang="ts">
  /**
   * Regi: o corpo é o diagrama das tintas (ciano, magenta e amarelo, com as misturas onde se
   * sobrepõem e o preto no meio), com olhos de meio-disco e asas pequenas. Atrás vão as quatro bolas
   * CMYK, a seguirem-no. Formas planas, sem contornos.
   */
  interface Props {
    estado?: EstadoMascote;
    /** Largura em px */
    tamanho?: number;
    /** Mostra as quatro bolas atrás (em tamanhos pequenos convém desligar) */
    cauda?: boolean;
    /** Os olhos seguem o rato */
    seguir?: boolean;
    /** Texto para leitores de ecrã */
    titulo?: string;
  }
  let { estado = 'repouso', tamanho = 120, cauda = true, seguir = true, titulo = 'Regi, a mascote da Arte Final' }: Props = $props();

  const id = `regi${Math.random().toString(36).slice(2, 8)}`;
  let raiz: SVGSVGElement | undefined = $state();
  /** -1 (esquerda) a 1 (direita); null = olha por si */
  let olhar = $state<{ x: number; y: number } | null>(null);

  $effect(() => {
    if (!seguir || !raiz || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let quadro = 0;
    let desistir: ReturnType<typeof setTimeout>;
    const mover = (e: PointerEvent) => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const r = raiz!.getBoundingClientRect();
        const alvo = { x: r.left + r.width * (cauda ? 0.63 : 0.5), y: r.top + r.height * 0.6 };
        const dx = e.clientX - alvo.x;
        const dy = e.clientY - alvo.y;
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 120);
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

  const px = $derived(olhar ? olhar.x * 34 : 0);
  const py = $derived(olhar ? olhar.y * 5 : 0);

  const vb = $derived(cauda ? { x: 40, y: 28, w: 430, h: 232 } : { x: 150, y: 28, w: 320, h: 232 });
  const bolas = [
    { cx: 178, r: 17, cor: '#00aeef', n: 0 },
    { cx: 136, r: 14, cor: '#ec008c', n: 1 },
    { cx: 100, r: 12, cor: '#ffd400', n: 2 },
    { cx: 71, r: 9.5, cor: '#1c1a1f', n: 3 },
  ];
</script>

<svg bind:this={raiz} class="regi {estado}" class:segue={olhar !== null} viewBox="{vb.x} {vb.y} {vb.w} {vb.h}" width={tamanho} height={(tamanho * vb.h) / vb.w} role="img" aria-label={titulo}>
  <defs>
    <clipPath id="{id}-c"><circle cx="280" cy="120" r="64" /></clipPath>
    <clipPath id="{id}-m"><circle cx="340" cy="120" r="64" /></clipPath>
    <clipPath id="{id}-olho"><path d="M-80 0 A80 80 0 0 1 80 0 Z" /></clipPath>
  </defs>

  <ellipse class="chao" cx="310" cy="252" rx="62" ry="6" />

  <!-- velocidade (só a voar) -->
  {#if cauda}
    <g class="vento">
      <rect x="96" y="86" width="44" height="5" rx="2.5" />
      <rect x="126" y="196" width="56" height="5" rx="2.5" />
      <rect x="64" y="176" width="30" height="5" rx="2.5" />
    </g>

    <!-- as quatro bolas -->
    <g class="cauda">
      {#each bolas as b (b.n)}
        <g class="bola" style:--n={b.n}>
          <circle cx={b.cx} cy="156" r={b.r} fill={b.cor} />
          {#if b.n === 3}<circle cx={b.cx} cy="156" r={b.r - 2} fill="none" stroke="#6b7088" stroke-width="2" />{/if}
        </g>
      {/each}
    </g>
  {/if}

  <g class="tudo">
    <!-- asas -->
    <g class="asa esq"><path d="M230 116 C208 82 168 82 166 104 C166 124 202 130 230 126 Z" /></g>
    <g class="asa dir"><path d="M390 116 C412 82 452 82 454 104 C454 124 418 130 390 126 Z" /></g>

    <!-- corpo: ciano, magenta e amarelo, com as misturas -->
    <g class="corpo">
      <circle cx="280" cy="120" r="64" fill="#00aeef" />
      <circle cx="340" cy="120" r="64" fill="#ec008c" />
      <circle cx="310" cy="172" r="64" fill="#ffd400" />
      <g clip-path="url(#{id}-c)"><circle cx="340" cy="120" r="64" fill="#3b2f9e" /></g>
      <g clip-path="url(#{id}-c)"><circle cx="310" cy="172" r="64" fill="#00a651" /></g>
      <g clip-path="url(#{id}-m)"><circle cx="310" cy="172" r="64" fill="#ee2a24" /></g>
      <g clip-path="url(#{id}-c)"><g clip-path="url(#{id}-m)"><circle cx="310" cy="172" r="64" fill="#211d24" /></g></g>

      <!-- olhos -->
      <g transform="translate(288 142) scale(0.3)">
        <g class="olho">
          <g clip-path="url(#{id}-olho)">
            <path d="M-80 0 A80 80 0 0 1 80 0 Z" class="esclera" />
            <g class="mira" style:transform="translate({px}px, {py}px)">
              <g class="pupila-anim"><path d="M-22 0 A50 76 0 0 1 78 0 Z" class="pupila" /></g>
            </g>
          </g>
        </g>
      </g>
      <g transform="translate(334 142) scale(0.3)">
        <g class="olho">
          <g clip-path="url(#{id}-olho)">
            <path d="M-80 0 A80 80 0 0 1 80 0 Z" class="esclera" />
            <g class="mira" style:transform="translate({px}px, {py}px)">
              <g class="pupila-anim"><path d="M-22 0 A50 76 0 0 1 78 0 Z" class="pupila" /></g>
            </g>
          </g>
        </g>
      </g>
    </g>

    <!-- selos de estado -->
    <g class="selo ok-selo"><circle cx="388" cy="64" r="22" /><path d="M377 65 l8 8 l16 -17" /></g>
    <g class="selo aviso-selo"><circle cx="388" cy="64" r="22" /><text x="388" y="66" text-anchor="middle" dominant-baseline="central">!</text></g>
  </g>
</svg>

<style>
  .regi {
    display: block;
    overflow: visible;
    user-select: none;
  }
  .chao {
    fill: rgb(0 0 0 / 0.28);
    transform-box: fill-box;
    transform-origin: center;
    animation: chao 3s ease-in-out infinite;
  }
  @keyframes chao {
    50% {
      transform: scaleX(0.82);
      opacity: 0.6;
    }
  }

  /* flutuar */
  .tudo {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: flutua 3s ease-in-out infinite;
  }
  @keyframes flutua {
    50% {
      transform: translateY(-10px);
    }
  }

  /* as bolas vão atrás, em onda, cada uma um pouco depois da anterior */
  .bola {
    transform-box: fill-box;
    transform-origin: center;
    animation: onda 3s ease-in-out infinite;
    animation-delay: calc(var(--n) * -0.28s);
  }
  @keyframes onda {
    0%,
    100% {
      transform: translateY(2px);
    }
    50% {
      transform: translateY(-14px);
    }
  }
  .vento {
    opacity: 0;
    fill: #8d95a9;
  }

  /* asas */
  .asa path {
    fill: #fff7ee;
  }
  .asa {
    transform-box: view-box;
    animation: bate 0.9s ease-in-out infinite;
  }
  .asa.esq {
    transform-origin: 230px 118px;
  }
  .asa.dir {
    transform-origin: 390px 118px;
    animation-name: bate-dir;
  }
  @keyframes bate {
    50% {
      transform: rotate(-22deg);
    }
  }
  @keyframes bate-dir {
    50% {
      transform: rotate(22deg);
    }
  }

  /* olhos */
  .esclera {
    fill: #fff7ee;
  }
  .pupila {
    fill: #000;
  }
  .olho {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: pisca 5s infinite;
  }
  .mira {
    transition: transform 0.14s ease-out;
  }
  .pupila-anim {
    animation: olha 7s ease-in-out infinite;
  }
  .regi.segue .pupila-anim {
    animation: none;
  }
  @keyframes pisca {
    0%,
    92%,
    100% {
      transform: scaleY(1);
    }
    95% {
      transform: scaleY(0.06);
    }
  }
  @keyframes olha {
    0%,
    12% {
      transform: translateX(0);
    }
    22%,
    40% {
      transform: translateX(-34px);
    }
    52%,
    66% {
      transform: translateX(34px);
    }
    78%,
    100% {
      transform: translateX(0);
    }
  }

  /* a analisar = a voar para a direita, depressa */
  .regi.analisa .tudo {
    animation: voa 1.1s ease-in-out infinite;
  }
  @keyframes voa {
    0%,
    100% {
      transform: translateY(0) rotate(-7deg);
    }
    50% {
      transform: translateY(-12px) rotate(-3deg);
    }
  }
  .regi.analisa .asa {
    animation-duration: 0.18s;
  }
  .regi.analisa .bola {
    animation: onda-rapida 0.9s ease-in-out infinite;
    animation-delay: calc(var(--n) * -0.14s);
  }
  @keyframes onda-rapida {
    0%,
    100% {
      transform: translate(-6px, 4px);
    }
    50% {
      transform: translate(6px, -16px);
    }
  }
  .regi.analisa .pupila-anim {
    animation: none;
    transform: translateX(30px);
  }
  .regi.analisa .vento {
    opacity: 0.55;
    animation: vento 0.5s linear infinite;
  }
  @keyframes vento {
    from {
      transform: translateX(26px);
    }
    to {
      transform: translateX(-26px);
    }
  }

  /* tudo em ordem: saltinho, bolas a saltar como confetti e olhos felizes */
  .regi.ok .tudo {
    animation: salta 1s ease-in-out infinite;
  }
  @keyframes salta {
    0%,
    100% {
      transform: translateY(0) scale(1.03, 0.96);
    }
    45% {
      transform: translateY(-26px) scale(0.97, 1.04);
    }
  }
  .regi.ok .bola {
    animation: pula 1s ease-in-out infinite;
    animation-delay: calc(var(--n) * -0.12s);
  }
  @keyframes pula {
    0%,
    100% {
      transform: translateY(0);
    }
    45% {
      transform: translateY(-30px) scale(1.12);
    }
  }
  .regi.ok .pupila-anim {
    animation: none;
    transform: translateX(6px);
  }

  /* aviso: asas para cima, a tremer, bolas nervosas */
  .regi.aviso .tudo {
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
  .regi.aviso .asa {
    animation: none;
  }
  .regi.aviso .asa.esq {
    transform: rotate(30deg);
  }
  .regi.aviso .asa.dir {
    transform: rotate(-30deg);
  }
  .regi.aviso .olho {
    animation: none;
    transform: scale(1.12);
  }
  .regi.aviso .pupila-anim {
    animation: none;
    transform: translateX(-4px) scale(0.7);
    transform-box: fill-box;
    transform-origin: 50% 100%;
  }
  .regi.aviso .bola {
    animation: nervosa 0.35s ease-in-out infinite;
    animation-delay: calc(var(--n) * -0.07s);
  }
  @keyframes nervosa {
    50% {
      transform: translateY(-6px);
    }
  }

  /* erro: asas caídas, olhos tristes, bolas no chão */
  .regi.erro .tudo {
    animation: treme 0.45s ease-in-out infinite;
  }
  @keyframes treme {
    0%,
    100% {
      transform: translate(0, 6px);
    }
    25% {
      transform: translate(-4px, 6px);
    }
    75% {
      transform: translate(4px, 6px);
    }
  }
  .regi.erro .asa {
    animation: none;
  }
  .regi.erro .asa.esq {
    transform: rotate(-40deg);
  }
  .regi.erro .asa.dir {
    transform: rotate(40deg);
  }
  .regi.erro .olho {
    animation: none;
    transform: scaleY(0.72);
  }
  .regi.erro .pupila-anim {
    animation: none;
    transform: translateX(-14px);
  }
  .regi.erro .bola {
    animation: none;
    transform: translateY(50px);
    transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
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
  .ok-selo path {
    fill: none;
    stroke: #fff;
    stroke-width: 6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .aviso-selo circle {
    fill: #fff7ee;
  }
  .aviso-selo text {
    font: 800 30px ui-sans-serif, system-ui, sans-serif;
    fill: #ee2a24;
  }
  .regi.erro .aviso-selo circle {
    fill: #e5393b;
  }
  .regi.erro .aviso-selo text {
    fill: #fff;
  }
  .regi.ok .ok-selo,
  .regi.aviso .aviso-selo,
  .regi.erro .aviso-selo {
    opacity: 1;
    transform: scale(1);
  }

  @media (prefers-reduced-motion: reduce) {
    .regi *,
    .regi {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
