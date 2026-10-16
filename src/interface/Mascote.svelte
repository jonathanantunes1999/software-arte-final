<script module lang="ts">
  export type EstadoMascote = 'repouso' | 'analisa' | 'ok' | 'aviso' | 'erro';
</script>

<script lang="ts">
  /**
   * Regi: uma personagem 2D de formas planas e cantos arredondados. Toda a expressão está nos olhos
   * (meios-discos que olham em volta e seguem o rato). A ligação à arte final está nos detalhes:
   * uma marca de registo na barriga e os quatro pontos CMYK no corpo.
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
  let { estado = 'repouso', tamanho = 120, seguir = true, titulo = 'Regi, a mascote da Arte Final' }: Props = $props();

  const id = `regi${Math.random().toString(36).slice(2, 8)}`;
  let raiz: SVGSVGElement | undefined = $state();
  /** Posição dos olhos: -1 (esquerda) a 1 (direita); null = a mascote olha por si */
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
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height * 0.4);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 120);
        olhar = { x: (dx / d) * k, y: (dy / d) * k };
        // parado o rato, volta a olhar à toa
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
</script>

<svg bind:this={raiz} class="regi {estado}" class:segue={olhar !== null} viewBox="190 225 700 660" width={tamanho} height={(tamanho * 660) / 700} role="img" aria-label={titulo}>
  <defs>
    <clipPath id="{id}-olho"><path d="M-80 0 A80 80 0 0 1 80 0 Z" /></clipPath>
  </defs>

  <ellipse class="chao" cx="545" cy="868" rx="250" ry="14" />

  <g class="tudo">
    <!-- corpo (vermelho) -->
    <g class="forma-a">
      <polygon class="vermelho" points="334,622 487,622 546,728 488,842 470,852 226,732 228,722 286,709 302,696" />
      <g class="cmyk">
        <circle cx="338" cy="768" r="12" fill="#00b7eb" />
        <circle cx="378" cy="778" r="12" fill="#ec008c" />
        <circle cx="418" cy="788" r="12" fill="#ffd400" />
        <circle cx="458" cy="798" r="12" fill="#1c1a1a" />
      </g>
    </g>

    <!-- a "folha" que sai do corpo, com a marca de registo -->
    <g class="forma-b">
      <polygon class="ambar" points="487,620 598,796 586,846 596,852 774,851 858,764 792,620" />
      <g class="registo">
        <circle cx="700" cy="738" r="32" />
        <path d="M700 692 V784 M654 738 H746" />
        <circle cx="700" cy="738" r="9" class="miolo" />
      </g>
    </g>

    <!-- cabeça -->
    <g class="cabeca">
      <polygon class="ambar" points="398,277 698,270 859,598 846,619 241,619 226,602" />

      <!-- olhos: meios-discos brancos com um meio-disco preto que se move por dentro -->
      <g transform="translate(440 475)">
        <g class="olho">
          <g clip-path="url(#{id}-olho)">
            <path d="M-80 0 A80 80 0 0 1 80 0 Z" class="esclera" />
            <g class="mira" style:transform="translate({px}px, {py}px)">
              <g class="pupila-anim"><path d="M-22 0 A50 76 0 0 1 78 0 Z" class="pupila" /></g>
            </g>
          </g>
        </g>
      </g>
      <g transform="translate(642 475)">
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

    <!-- distintivos de estado -->
    <g class="selo ok-selo"><circle cx="830" cy="300" r="46" /><path d="M806 301 l16 16 l32 -34" /></g>
    <g class="selo aviso-selo"><circle cx="830" cy="300" r="46" /><text x="830" y="304" text-anchor="middle" dominant-baseline="central">!</text></g>
  </g>
</svg>

<style>
  .regi {
    display: block;
    overflow: visible;
    user-select: none;
  }
  .ambar {
    fill: #f2ac3d;
    stroke: #f2ac3d;
    stroke-width: 22;
    stroke-linejoin: round;
  }
  .vermelho {
    fill: #e5642a;
    stroke: #e5642a;
    stroke-width: 22;
    stroke-linejoin: round;
  }
  .chao {
    fill: rgb(0 0 0 / 0.28);
    transform-box: fill-box;
    transform-origin: center;
    animation: chao 3.4s ease-in-out infinite;
  }
  .esclera {
    fill: #fff7ee;
  }
  .pupila {
    fill: #000;
  }

  /* respirar e balançar */
  .tudo {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: respira 3.4s ease-in-out infinite;
  }
  @keyframes respira {
    0%,
    100% {
      transform: translateY(0) scale(1, 1);
    }
    50% {
      transform: translateY(-9px) scale(0.985, 1.02);
    }
  }
  @keyframes chao {
    50% {
      transform: scaleX(0.88);
      opacity: 0.7;
    }
  }
  .cabeca {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: inclina 6s ease-in-out infinite;
  }
  @keyframes inclina {
    0%,
    100% {
      transform: rotate(0);
    }
    30% {
      transform: rotate(-2.2deg);
    }
    65% {
      transform: rotate(1.8deg);
    }
  }
  .forma-a {
    transform-box: fill-box;
    transform-origin: 80% 0%;
    animation: mexe-a 3.4s ease-in-out infinite;
  }
  .forma-b {
    transform-box: fill-box;
    transform-origin: 10% 0%;
    animation: mexe-b 3.4s ease-in-out infinite;
  }
  @keyframes mexe-a {
    50% {
      transform: rotate(2.5deg);
    }
  }
  @keyframes mexe-b {
    50% {
      transform: rotate(-2deg);
    }
  }

  .registo {
    fill: none;
    stroke: #c47a1c;
    stroke-width: 8;
    stroke-linecap: round;
  }
  .registo .miolo {
    fill: #c47a1c;
    stroke: none;
  }
  .regi.analisa .registo {
    transform-box: fill-box;
    transform-origin: center;
    animation: gira 2s linear infinite;
  }
  @keyframes gira {
    to {
      transform: rotate(360deg);
    }
  }

  /* olhos: pisca (achata na base) e olha em volta */
  .olho {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: pisca 5.2s infinite;
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

  /* a analisar: olha de um lado para o outro, depressa */
  .regi.analisa .pupila-anim {
    animation: varre 1.3s ease-in-out infinite;
  }
  @keyframes varre {
    0%,
    100% {
      transform: translateX(-34px);
    }
    50% {
      transform: translateX(34px);
    }
  }
  .regi.analisa .cabeca {
    animation: inclina 2.6s ease-in-out infinite;
  }

  /* tudo em ordem: olhos abertos a olhar para cima e saltinho */
  .regi.ok .olho {
    animation: pisca 2.6s infinite;
  }
  .regi.ok .tudo {
    animation: salta 1.1s ease-in-out infinite;
  }
  @keyframes salta {
    0%,
    100% {
      transform: translateY(0) scale(1.02, 0.97);
    }
    45% {
      transform: translateY(-26px) scale(0.97, 1.04);
    }
  }
  .regi.ok .pupila-anim {
    animation: none;
    transform: translateX(6px);
  }

  /* aviso: olhos arregalados e a pupila pequena no meio */
  .regi.aviso .olho {
    animation: none;
    transform: scale(1.1);
  }
  .regi.aviso .pupila-anim {
    animation: none;
    transform: translateX(-4px) scale(0.7);
    transform-box: fill-box;
    transform-origin: 50% 100%;
  }
  .regi.aviso .cabeca {
    animation: abana 0.9s ease-in-out infinite;
  }
  @keyframes abana {
    0%,
    100% {
      transform: rotate(-3deg);
    }
    50% {
      transform: rotate(3deg);
    }
  }

  /* erro: olhos descaídos a olhar para baixo, e treme */
  .regi.erro .olho {
    animation: none;
    transform: scaleY(0.72);
  }
  .regi.erro .pupila-anim {
    animation: none;
    transform: translateX(-14px);
  }
  .regi.erro .cabeca {
    animation: treme 0.5s ease-in-out infinite;
  }
  @keyframes treme {
    0%,
    100% {
      transform: translateX(0) rotate(0);
    }
    25% {
      transform: translateX(-6px) rotate(-1.5deg);
    }
    75% {
      transform: translateX(6px) rotate(1.5deg);
    }
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
    stroke-width: 12;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .aviso-selo circle {
    fill: #fff7ee;
  }
  .aviso-selo text {
    font: 800 64px ui-sans-serif, system-ui, sans-serif;
    fill: #e5642a;
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
