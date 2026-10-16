<script module lang="ts">
  export type EstadoMascote = 'repouso' | 'analisa' | 'ok' | 'aviso' | 'erro';
</script>

<script lang="ts">
  /**
   * Lupi: uma lupa conta-fios com olhos. As marcas de corte são as orelhas e os quatro pontos CMYK
   * a assinatura. Muda de expressão conforme o estado do ficheiro e segue o rato com os olhos.
   */
  interface Props {
    estado?: EstadoMascote;
    /** Largura em px */
    tamanho?: number;
    /** Os olhos seguem o rato */
    seguir?: boolean;
    /** Texto para leitores de ecrã */
    titulo?: string;
  }
  let { estado = 'repouso', tamanho = 120, seguir = true, titulo = 'Lupi, a mascote da Arte Final' }: Props = $props();

  const id = `lupi${Math.random().toString(36).slice(2, 8)}`;
  let raiz: SVGSVGElement | undefined = $state();
  let ox = $state(0);
  let oy = $state(0);

  $effect(() => {
    if (!seguir || !raiz || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let quadro = 0;
    const mover = (e: PointerEvent) => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const r = raiz!.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy) || 1;
        // até 6 unidades do desenho; perto do mascote os olhos assentam
        const k = Math.min(1, d / 160) * 6;
        ox = (dx / d) * k;
        oy = (dy / d) * k;
      });
    };
    window.addEventListener('pointermove', mover, { passive: true });
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener('pointermove', mover);
    };
  });

  /** Boca por estado */
  const BOCA: Record<EstadoMascote, string> = {
    repouso: 'M90 118 Q100 125 110 118',
    analisa: 'M93 119 L107 119',
    ok: 'M86 115 Q100 132 114 115',
    aviso: 'M91 121 Q100 116 109 121',
    erro: 'M89 124 Q100 113 111 124',
  };
</script>

<svg bind:this={raiz} class="lupi {estado}" viewBox="0 0 200 200" width={tamanho} height={tamanho} role="img" aria-label={titulo}>
  <defs>
    <linearGradient id="{id}-anel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#37d6ff" />
      <stop offset="1" stop-color="#8b6bff" />
    </linearGradient>
    <radialGradient id="{id}-corpo" cx="0.35" cy="0.3" r="0.9">
      <stop offset="0" stop-color="#2a3260" />
      <stop offset="0.55" stop-color="#141a33" />
      <stop offset="1" stop-color="#0a0d18" />
    </radialGradient>
    <radialGradient id="{id}-lente" cx="0.5" cy="0.45" r="0.7">
      <stop offset="0" stop-color="#0d1426" />
      <stop offset="1" stop-color="#04060c" />
    </radialGradient>
    <clipPath id="{id}-recorte"><circle cx="100" cy="100" r="42" /></clipPath>
  </defs>

  <ellipse class="sombra" cx="100" cy="184" rx="40" ry="6" />

  <g class="flutua">
    <!-- marcas de corte: as orelhas -->
    <g class="marcas">
      <path d="M26 44 V26 H44" />
      <path d="M156 26 H174 V44" />
      <path d="M26 156 V174 H44" />
      <path d="M156 174 H174 V156" />
    </g>

    <!-- cabo da lupa -->
    <g transform="rotate(-45 100 100)">
      <rect class="cabo" x="92" y="156" width="16" height="30" rx="8" />
      <rect class="cabo-faixa" x="92" y="162" width="16" height="4" />
    </g>

    <!-- braço -->
    <g class="braco">
      <rect x="22" y="104" width="22" height="12" rx="6" class="membro" />
    </g>

    <!-- corpo e aro -->
    <circle class="halo" cx="100" cy="100" r="64" />
    <circle cx="100" cy="100" r="60" fill="url(#{id}-corpo)" />
    <circle class="aro" cx="100" cy="100" r="60" fill="none" stroke="url(#{id}-anel)" stroke-width="3.5" />

    <!-- pontos CMYK -->
    <g class="cmyk">
      <circle cx="62" cy="142" r="3.6" fill="#00b7eb" />
      <circle cx="72" cy="147" r="3.6" fill="#ec008c" />
      <circle cx="83" cy="150" r="3.6" fill="#ffd400" />
      <circle cx="94" cy="151" r="3.6" fill="#c9ced9" />
    </g>

    <!-- lente -->
    <circle cx="100" cy="100" r="46" fill="url(#{id}-lente)" />
    <circle class="lente-aro" cx="100" cy="100" r="46" fill="none" stroke-width="4" />

    <g clip-path="url(#{id}-recorte)">
      <!-- olhos -->
      <g class="olhos" style:transform="translate({ox}px, {oy}px)">
        <g class="olho"><ellipse cx="86" cy="96" rx="8.5" ry="11" class="esclera" /><circle cx="86" cy="96" r="4.2" class="pupila" /></g>
        <g class="olho"><ellipse cx="114" cy="96" rx="8.5" ry="11" class="esclera" /><circle cx="114" cy="96" r="4.2" class="pupila" /></g>
      </g>
      <!-- sobrancelhas (aviso e erro) -->
      <g class="sobrancelhas">
        <path class="sob-e" d="M77 82 L94 80" />
        <path class="sob-d" d="M106 80 L123 82" />
      </g>
      <path class="boca" d={BOCA[estado]} />
      <!-- feixe de análise -->
      <g class="feixe"><rect x="50" y="-14" width="100" height="14" fill="url(#{id}-anel)" opacity="0.25" /><rect x="50" y="-1.5" width="100" height="3" fill="url(#{id}-anel)" /></g>
      <!-- reflexo -->
      <path class="reflexo" d="M68 78 Q74 62 92 58" />
    </g>

    <!-- visto (ok) -->
    <path class="visto" d="M150 52 l7 7 l13 -15" />
    <!-- ponto de exclamação (aviso/erro) -->
    <g class="exclama"><circle cx="160" cy="50" r="12" /><text x="160" y="51" text-anchor="middle" dominant-baseline="central">!</text></g>
    <!-- brilhos -->
    <g class="brilhos"><path d="M168 78 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z" /><path d="M30 86 l1.5 3.5 l3.5 1.5 l-3.5 1.5 l-1.5 3.5 l-1.5 -3.5 l-3.5 -1.5 l3.5 -1.5 z" /></g>
  </g>
</svg>

<style>
  .lupi {
    --cor: #37d6ff;
    display: block;
    overflow: visible;
    user-select: none;
  }
  .lupi.ok {
    --cor: #3ddc97;
  }
  .lupi.aviso {
    --cor: #ffb547;
  }
  .lupi.erro {
    --cor: #ff5d73;
  }

  .sombra {
    fill: rgb(0 0 0 / 0.35);
    transform-origin: 100px 184px;
    animation: sombra 3.6s ease-in-out infinite;
  }
  .flutua {
    animation: flutua 3.6s ease-in-out infinite;
    transform-origin: 100px 100px;
  }
  @keyframes flutua {
    50% {
      transform: translateY(-6px);
    }
  }
  @keyframes sombra {
    50% {
      transform: scale(0.82);
      opacity: 0.6;
    }
  }

  .marcas {
    fill: none;
    stroke: var(--cor);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.85;
    transition: stroke 0.3s;
    animation: marcas 3.6s ease-in-out infinite;
    transform-origin: 100px 100px;
  }
  @keyframes marcas {
    50% {
      transform: scale(1.05);
      opacity: 0.55;
    }
  }

  .cabo {
    fill: #1d2447;
    stroke: #37d6ff;
    stroke-opacity: 0.5;
    stroke-width: 1.5;
  }
  .cabo-faixa {
    fill: #8b6bff;
    opacity: 0.8;
  }
  .membro {
    fill: #1d2447;
    stroke: #37d6ff;
    stroke-opacity: 0.45;
    stroke-width: 1.5;
  }
  .braco {
    transform-origin: 40px 110px;
  }
  .lupi.ok .braco {
    animation: acena 1.2s ease-in-out infinite;
  }
  @keyframes acena {
    0%,
    100% {
      transform: rotate(0);
    }
    50% {
      transform: rotate(-28deg);
    }
  }

  .halo {
    fill: none;
    stroke: var(--cor);
    stroke-width: 6;
    opacity: 0.18;
    filter: blur(5px);
    transition: stroke 0.3s;
    animation: halo 3.6s ease-in-out infinite;
  }
  @keyframes halo {
    50% {
      opacity: 0.32;
    }
  }
  .lente-aro {
    stroke: var(--cor);
    opacity: 0.9;
    transition: stroke 0.3s;
    filter: drop-shadow(0 0 4px var(--cor));
  }

  /* olhos: seguem o rato com uma transição curta; piscam de tempos a tempos */
  .olhos {
    transition: transform 0.12s ease-out;
  }
  .olho {
    transform-box: fill-box;
    transform-origin: center;
    animation: pisca 5s infinite;
  }
  .olho:nth-child(2) {
    animation-delay: 0.02s;
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
  .esclera {
    fill: #e8f9ff;
  }
  .pupila {
    fill: #06101c;
  }
  .lupi.ok .esclera {
    fill: #d9ffec;
  }
  .lupi.analisa .olhos {
    animation: olha 2.4s ease-in-out infinite;
  }
  @keyframes olha {
    0%,
    100% {
      transform: translateX(-4px);
    }
    50% {
      transform: translateX(4px);
    }
  }
  .lupi.erro .olho {
    animation: none;
    transform: scaleY(1.12);
  }

  .boca {
    fill: none;
    stroke: var(--cor);
    stroke-width: 3;
    stroke-linecap: round;
    transition: stroke 0.3s;
  }
  .sobrancelhas path {
    fill: none;
    stroke: var(--cor);
    stroke-width: 3;
    stroke-linecap: round;
    opacity: 0;
    transition: opacity 0.25s, transform 0.25s;
    transform-box: fill-box;
    transform-origin: center;
  }
  .lupi.aviso .sobrancelhas path,
  .lupi.erro .sobrancelhas path {
    opacity: 1;
  }
  .lupi.aviso .sob-e {
    transform: rotate(-8deg) translateY(-2px);
  }
  .lupi.aviso .sob-d {
    transform: rotate(8deg) translateY(-2px);
  }
  .lupi.erro .sob-e {
    transform: rotate(14deg);
  }
  .lupi.erro .sob-d {
    transform: rotate(-14deg);
  }

  .reflexo {
    fill: none;
    stroke: #fff;
    stroke-opacity: 0.35;
    stroke-width: 3;
    stroke-linecap: round;
  }

  /* feixe: só enquanto analisa */
  .feixe {
    opacity: 0;
  }
  .lupi.analisa .feixe {
    opacity: 1;
    animation: varre 1.8s ease-in-out infinite;
  }
  @keyframes varre {
    0% {
      transform: translateY(58px);
    }
    100% {
      transform: translateY(144px);
    }
  }

  /* adornos por estado */
  .visto,
  .exclama,
  .brilhos {
    opacity: 0;
    transition: opacity 0.25s;
  }
  .visto {
    fill: none;
    stroke: var(--cor);
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 40;
    stroke-dashoffset: 40;
  }
  .lupi.ok .visto {
    opacity: 1;
    animation: desenha 0.5s 0.1s ease forwards;
  }
  @keyframes desenha {
    to {
      stroke-dashoffset: 0;
    }
  }
  .exclama circle {
    fill: var(--cor);
  }
  .exclama text {
    font: 800 16px ui-sans-serif, system-ui, sans-serif;
    fill: #0a0d18;
  }
  .lupi.aviso .exclama,
  .lupi.erro .exclama {
    opacity: 1;
    transform-box: fill-box;
    transform-origin: center;
    animation: pulsa 1.2s ease-in-out infinite;
  }
  @keyframes pulsa {
    50% {
      transform: scale(1.15);
    }
  }
  .brilhos path {
    fill: #8b6bff;
  }
  .lupi.ok .brilhos {
    opacity: 1;
    animation: brilha 1.6s ease-in-out infinite;
  }
  @keyframes brilha {
    50% {
      opacity: 0.25;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lupi *,
    .lupi {
      animation: none !important;
      transition: none !important;
    }
    .lupi.ok .visto {
      stroke-dashoffset: 0;
    }
  }
</style>
