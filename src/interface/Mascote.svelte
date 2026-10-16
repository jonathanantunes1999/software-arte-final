<script module lang="ts">
  export type { EstadoMascote } from '../mascote/expressoes';
</script>

<script lang="ts">
  /**
   * A mascote: um corpo macio (superelipse) com luz, sombra e brilho para ter volume, olhos, boca,
   * rubor e quatro bolas brilhantes nas cores das tintas (ciano, magenta, amarelo, preto).
   * Tem 21 expressões (src/mascote/expressoes.ts); cada uma é uma combinação de olhos, sobrancelhas,
   * boca, extras (balões, corações, lupa…), movimento do corpo e das bolas, e um tom que lava o corpo.
   * A cor, o acessório e as bolas são do utilizador. Os olhos seguem o rato, e clicar nela faz uma
   * expressão alegre à sorte.
   */
  import { definicoes } from './definicoes.svelte';
  import { abrirDefinicoes } from './navegacao.svelte';
  import { BOLAS_CMYK, espiral, estrela, superelipse, tons, type PerfilMascote } from '../mascote/personalizacao';
  import { escolherDeFesta, expressao, type EstadoMascote } from '../mascote/expressoes';

  interface Props {
    estado?: EstadoMascote;
    /** Largura em px */
    tamanho?: number;
    /** Reserva espaço atrás para as bolas, que vão atrás dela quando voa */
    cauda?: boolean;
    /** Os olhos seguem o rato */
    seguir?: boolean;
    /** Clicar faz uma expressão alegre */
    interativa?: boolean;
    /** Botão direito abre as Definições da mascote */
    configuravel?: boolean;
    /** Só a pose, sem movimento nenhum (miniaturas) */
    quieta?: boolean;
    /** Perfil a usar; sem isto usa o das Definições */
    perfil?: PerfilMascote;
    titulo?: string;
  }
  let { estado = 'repouso', tamanho = 120, cauda = false, seguir = true, interativa = true, configuravel = true, quieta = false, perfil, titulo = 'A mascote da Arte Final' }: Props = $props();

  const p = $derived(perfil ?? definicoes.mascote);
  const t = $derived(tons(p.cor));
  const animada = $derived(p.animada && !quieta);
  const id = `masc${Math.random().toString(36).slice(2, 8)}`;

  /** Expressão que o clique impôs durante uns instantes */
  let forcado = $state<EstadoMascote | null>(null);
  const atual = $derived<EstadoMascote>(forcado ?? estado);
  const ex = $derived(expressao(atual));

  const CORPO = superelipse(120, 140, 88, 70, 2.7, 96);
  const ESPIRAL = espiral(10.5, 2.6, 56);
  const ESTRELA = estrela(7, 3, 5);

  let raiz: SVGSVGElement | undefined = $state();
  let olhar = $state<{ x: number; y: number } | null>(null);

  $effect(() => {
    if (!seguir || !animada || !ex.segue || !raiz || typeof window === 'undefined') return;
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
  function aoClicar() {
    if (!interativa || !animada) return;
    forcado = escolherDeFesta(atual);
    clearTimeout(temporizador);
    temporizador = setTimeout(() => (forcado = null), 2800);
  }

  const segue = $derived(ex.segue && olhar !== null);
  const ox = $derived(segue && olhar ? olhar.x * 7 : 0);
  const oy = $derived(segue && olhar ? olhar.y * 4 : 0);

  const vb = $derived(cauda ? { x: -96, y: 0, w: 336, h: 252 } : { x: 14, y: 0, w: 212, h: 252 });

  /**
   * Cada bola: onde paira (repouso), para onde vai quando voa, onde fica no chão (caem/dormem), onde se
   * põe a orbitar, onde vai quando se afasta, e se fica à frente do corpo.
   */
  const BASE = [
    { n: 0, cor: BOLAS_CMYK[0], r: 19, rx: 208, ry: 96, vx: 6, vy: 150, cx: 212, cy: 205, frente: false },
    { n: 1, cor: BOLAS_CMYK[1], r: 21, rx: 44, ry: 182, vx: -24, vy: 150, cx: 36, cy: 203, frente: true },
    { n: 2, cor: BOLAS_CMYK[2], r: 11, rx: 60, ry: 62, vx: -50, vy: 150, cx: 68, cy: 213, frente: false },
    { n: 3, cor: BOLAS_CMYK[3], r: 12, rx: 206, ry: 198, vx: -70, vy: 150, cx: 184, cy: 212, frente: true },
  ];
  const BOLAS = BASE.map((b, i) => {
    const a = (i * Math.PI) / 2 + 0.5;
    return {
      ...b,
      ox: Math.round(120 + 112 * Math.cos(a)),
      oy: Math.round(140 + 96 * Math.sin(a)),
      ax: Math.round(120 + (b.rx - 120) * 1.25),
      ay: Math.round(140 + (b.ry - 140) * 1.25),
    };
  });
  const bolaTons = $derived(BOLAS.map((b) => tons(b.cor)));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
<svg
  bind:this={raiz}
  class="mascote {atual} mov-{ex.movimento} bolas-{ex.bolas}"
  class:parada={!animada}
  class:segue
  class:clicavel={interativa}
  class:com-cauda={cauda}
  style:--tinta={t.tinta}
  viewBox="{vb.x} {vb.y} {vb.w} {vb.h}"
  width={tamanho}
  height={(tamanho * vb.h) / vb.w}
  role="img"
  aria-label="{titulo}: {ex.nome}"
  onclick={aoClicar}
  oncontextmenu={(e) => {
    if (!configuravel) return;
    e.preventDefault();
    abrirDefinicoes('mascote');
  }}
>
  <title>{configuravel ? `${titulo}: ${ex.nome}. Botão direito para a personalizar.` : `${titulo}: ${ex.nome}`}</title>
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
    <linearGradient id="{id}-ouro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a" /><stop offset="1" stop-color="#e0a22a" /></linearGradient>
    <linearGradient id="{id}-azul" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d96ff" /><stop offset="1" stop-color="#4560e0" /></linearGradient>
    <linearGradient id="{id}-roxo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4bd0" /><stop offset="1" stop-color="#3f2380" /></linearGradient>
    <linearGradient id="{id}-festa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8cc6" /><stop offset="1" stop-color="#ec008c" /></linearGradient>
    <clipPath id="{id}-boca-cheia"><path d="M108 150 Q120 168 132 150 Z" /></clipPath>
    <clipPath id="{id}-boca-grande"><ellipse cx="120" cy="159" rx="7.5" ry="10" /></clipPath>
    <clipPath id="{id}-boca-bocejo"><ellipse cx="120" cy="160" rx="9.5" ry="13" /></clipPath>
    <clipPath id="{id}-irrita-e"><polygon points="70,123 104,134 104,160 70,160" /></clipPath>
    <clipPath id="{id}-irrita-d"><polygon points="170,123 136,134 136,160 170,160" /></clipPath>
    <filter id="{id}-b2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
    <filter id="{id}-b4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
  </defs>

  <ellipse class="chao" cx="120" cy="226" rx="74" ry="9" filter="url(#{id}-b4)" />

  {#if cauda}
    <g class="vento"><rect x="-16" y="116" width="34" height="4" rx="2" /><rect x="8" y="196" width="40" height="4" rx="2" /><rect x="-46" y="164" width="24" height="4" rx="2" /></g>
  {/if}

  <g class="tudo">
    <!-- bolas que ficam atrás do corpo -->
    {#if p.bolas}
      <g class="camada">
        {#each BOLAS.filter((b) => !b.frente) as b (b.n)}
          <g class="pos bola-{b.n}" style:--rx="{b.rx}px" style:--ry="{b.ry}px" style:--vx="{b.vx}px" style:--vy="{b.vy}px" style:--cx="{b.cx}px" style:--cy="{b.cy}px" style:--ox="{b.ox}px" style:--oy="{b.oy}px" style:--ax="{b.ax}px" style:--ay="{b.ay}px">
            <g class="contra">
              <g class="flota" style:--n={b.n}>
                <circle r={b.r} fill="url(#{id}-bola{b.n})" />
                <ellipse cx={-b.r * 0.32} cy={-b.r * 0.38} rx={b.r * 0.34} ry={b.r * 0.2} transform="rotate(-30 {-b.r * 0.32} {-b.r * 0.38})" fill="#fff" opacity="0.6" />
              </g>
            </g>
          </g>
        {/each}
      </g>
    {/if}

    <!-- corpo, com luz, sombra e brilho -->
    <path d={CORPO} fill="url(#{id}-corpo)" />
    <path d={CORPO} fill="url(#{id}-sombra-baixo)" />
    <path class="lavado" d={CORPO} style:fill={ex.lavado?.[0] ?? '#ffffff'} style:opacity={ex.lavado?.[1] ?? 0} />
    <ellipse class="brilho" cx="84" cy="100" rx="30" ry="13" transform="rotate(-20 84 100)" fill="#fff" opacity="0.6" filter="url(#{id}-b4)" />
    <ellipse cx="170" cy="190" rx="22" ry="7" transform="rotate(-25 170 190)" fill="#fff" opacity="0.1" filter="url(#{id}-b2)" />

    <!-- bolas à frente -->
    {#if p.bolas}
      <g class="camada">
        {#each BOLAS.filter((b) => b.frente) as b (b.n)}
          <g class="pos bola-{b.n}" style:--rx="{b.rx}px" style:--ry="{b.ry}px" style:--vx="{b.vx}px" style:--vy="{b.vy}px" style:--cx="{b.cx}px" style:--cy="{b.cy}px" style:--ox="{b.ox}px" style:--oy="{b.oy}px" style:--ax="{b.ax}px" style:--ay="{b.ay}px">
            <g class="contra">
              <g class="flota" style:--n={b.n}>
                <circle r={b.r} fill="url(#{id}-bola{b.n})" stroke={b.n === 3 ? '#7a8098' : 'none'} stroke-width="1.6" />
                <ellipse cx={-b.r * 0.32} cy={-b.r * 0.38} rx={b.r * 0.34} ry={b.r * 0.2} transform="rotate(-30 {-b.r * 0.32} {-b.r * 0.38})" fill="#fff" opacity="0.6" />
              </g>
            </g>
          </g>
        {/each}
      </g>
    {/if}

    <!-- rubor -->
    <g class="rubor" filter="url(#{id}-b4)" style:opacity={0.15 + ex.rubor * 0.85}>
      <ellipse cx="70" cy="152" rx="14" ry="8" fill="#ff7f9f" />
      <ellipse cx="170" cy="152" rx="14" ry="8" fill="#ff7f9f" />
    </g>

    <!-- cara -->
    <g class="cara" style:transform="translate({ox * 0.5}px, {oy * 0.5}px)">
      <!-- sobrancelhas -->
      {#if ex.sobrancelhas !== 'nenhuma'}
        <g class="sob">
          {#if ex.sobrancelhas === 'franzida'}
            <path d="M77 108 L104 121" /><path d="M163 108 L136 121" />
          {:else if ex.sobrancelhas === 'triste'}
            <path d="M79 120 L104 110" /><path d="M161 120 L136 110" />
          {:else if ex.sobrancelhas === 'subida'}
            <path d="M80 112 Q92 103 104 112" /><path d="M136 112 Q148 103 160 112" />
          {:else if ex.sobrancelhas === 'uma'}
            <path d="M80 118 L104 119" /><path d="M136 108 Q148 98 160 109" />
          {:else}
            <path d="M80 115 L104 117" /><path d="M160 115 L136 117" />
          {/if}
        </g>
      {/if}

      <!-- olhos -->
      <g class="olhos {ex.olhos}" style:transform="translate({ox * 0.5}px, {oy * 0.5}px)">
        {#if ex.olhos === 'normal' || ex.olhos === 'cima' || ex.olhos === 'lado'}
          <g class="olhos-giro">
            <g class="olho"><ellipse cx="92" cy="134" rx="8.5" ry="12" /><circle cx="89.5" cy="129" r="3" class="luz" /></g>
            <g class="olho"><ellipse cx="148" cy="134" rx="8.5" ry="12" /><circle cx="145.5" cy="129" r="3" class="luz" /></g>
          </g>
        {:else if ex.olhos === 'arregalados'}
          <g class="olho grande"><ellipse cx="92" cy="133" rx="10.5" ry="14.5" /><circle cx="88.5" cy="127" r="3.8" class="luz" /><circle cx="96" cy="140" r="1.7" class="luz" /></g>
          <g class="olho grande"><ellipse cx="148" cy="133" rx="10.5" ry="14.5" /><circle cx="144.5" cy="127" r="3.8" class="luz" /><circle cx="152" cy="140" r="1.7" class="luz" /></g>
        {:else if ex.olhos === 'tristes'}
          <g class="olho"><ellipse cx="92" cy="135" rx="9" ry="12.5" /><circle cx="88.5" cy="130" r="3.8" class="luz" /><circle cx="95" cy="141" r="1.8" class="luz" /></g>
          <g class="olho"><ellipse cx="148" cy="135" rx="9" ry="12.5" /><circle cx="144.5" cy="130" r="3.8" class="luz" /><circle cx="151" cy="141" r="1.8" class="luz" /></g>
        {:else if ex.olhos === 'irritados'}
          <g clip-path="url(#{id}-irrita-e)"><g class="olho parado"><ellipse cx="92" cy="136" rx="8.5" ry="12" /></g></g>
          <g clip-path="url(#{id}-irrita-d)"><g class="olho parado"><ellipse cx="148" cy="136" rx="8.5" ry="12" /></g></g>
        {:else if ex.olhos === 'feliz'}
          <path class="traco" d="M80 140 Q92 124 104 140" /><path class="traco" d="M136 140 Q148 124 160 140" />
        {:else if ex.olhos === 'fechados'}
          <path class="traco" d="M81 133 Q92 144 103 133" /><path class="traco" d="M137 133 Q148 144 159 133" />
        {:else if ex.olhos === 'piscadela'}
          <g class="olho parado"><ellipse cx="92" cy="134" rx="8.5" ry="12" /><circle cx="89.5" cy="129" r="3" class="luz" /></g>
          <path class="traco" d="M136 138 Q148 125 160 138" />
        {:else if ex.olhos === 'coracoes'}
          <g transform="translate(92 134)"><g class="coracao"><path d="M0 11 C-17 0 -15 -15 -7 -15 C-3 -15 0 -12 0 -9 C0 -12 3 -15 7 -15 C15 -15 17 0 0 11 Z" /><ellipse cx="-7" cy="-8" rx="3" ry="2" class="luz" transform="rotate(-30 -7 -8)" /></g></g>
          <g transform="translate(148 134)"><g class="coracao"><path d="M0 11 C-17 0 -15 -15 -7 -15 C-3 -15 0 -12 0 -9 C0 -12 3 -15 7 -15 C15 -15 17 0 0 11 Z" /><ellipse cx="-7" cy="-8" rx="3" ry="2" class="luz" transform="rotate(-30 -7 -8)" /></g></g>
        {:else if ex.olhos === 'espirais'}
          <g transform="translate(92 134)"><circle r="14.5" class="olho-branco" /><path class="espiral" d={ESPIRAL} /></g>
          <g transform="translate(148 134)"><circle r="14.5" class="olho-branco" /><path class="espiral inversa" d={ESPIRAL} /></g>
        {/if}
      </g>

      <!-- boca -->
      <g class="boca-grupo">
        {#if ex.boca === 'sorriso'}
          <path class="boca" d="M111 152 Q115.5 158 120 152 Q124.5 158 129 152" />
        {:else if ex.boca === 'cheia'}
          <path class="boca cheia" d="M108 150 Q120 168 132 150 Z" />
          <g clip-path="url(#{id}-boca-cheia)"><ellipse cx="120" cy="164" rx="8" ry="5.5" class="lingua" /></g>
        {:else if ex.boca === 'o'}
          <ellipse class="boca-o" cx="120" cy="156" rx="4.5" ry="5.5" />
        {:else if ex.boca === 'grande'}
          <ellipse class="boca-o grande" cx="120" cy="159" rx="7.5" ry="10" />
          <g clip-path="url(#{id}-boca-grande)"><ellipse cx="120" cy="167" rx="6.5" ry="4.5" class="lingua" /></g>
        {:else if ex.boca === 'triste'}
          <path class="boca" d="M109 161 Q120 150 131 161" />
        {:else if ex.boca === 'reta'}
          <path class="boca" d="M111 156 L129 156" />
        {:else if ex.boca === 'ondulada'}
          <path class="boca" d="M104 156 q5 -6 10 0 t10 0 t10 0" />
        {:else if ex.boca === 'bocejo'}
          <g class="bocejo">
            <ellipse class="boca-o grande" cx="120" cy="160" rx="9.5" ry="13" />
            <g clip-path="url(#{id}-boca-bocejo)"><ellipse cx="120" cy="171" rx="8" ry="5.5" class="lingua" /></g>
          </g>
        {:else if ex.boca === 'lingua'}
          <path class="lingua-fora" d="M115 158 Q115 173 121 173 Q127 173 126 158 Z" />
          <path class="boca" d="M108 150 Q120 164 132 150" />
          <path class="lingua-linha" d="M121 160 V168" />
        {:else if ex.boca === 'zangada'}
          <path class="boca" d="M106 160 l4.5 -5 l4.5 5 l4.5 -5 l4.5 5 l4.5 -5 l4.5 5" />
        {:else if ex.boca === 'u'}
          <path class="boca" d="M110 151 Q120 164 130 151" />
        {:else if ex.boca === 'cantar'}
          <g class="canta"><ellipse class="boca-o" cx="120" cy="158" rx="6" ry="7" /></g>
        {:else if ex.boca === 'dorme'}
          <g class="sopra"><ellipse class="boca-o" cx="120" cy="157" rx="3.6" ry="4.2" /></g>
        {:else if ex.boca === 'pensa'}
          <path class="boca" d="M110 157 Q118 152 126 156 Q129 157 131 155" />
        {:else if ex.boca === 'convencida'}
          <path class="boca" d="M109 153 Q122 166 134 149" /><path class="boca fina" d="M134 149 l3 -3" />
        {/if}
      </g>

      <!-- lágrimas, suor e bolha de sono -->
      {#if ex.extras.includes('lagrima')}
        <path class="gota lagrima" d="M84 150 q-5 9 0 12 q5 -3 0 -12 z" />
        <path class="gota lagrima l2" d="M156 150 q-5 9 0 12 q5 -3 0 -12 z" />
      {/if}
      {#if ex.extras.includes('suor')}<path class="gota suor" d="M186 104 q-7 11 0 15 q7 -4 0 -15 z" />{/if}
      {#if ex.extras.includes('bolha')}
        <g class="bolha"><circle cx="131" cy="161" r="9" /><ellipse cx="128" cy="157" rx="2.6" ry="1.6" transform="rotate(-30 128 157)" class="luz-bolha" /></g>
      {/if}
    </g>

    <!-- acessórios -->
    {#if p.acessorio === 'oculos'}
      <g class="oculos" style:transform="translate({ox * 0.5}px, {oy * 0.5}px)">
        <circle cx="92" cy="134" r="20" /><circle cx="148" cy="134" r="20" /><path d="M112 132 Q120 126 128 132" />
        <path class="reflexo" d="M78 124 Q82 118 90 117" /><path class="reflexo" d="M134 124 Q138 118 146 117" />
      </g>
    {:else if p.acessorio === 'sol'}
      <g class="sol">
        <path d="M72 128 Q72 121 80 121 H106 Q114 121 114 128 Q114 148 100 150 H86 Q72 150 72 132 Z" fill="#1c1826" />
        <path d="M168 128 Q168 121 160 121 H134 Q126 121 126 128 Q126 148 140 150 H154 Q168 150 168 132 Z" fill="#1c1826" />
        <path d="M114 128 Q120 124 126 128" fill="none" stroke="#1c1826" stroke-width="4" stroke-linecap="round" />
        <path d="M72 130 L58 122 M168 130 L182 122" stroke="#1c1826" stroke-width="4" stroke-linecap="round" fill="none" />
        <path d="M78 127 Q92 123 100 128 L94 142 Q82 142 78 132 Z" fill="#fff" opacity="0.16" />
        <path d="M162 127 Q148 123 140 128 L146 142 Q158 142 162 132 Z" fill="#fff" opacity="0.16" />
        <path d="M80 126 l12 -3" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.6" /><path d="M136 126 l12 -3" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.6" />
      </g>
    {:else if p.acessorio === 'boina'}
      <g class="chapeu">
        <path d="M70 94 Q70 62 124 60 Q176 62 172 96 Q150 84 120 84 Q92 84 70 94 Z" fill="#5b6bff" />
        <path d="M70 94 Q92 84 120 84 Q150 84 172 96" fill="none" stroke="#3f4ed0" stroke-width="5" stroke-linecap="round" />
        <circle cx="124" cy="58" r="5" fill="#3f4ed0" />
        <ellipse cx="100" cy="72" rx="16" ry="5" transform="rotate(-12 100 72)" fill="#fff" opacity="0.3" filter="url(#{id}-b2)" />
      </g>
    {:else if p.acessorio === 'laco'}
      <g class="chapeu">
        <path d="M164 84 L186 70 L188 98 Z" fill="#ec008c" /><path d="M164 84 L148 66 L146 96 Z" fill="#ec008c" />
        <circle cx="164" cy="84" r="7" fill="#c4006f" /><ellipse cx="174" cy="82" rx="6" ry="2.5" transform="rotate(-35 174 82)" fill="#fff" opacity="0.4" />
      </g>
    {:else if p.acessorio === 'gorro'}
      <g class="chapeu">
        <path d="M64 100 Q64 54 122 52 Q180 54 178 100 Q150 90 122 90 Q92 90 64 100 Z" fill="url(#{id}-azul)" />
        <path d="M60 98 Q122 80 182 98 L184 114 Q122 98 58 114 Z" fill="#3a52c8" />
        <path d="M72 96 L70 110 M88 92 L87 106 M104 90 L104 103 M120 90 L120 103 M136 90 L136 103 M152 92 L153 106 M168 95 L170 108" stroke="#2c40a8" stroke-width="2.4" stroke-linecap="round" opacity="0.55" />
        <circle cx="122" cy="48" r="12" fill="#fff" /><circle cx="118" cy="44" r="4" fill="#e9eefc" /><circle cx="127" cy="52" r="3.2" fill="#dfe6fa" />
        <ellipse cx="96" cy="68" rx="14" ry="5" transform="rotate(-18 96 68)" fill="#fff" opacity="0.28" filter="url(#{id}-b2)" />
      </g>
    {:else if p.acessorio === 'festa'}
      <g class="chapeu" transform="translate(0 8) rotate(10 130 84)">
        <path d="M104 86 L130 14 L156 86 Q130 94 104 86 Z" fill="url(#{id}-festa)" />
        <path d="M110 70 L150 70 L148 78 L112 78 Z" fill="#ffe27a" opacity="0.9" /><path d="M116 52 L144 52 L141 60 L119 60 Z" fill="#5ee0ff" opacity="0.9" /><path d="M122 34 L138 34 L136 40 L124 40 Z" fill="#ffe27a" opacity="0.9" />
        <circle cx="130" cy="12" r="8" fill="#ffe27a" /><circle cx="127" cy="9" r="3" fill="#fff" opacity="0.7" />
        <path d="M104 86 Q130 94 156 86" fill="none" stroke="#c4006f" stroke-width="3" />
      </g>
    {:else if p.acessorio === 'coroa'}
      <g class="chapeu">
        <path d="M80 92 L84 56 L104 76 L122 46 L140 76 L160 56 L164 92 Q122 100 80 92 Z" fill="url(#{id}-ouro)" stroke="#c98a1c" stroke-width="2.5" stroke-linejoin="round" />
        <path d="M80 86 Q122 96 164 86 L164 94 Q122 104 80 94 Z" fill="#e0a22a" />
        <circle cx="122" cy="72" r="5.5" fill="#ec008c" /><circle cx="98" cy="80" r="4" fill="#00aeef" /><circle cx="146" cy="80" r="4" fill="#3ddc97" />
        <circle cx="84" cy="54" r="4" fill="#fff3b0" /><circle cx="122" cy="44" r="4.5" fill="#fff3b0" /><circle cx="160" cy="54" r="4" fill="#fff3b0" />
        <path d="M92 70 l8 -2" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.6" />
      </g>
    {:else if p.acessorio === 'cachecol'}
      <g class="cachecol" transform="translate(0 -18)">
        <path d="M44 174 Q120 212 196 174 L200 194 Q120 232 40 194 Z" fill="#e8404f" />
        <path d="M60 184 L58 200 M80 192 L79 208 M100 196 L100 212 M120 198 L120 214 M140 196 L140 212 M160 192 L161 208 M180 184 L182 200" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.85" />
        <path d="M160 200 L186 196 L196 244 L168 246 Z" fill="#e8404f" />
        <path d="M164 218 L192 214 M166 232 L194 228" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.85" />
        <path d="M46 176 Q120 210 194 176" fill="none" stroke="#fff" stroke-width="2.2" opacity="0.25" />
      </g>
    {:else if p.acessorio === 'bruxa'}
      <g class="chapeu">
        <ellipse cx="122" cy="84" rx="64" ry="13" fill="#3a1f78" />
        <path d="M84 82 Q98 52 112 26 Q120 8 142 14 Q136 22 134 30 Q148 54 160 82 Q122 92 84 82 Z" fill="url(#{id}-roxo)" />
        <path d="M86 76 Q122 88 158 76 L160 84 Q122 96 84 84 Z" fill="#ffb547" /><rect x="114" y="78" width="16" height="12" rx="2" fill="none" stroke="#c98a1c" stroke-width="3" transform="rotate(2 122 84)" />
        <ellipse cx="104" cy="56" rx="4" ry="14" transform="rotate(18 104 56)" fill="#fff" opacity="0.2" />
        <path d="M70 90 Q122 100 174 90" fill="none" stroke="#2a1560" stroke-width="3" opacity="0.5" />
      </g>
    {/if}

    <!-- extras: balões, símbolos, brilhos… -->
    {#if ex.extras.includes('balao')}
      <g class="balao"><circle cx="172" cy="92" r="3.6" /><circle cx="181" cy="82" r="5.6" /><ellipse cx="200" cy="54" rx="25" ry="17" />
        <circle class="ponto p0" cx="188" cy="54" r="3.2" /><circle class="ponto p1" cx="200" cy="54" r="3.2" /><circle class="ponto p2" cx="212" cy="54" r="3.2" /></g>
    {/if}
    {#if ex.extras.includes('zzz')}
      <g class="zzz"><text class="z z0" x="176" y="88" font-size="15">z</text><text class="z z1" x="190" y="66" font-size="20">Z</text><text class="z z2" x="206" y="40" font-size="26">Z</text></g>
    {/if}
    {#if ex.extras.includes('coracoes')}
      <g class="coracoes">
        <path class="c c0" d="M0 6 C-10 -1 -9 -9 -4 -9 C-1 -9 0 -7 0 -5 C0 -7 1 -9 4 -9 C9 -9 10 -1 0 6 Z" transform="translate(176 96)" />
        <path class="c c1" d="M0 6 C-10 -1 -9 -9 -4 -9 C-1 -9 0 -7 0 -5 C0 -7 1 -9 4 -9 C9 -9 10 -1 0 6 Z" transform="translate(196 70) scale(1.3)" />
        <path class="c c2" d="M0 6 C-10 -1 -9 -9 -4 -9 C-1 -9 0 -7 0 -5 C0 -7 1 -9 4 -9 C9 -9 10 -1 0 6 Z" transform="translate(40 80) scale(1.1)" />
      </g>
    {/if}
    {#if ex.extras.includes('brilhos')}
      <g class="brilhos">
        <path class="b b0" d="M0 -11 L2.6 -2.6 L11 0 L2.6 2.6 L0 11 L-2.6 2.6 L-11 0 L-2.6 -2.6 Z" transform="translate(26 92)" />
        <path class="b b1" d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z" transform="translate(218 150)" />
        <path class="b b2" d="M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z" transform="translate(40 52)" />
      </g>
    {/if}
    {#if ex.extras.includes('estrelas')}
      <g class="estrelas">
        {#each [0, 1, 2] as i (i)}
          <g class="orbita o{i}"><path d={ESTRELA} transform="translate(120 70)" /></g>
        {/each}
      </g>
    {/if}
    {#if ex.extras.includes('notas')}
      <g class="notas">
        <g class="nota n0"><circle cx="0" cy="0" r="4.2" /><path d="M4 0 V-17 Q12 -15 12 -8" /></g>
        <g class="nota n1"><circle cx="0" cy="0" r="3.6" /><path d="M3.4 0 V-15 Q10 -13 10 -7" /></g>
        <g class="nota n2"><circle cx="0" cy="0" r="4.6" /><path d="M4.4 0 V-19 Q13 -17 13 -9" /></g>
      </g>
    {/if}
    {#if ex.extras.includes('vapor')}
      <g class="vapor">
        <g class="fumo f0"><circle cx="36" cy="108" r="6" /><circle cx="28" cy="100" r="4.5" /></g>
        <g class="fumo f1"><circle cx="204" cy="108" r="6" /><circle cx="212" cy="100" r="4.5" /></g>
      </g>
    {/if}
    {#if ex.extras.includes('raios')}
      <g class="raios"><path d="M120 62 V48 M92 68 L82 56 M148 68 L158 56 M70 84 L56 78 M170 84 L184 78" /></g>
    {/if}
    {#if ex.extras.includes('ola')}
      <g class="ola"><rect x="22" y="32" width="58" height="30" rx="14" /><path d="M58 60 L66 74 L72 60 Z" /><text x="51" y="52" text-anchor="middle" font-size="16">Olá!</text></g>
    {/if}
    {#if ex.extras.includes('lupa')}
      <g class="lupa">
        <path class="cabo-lupa" d="M162 164 L178 180" />
        <circle class="aro-lupa" cx="150" cy="152" r="17" />
        <path class="reflexo-lupa" d="M139 146 Q142 140 149 138" />
      </g>
    {/if}
    {#if ex.extras.includes('seta')}
      <g class="subida"><path class="s s0" d="M104 62 V42 M96 50 L104 42 L112 50" /><path class="s s1" d="M138 56 V36 M130 44 L138 36 L146 44" /></g>
    {/if}

    <!-- selos de estado -->
    {#if ex.extras.includes('visto')}
      <g class="selo"><circle cx="196" cy="70" r="15" fill="#2fbf71" /><path class="traco-selo" d="M189 71 l5 5 l10 -11" /></g>
    {/if}
    {#if ex.extras.includes('exclamacao')}
      <g class="selo pulsa"><circle cx="196" cy="70" r="15" fill="#ffb547" /><text x="196" y="72" text-anchor="middle" dominant-baseline="central" class="texto-selo">!</text></g>
    {/if}
    {#if ex.extras.includes('cruz')}
      <g class="selo"><circle cx="196" cy="70" r="15" fill="#e5393b" /><path class="traco-selo" d="M190 64 l12 12 M202 64 l-12 12" /></g>
    {/if}
    {#if ex.extras.includes('interrogacao')}
      <g class="selo salta-selo"><circle cx="196" cy="70" r="15" fill="#5ec8ff" /><text x="196" y="72" text-anchor="middle" dominant-baseline="central" class="texto-selo">?</text></g>
    {/if}
    {#if ex.extras.includes('anel')}
      <g class="selo"><circle cx="196" cy="70" r="15" fill="#1c2140" /><circle cx="196" cy="70" r="9" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="3.5" /><path class="gira-arco" d="M196 61 A9 9 0 0 1 205 70" fill="none" stroke="#5ee0ff" stroke-width="3.5" stroke-linecap="round" /></g>
    {/if}
    {#if ex.extras.includes('seta')}
      <g class="selo"><circle cx="196" cy="70" r="15" fill="#5ee0ff" /><path class="seta-selo" d="M196 78 V63 M189 70 L196 63 L203 70" /></g>
    {/if}
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
  .lavado {
    transition: fill 0.45s, opacity 0.45s;
    mix-blend-mode: multiply;
  }
  .brilho {
    mix-blend-mode: screen;
  }
  .rubor {
    transition: opacity 0.3s;
  }

  /* ─────────── corpo: cada movimento é um conjunto de keyframes, preso ao chão ─────────── */
  .tudo {
    transform-box: view-box;
    transform-origin: 120px 224px;
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
  .mov-voa .tudo {
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
  .mov-inclina .tudo {
    animation: inclina 4.4s ease-in-out infinite;
  }
  @keyframes inclina {
    0%,
    100% {
      transform: rotate(-5deg);
    }
    50% {
      transform: rotate(5deg) translateY(-3px);
    }
  }
  .mov-procura .tudo {
    animation: procura 2.6s ease-in-out infinite;
  }
  @keyframes procura {
    0%,
    100% {
      transform: rotate(-4deg) translateX(-4px);
    }
    50% {
      transform: rotate(5deg) translateX(8px);
    }
  }
  .mov-trabalha .tudo {
    animation: trabalha 0.7s ease-in-out infinite;
  }
  @keyframes trabalha {
    0%,
    100% {
      transform: translateY(0) scale(1.01, 0.985);
    }
    50% {
      transform: translateY(-4px) scale(0.99, 1.01);
    }
  }
  .mov-sobe .tudo {
    animation: sobe 1.5s ease-in-out infinite;
  }
  @keyframes sobe {
    0%,
    100% {
      transform: translateY(0) scale(1.03, 0.96);
    }
    50% {
      transform: translateY(-14px) scale(0.98, 1.03);
    }
  }
  .mov-salta .tudo {
    animation: salta 1s ease-in-out infinite;
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
  .mov-abana .tudo {
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
  .mov-treme .tudo {
    animation: treme 0.45s ease-in-out infinite;
  }
  .erro.mov-treme .tudo {
    animation-name: erro;
    animation-duration: 0.5s;
  }
  @keyframes treme {
    0%,
    100% {
      transform: translateX(0) rotate(0);
    }
    25% {
      transform: translateX(-3px) rotate(-1.2deg);
    }
    75% {
      transform: translateX(3px) rotate(1.2deg);
    }
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
  .mov-dorme .tudo {
    animation: dorme 4.4s ease-in-out infinite;
  }
  @keyframes dorme {
    0%,
    100% {
      transform: translateY(5px) rotate(-3deg) scale(1.025, 0.955);
    }
    50% {
      transform: translateY(5px) rotate(-3deg) scale(0.995, 1);
    }
  }
  .mov-boceja .tudo {
    animation: boceja 5s ease-in-out infinite;
  }
  @keyframes boceja {
    0%,
    15%,
    80%,
    100% {
      transform: scale(1, 1);
    }
    35%,
    60% {
      transform: translateY(-6px) scale(0.95, 1.08);
    }
  }
  .mov-tonta .tudo {
    animation: tonta 1.8s ease-in-out infinite;
  }
  @keyframes tonta {
    0% {
      transform: rotate(-8deg) translateX(-5px);
    }
    50% {
      transform: rotate(8deg) translateX(5px);
    }
    100% {
      transform: rotate(-8deg) translateX(-5px);
    }
  }
  .mov-cumprimenta .tudo {
    animation: cumprimenta 1.2s ease-in-out infinite;
  }
  @keyframes cumprimenta {
    0%,
    100% {
      transform: translateY(0) rotate(-2deg) scale(1.02, 0.97);
    }
    50% {
      transform: translateY(-9px) rotate(2deg) scale(0.99, 1.02);
    }
  }
  .mov-pulsa .tudo {
    animation: pulsa 1s ease-in-out infinite;
  }
  @keyframes pulsa {
    0%,
    40%,
    100% {
      transform: scale(1);
    }
    15% {
      transform: scale(1.06);
    }
    30% {
      transform: scale(1.02);
    }
    55% {
      transform: scale(1.05);
    }
  }
  .mov-surpresa .tudo {
    animation: surpresa 0.7s cubic-bezier(0.34, 1.4, 0.64, 1) both, tremida 1.6s 0.7s ease-in-out infinite;
  }
  @keyframes surpresa {
    0% {
      transform: scale(1.08, 0.88);
    }
    35% {
      transform: translateY(-34px) scale(0.93, 1.1);
    }
    100% {
      transform: translateY(-4px) scale(1.03, 1.02);
    }
  }
  @keyframes tremida {
    0%,
    100% {
      transform: translateY(-4px) scale(1.03, 1.02) rotate(0);
    }
    50% {
      transform: translateY(-4px) scale(1.03, 1.02) rotate(0.8deg);
    }
  }
  .mov-orgulho .tudo {
    animation: orgulho 3.2s ease-in-out infinite;
  }
  @keyframes orgulho {
    0%,
    100% {
      transform: rotate(-4deg) scale(1.03, 1.01);
    }
    50% {
      transform: rotate(-2deg) translateY(-5px) scale(1.04, 1.02);
    }
  }
  .mov-danca .tudo {
    animation: danca 0.9s ease-in-out infinite alternate;
  }
  @keyframes danca {
    0% {
      transform: translateX(-7px) rotate(-8deg) scale(1.03, 0.96);
    }
    50% {
      transform: translateX(0) translateY(-14px) rotate(0deg) scale(0.98, 1.03);
    }
    100% {
      transform: translateX(7px) rotate(8deg) scale(1.03, 0.96);
    }
  }
  .mov-pisca .tudo {
    animation: pisca-corpo 2.2s ease-in-out infinite;
  }
  @keyframes pisca-corpo {
    0%,
    60%,
    100% {
      transform: scale(1, 1);
    }
    75% {
      transform: translateY(-9px) rotate(-3deg) scale(0.98, 1.03);
    }
  }

  /* ─────────── olhos ─────────── */
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
  .olho.parado,
  .olho.grande {
    animation: none;
  }
  .olho .luz,
  .luz {
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
  .olhos.cima .olhos-giro {
    transform: translate(4px, -6px);
  }
  .olhos.lado .olhos-giro {
    animation: varre-olhos 2.6s ease-in-out infinite;
  }
  @keyframes varre-olhos {
    0%,
    100% {
      transform: translateX(-6px);
    }
    50% {
      transform: translateX(7px);
    }
  }
  .analisa .olhos-giro {
    transform: translateX(6px);
  }
  .traco {
    fill: none;
    stroke: var(--tinta);
    stroke-width: 5;
    stroke-linecap: round;
  }
  .coracao {
    fill: #ff4f81;
    transform-box: fill-box;
    transform-origin: center;
    animation: bate 0.9s ease-in-out infinite;
  }
  .coracao .luz {
    fill: #fff;
    opacity: 0.8;
  }
  @keyframes bate {
    0%,
    40%,
    100% {
      transform: scale(1);
    }
    15% {
      transform: scale(1.22);
    }
    30% {
      transform: scale(1.06);
    }
  }
  .olho-branco {
    fill: #fff;
    stroke: var(--tinta);
    stroke-width: 2;
  }
  .espiral {
    fill: none;
    stroke: var(--tinta);
    stroke-width: 2.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    transform-box: fill-box;
    transform-origin: center;
    animation: roda 1.1s linear infinite;
  }
  .espiral.inversa {
    animation-direction: reverse;
  }
  @keyframes roda {
    to {
      transform: rotate(360deg);
    }
  }
  .sob path {
    fill: none;
    stroke: var(--tinta);
    stroke-width: 4.2;
    stroke-linecap: round;
  }

  /* ─────────── boca ─────────── */
  .boca {
    fill: none;
    stroke: var(--tinta);
    stroke-width: 3.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .boca.fina {
    stroke-width: 2.2;
  }
  .boca.cheia {
    fill: #b8445c;
    fill-opacity: 0.9;
    stroke-width: 3;
  }
  .boca-o {
    fill: #b8445c;
    stroke: var(--tinta);
    stroke-width: 2.6;
  }
  .boca-o.grande {
    fill: #7a2c40;
  }
  .lingua {
    fill: #ff8aa5;
  }
  .lingua-fora {
    fill: #ff8aa5;
    stroke: var(--tinta);
    stroke-width: 2.2;
    stroke-linejoin: round;
  }
  .lingua-linha {
    fill: none;
    stroke: #d65a7a;
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  .bocejo,
  .canta,
  .sopra {
    transform-box: fill-box;
    transform-origin: 50% 20%;
  }
  .bocejo {
    animation: abre-boca 5s ease-in-out infinite;
  }
  @keyframes abre-boca {
    0%,
    15%,
    80%,
    100% {
      transform: scale(0.35, 0.2);
    }
    35%,
    60% {
      transform: scale(1, 1);
    }
  }
  .canta {
    animation: canta 0.45s ease-in-out infinite alternate;
  }
  @keyframes canta {
    from {
      transform: scale(1, 0.55);
    }
    to {
      transform: scale(1, 1.15);
    }
  }
  .sopra {
    animation: sopra 4.4s ease-in-out infinite;
  }
  @keyframes sopra {
    0%,
    100% {
      transform: scale(0.8);
    }
    50% {
      transform: scale(1.25);
    }
  }
  .bolha circle:first-child {
    fill: rgb(190 225 255 / 0.35);
    stroke: #cfe9ff;
    stroke-width: 1.6;
  }
  .luz-bolha {
    fill: #fff;
    opacity: 0.8;
  }
  .bolha {
    transform-box: fill-box;
    transform-origin: 0% 50%;
    animation: infla 4.4s ease-in-out infinite;
  }
  @keyframes infla {
    0%,
    100% {
      transform: scale(0.4);
    }
    50% {
      transform: scale(1.15);
    }
  }

  /* gotas */
  .gota {
    fill: #8ed4ff;
    stroke: #4aa8e0;
    stroke-width: 1.5;
  }
  .suor {
    animation: pinga 1.4s ease-in infinite;
  }
  .lagrima {
    animation: lagrima 2.2s ease-in infinite;
  }
  .lagrima.l2 {
    animation-delay: -1.1s;
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
  @keyframes lagrima {
    0% {
      transform: translateY(-6px) scale(0.6);
      opacity: 0;
    }
    25% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    100% {
      transform: translateY(26px);
      opacity: 0;
    }
  }

  /* ─────────── acessórios ─────────── */
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
  .chapeu {
    transform-box: view-box;
    transform-origin: 120px 140px;
  }
  .mov-salta .chapeu,
  .mov-danca .chapeu {
    animation: chapeu 0.9s ease-in-out infinite alternate;
  }
  @keyframes chapeu {
    to {
      transform: translateY(-3px) rotate(2deg);
    }
  }

  /* ─────────── extras ─────────── */
  .balao circle,
  .balao ellipse {
    fill: #fff;
    opacity: 0.96;
  }
  .balao .ponto {
    fill: #6b6f94;
    opacity: 1;
    animation: pontos 1.5s infinite;
  }
  .balao .p1 {
    animation-delay: 0.25s;
  }
  .balao .p2 {
    animation-delay: 0.5s;
  }
  @keyframes pontos {
    0%,
    60%,
    100% {
      opacity: 0.25;
    }
    30% {
      opacity: 1;
    }
  }
  .z {
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-weight: 800;
    fill: #cfd6ff;
    stroke: #6f7cff;
    stroke-width: 0.8;
    animation: zzz 3.2s ease-in-out infinite;
  }
  .z1 {
    animation-delay: 0.9s;
  }
  .z2 {
    animation-delay: 1.8s;
  }
  @keyframes zzz {
    0% {
      transform: translate(-6px, 8px) scale(0.6);
      opacity: 0;
    }
    30% {
      opacity: 1;
    }
    100% {
      transform: translate(6px, -12px) scale(1.1);
      opacity: 0;
    }
  }
  .c {
    fill: #ff4f81;
    animation: sobe-coracao 2.6s ease-in infinite;
  }
  .c1 {
    animation-delay: 0.8s;
  }
  .c2 {
    animation-delay: 1.6s;
  }
  @keyframes sobe-coracao {
    0% {
      opacity: 0;
      translate: 0 8px;
    }
    25% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      translate: 4px -26px;
    }
  }
  .b {
    fill: #fff2b0;
    animation: brilha 1.6s ease-in-out infinite;
    transform-box: fill-box;
    transform-origin: center;
  }
  .b1 {
    animation-delay: 0.5s;
  }
  .b2 {
    animation-delay: 1s;
  }
  @keyframes brilha {
    0%,
    100% {
      opacity: 0.35;
      scale: 0.6;
    }
    50% {
      opacity: 1;
      scale: 1.1;
    }
  }
  .estrelas path {
    fill: #ffd45e;
    stroke: #e0a22a;
    stroke-width: 1;
    stroke-linejoin: round;
  }
  .orbita {
    animation: orbita 2.4s linear infinite;
  }
  .o1 {
    animation-delay: -0.8s;
  }
  .o2 {
    animation-delay: -1.6s;
  }
  @keyframes orbita {
    0% {
      transform: translate(34px, 0);
    }
    25% {
      transform: translate(0, 9px);
    }
    50% {
      transform: translate(-34px, 0);
    }
    75% {
      transform: translate(0, -9px);
    }
    100% {
      transform: translate(34px, 0);
    }
  }
  .nota circle {
    fill: #fff;
  }
  .nota path {
    fill: none;
    stroke: #fff;
    stroke-width: 3;
    stroke-linecap: round;
  }
  .n0 {
    transform: translate(30px, 104px);
    animation: nota 2.2s ease-in infinite;
  }
  .n1 {
    transform: translate(212px, 96px);
    animation: nota 2.2s ease-in infinite 0.7s;
  }
  .n2 {
    transform: translate(220px, 66px);
    animation: nota 2.2s ease-in infinite 1.4s;
  }
  .n0 circle {
    fill: #5ee0ff;
  }
  .n0 path {
    stroke: #5ee0ff;
  }
  .n1 circle {
    fill: #ff7fb0;
  }
  .n1 path {
    stroke: #ff7fb0;
  }
  .n2 circle {
    fill: #ffe27a;
  }
  .n2 path {
    stroke: #ffe27a;
  }
  @keyframes nota {
    0% {
      opacity: 0;
      translate: 0 8px;
      rotate: -8deg;
    }
    25% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      translate: 6px -34px;
      rotate: 10deg;
    }
  }
  .fumo circle {
    fill: #fff;
    opacity: 0.75;
  }
  .fumo {
    animation: fumo 1.1s ease-out infinite;
  }
  .f1 {
    animation-delay: 0.3s;
  }
  @keyframes fumo {
    0% {
      opacity: 0.9;
      translate: 0 0;
    }
    100% {
      opacity: 0;
      translate: 0 -22px;
    }
  }
  .raios path {
    fill: none;
    stroke: #fff;
    stroke-width: 4;
    stroke-linecap: round;
    opacity: 0.85;
    animation: raios 0.6s ease-out both;
  }
  @keyframes raios {
    from {
      opacity: 0;
      scale: 0.6;
    }
    to {
      opacity: 0.85;
      scale: 1;
    }
  }
  .ola rect,
  .ola path {
    fill: #fff;
  }
  .ola text {
    font: 800 16px ui-sans-serif, system-ui, sans-serif;
    fill: #2a2230;
  }
  .ola {
    animation: ola 1.2s ease-in-out infinite;
  }
  @keyframes ola {
    50% {
      translate: 0 -4px;
    }
  }
  .lupa {
    animation: busca 2.6s ease-in-out infinite;
  }
  @keyframes busca {
    0%,
    100% {
      transform: translate(-40px, 0) rotate(-6deg);
    }
    50% {
      transform: translate(8px, -4px) rotate(4deg);
    }
  }
  .aro-lupa {
    fill: rgb(255 255 255 / 0.18);
    stroke: #dff2ff;
    stroke-width: 5;
  }
  .cabo-lupa {
    stroke: #8b6bff;
    stroke-width: 8;
    stroke-linecap: round;
  }
  .reflexo-lupa {
    fill: none;
    stroke: #fff;
    stroke-width: 3;
    stroke-linecap: round;
    opacity: 0.7;
  }
  .s {
    fill: none;
    stroke: #5ee0ff;
    stroke-width: 5;
    stroke-linecap: round;
    stroke-linejoin: round;
    animation: seta 1.5s ease-out infinite;
  }
  .s1 {
    animation-delay: 0.6s;
  }
  @keyframes seta {
    0% {
      opacity: 0;
      translate: 0 14px;
    }
    30% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      translate: 0 -10px;
    }
  }

  /* selos */
  .selo {
    transform-box: fill-box;
    transform-origin: center;
    animation: pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .selo.pulsa {
    animation: pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both, pulsa-selo 1.2s 0.4s ease-in-out infinite;
  }
  .selo.salta-selo {
    animation: pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both, salta-selo 1s 0.4s ease-in-out infinite;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.3);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @keyframes pulsa-selo {
    50% {
      transform: scale(1.15);
    }
  }
  @keyframes salta-selo {
    50% {
      transform: translateY(-5px) rotate(8deg);
    }
  }
  .traco-selo {
    fill: none;
    stroke: #fff;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .seta-selo {
    fill: none;
    stroke: #04121a;
    stroke-width: 3.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    animation: seta-selo 1s ease-in-out infinite;
  }
  @keyframes seta-selo {
    50% {
      translate: 0 -2.5px;
    }
  }
  .texto-selo {
    font: 800 20px ui-sans-serif, system-ui, sans-serif;
    fill: #2a1d00;
  }
  .gira-arco {
    transform-box: view-box;
    transform-origin: 196px 70px;
    animation: roda 0.9s linear infinite;
  }

  /* ─────────── bolas ─────────── */
  .pos {
    transform: translate(var(--rx), var(--ry));
    transition: transform 0.8s cubic-bezier(0.34, 1.25, 0.64, 1);
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
  /* voam: atrás dela, em fila e em onda (só se houver espaço atrás) */
  .bolas-voam.com-cauda .pos {
    transform: translate(var(--vx), var(--vy));
  }
  .bolas-voam .flota {
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
  /* orbitam à volta do corpo */
  .bolas-orbitam .pos {
    transform: translate(var(--ox), var(--oy));
  }
  .bolas-orbitam .camada {
    transform-box: view-box;
    transform-origin: 120px 140px;
    animation: roda 5s linear infinite;
  }
  .bolas-orbitam .contra {
    transform-box: fill-box;
    transform-origin: center;
    animation: roda 5s linear infinite reverse;
  }
  .tonta.bolas-orbitam .camada,
  .tonta.bolas-orbitam .contra {
    animation-duration: 2.6s;
  }
  .bolas-orbitam .flota {
    animation: none;
  }
  /* saltam */
  .bolas-saltam .flota {
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
  /* caem para o chão e ficam tristes; dormem lá encostadas */
  .bolas-caem .pos,
  .bolas-dormem .pos {
    transform: translate(var(--cx), var(--cy));
  }
  .bolas-caem .flota {
    animation: none;
  }
  .bolas-dormem .flota {
    animation: resp-bola 4.4s ease-in-out infinite;
    animation-delay: calc(var(--n) * -0.6s);
    transform-box: fill-box;
    transform-origin: 50% 100%;
  }
  @keyframes resp-bola {
    0%,
    100% {
      transform: scale(1.04, 0.95);
    }
    50% {
      transform: scale(0.99, 1.01);
    }
  }
  /* tremem de nervos */
  .bolas-tremem .flota {
    animation: nervosa 0.35s ease-in-out infinite;
    animation-delay: calc(var(--n) * -0.07s);
  }
  @keyframes nervosa {
    50% {
      transform: translateY(-6px);
    }
  }
  /* afastam-se de susto */
  .bolas-afastam .pos {
    transform: translate(var(--ax), var(--ay));
  }
  /* a ciano acena */
  .bolas-acena .bola-0 {
    transform: translate(220px, 82px);
  }
  .bolas-acena .bola-0 .flota {
    animation: acena 0.7s ease-in-out infinite;
  }
  @keyframes acena {
    0%,
    100% {
      transform: translate(-8px, 0);
    }
    50% {
      transform: translate(8px, -6px);
    }
  }

  .vento {
    fill: #8d95a9;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .analisa .vento {
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

  /* quieta: só a pose, sem nada a mexer */
  .mascote.parada *,
  .mascote.parada {
    animation: none !important;
  }
  .mascote.parada .z,
  .mascote.parada .c,
  .mascote.parada .nota,
  .mascote.parada .fumo,
  .mascote.parada .s {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .mascote *,
    .mascote {
      animation: none !important;
      transition: none !important;
    }
    .mascote .z,
    .mascote .c,
    .mascote .nota,
    .mascote .fumo,
    .mascote .s {
      opacity: 1;
    }
  }
</style>
