<script module lang="ts">
  export type { EstadoMascote } from '../mascote/expressoes';
</script>

<script lang="ts">
  /**
   * A mascote: um corpo macio (superelipse) com luz, sombra e brilho para ter volume, olhos
   * e quatro bolas brilhantes nas cores das tintas (ciano, magenta, amarelo, preto).
   * Tem 21 expressões (src/mascote/expressoes.ts); cada uma é uma combinação de olhos,
   * extras (balões, corações, lupa…), movimento do corpo e das bolas, e um tom que lava o corpo.
   * A cor, o acessório e as bolas são do utilizador. Os olhos seguem o rato, e clicar nela faz uma
   * expressão alegre à sorte.
   */
  import { definicoes } from './definicoes.svelte';
  import { abrirDefinicoes } from './navegacao.svelte';
  import { arcoDaFrente, arcoDeTras, BOLAS_CMYK, cortesDaFaixa, espiral, estrela, pontoNoAnel, superelipse, tons, type Anel, type PerfilMascote } from '../mascote/personalizacao';
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
    /** Vai a voar (corpo inclinado, bolas atrás, linhas de vento) com a cara da expressão que tiver; precisa de `cauda` para as bolas irem atrás */
    voando?: boolean;
    /** Para onde voa: 1 para a direita (bolas e vento atrás, à esquerda), −1 para a esquerda (do outro lado) */
    sentido?: 1 | -1;
    /** Perfil a usar; sem isto usa o das Definições */
    perfil?: PerfilMascote;
    titulo?: string;
  }
  let { estado = 'repouso', tamanho = 120, cauda = false, seguir = true, interativa = true, configuravel = true, quieta = false, voando = false, sentido = 1, perfil, titulo = 'A mascote da Arte Final' }: Props = $props();

  const p = $derived(perfil ?? definicoes.mascote);
  const t = $derived(tons(p.cor));
  const animada = $derived(p.animada && !quieta);
  const id = `masc${Math.random().toString(36).slice(2, 8)}`;

  /** Expressão que o clique impôs durante uns instantes */
  let forcado = $state<EstadoMascote | null>(null);
  const atual = $derived<EstadoMascote>(forcado ?? estado);
  const ex = $derived(expressao(atual));
  /** Voar manda no movimento do corpo e das bolas; a cara continua a ser a da expressão */
  const mov = $derived(voando ? 'voa' : ex.movimento);
  const bol = $derived(voando ? 'voam' : ex.bolas);

  const CORPO = superelipse(120, 140, 88, 70, 2.55, 96);
  const ESPIRAL = espiral(10.5, 2.6, 56);
  const ESTRELA = estrela(7, 3, 5);

  /**
   * Os acessórios assentam em anéis à volta da cabeça (elipses vistas de frente): a frente passa por cima da cara,
   * curvada como um sorriso, e o resto some-se atrás. É isto que os faz parecer usados e não colados.
   */
  const A: Record<'cachecol' | 'gorro' | 'boina' | 'coroa' | 'festa' | 'bruxa', Anel> = {
    cachecol: { cx: 120, cy: 176, rx: 91, ry: 19 },
    gorro: { cx: 120, cy: 94, rx: 76, ry: 11 },
    boina: { cx: 122, cy: 92, rx: 76, ry: 10 },
    coroa: { cx: 120, cy: 77, rx: 56, ry: 9 },
    festa: { cx: 152, cy: 82, rx: 24, ry: 6 },
    bruxa: { cx: 120, cy: 82, rx: 66, ry: 12 },
  };
  const FRENTE = arcoDaFrente(A.cachecol);
  const TRAS = arcoDeTras(A.cachecol);
  const LISTRAS = cortesDaFaixa(A.cachecol, 15, 10).filter((_, i) => i % 2 === 0);
  const GORRO_BAINHA = arcoDaFrente(A.gorro);
  const GORRO_COSTELAS = cortesDaFaixa(A.gorro, 22, 11, 0.04, 0.96);
  const GORRO_SOMBRA = arcoDaFrente({ ...A.gorro, cy: A.gorro.cy + 11 });
  /** Linhas da malha do gorro: sobem da bainha e juntam-se no alto */
  const GORRO_MALHA = [-3, -2, -1, 0, 1, 2, 3].map((k) => {
    const b = pontoNoAnel(A.gorro, Math.PI / 2 + k * 0.38);
    return `M${b.x.toFixed(1)} ${(b.y - 8).toFixed(1)} Q${(120 + k * 30).toFixed(1)} ${(64 - Math.abs(k) * 4).toFixed(1)} ${(120 + k * 7).toFixed(1)} 40`;
  });
  const BOINA_BANDA = arcoDaFrente({ ...A.boina, cy: A.boina.cy + 2 });
  const BOINA_SOMBRA = arcoDaFrente({ ...A.boina, cy: A.boina.cy + 10 });
  const COROA_BANDA = arcoDaFrente(A.coroa);
  const COROA_SOMBRA = arcoDaFrente({ ...A.coroa, cy: A.coroa.cy + 9 });
  /** Pontas da coroa: 3 à frente e 2 atrás (mais baixas e escuras), todas a nascer do anel */
  const pontaDaCoroa = (t: number, frente: boolean, altura: number) => {
    const q = pontoNoAnel(A.coroa, t, frente);
    return { x: q.x, y: q.y, d: `M${(q.x - 14).toFixed(1)} ${(q.y - 4).toFixed(1)} L${q.x.toFixed(1)} ${(q.y - altura).toFixed(1)} L${(q.x + 14).toFixed(1)} ${(q.y - 4).toFixed(1)} Z`, topo: { x: q.x, y: q.y - altura } };
  };
  const COROA_FRENTE = [pontaDaCoroa(0.2 * Math.PI, true, 30), pontaDaCoroa(0.5 * Math.PI, true, 40), pontaDaCoroa(0.8 * Math.PI, true, 30)];
  const COROA_TRAS = [pontaDaCoroa(0.34 * Math.PI, false, 32), pontaDaCoroa(0.66 * Math.PI, false, 32)];
  const COROA_JOIAS = [
    { x: COROA_FRENTE[1].x, y: COROA_FRENTE[1].y, cor: '#ec008c', r: 5.4 },
    { x: COROA_FRENTE[0].x, y: COROA_FRENTE[0].y, cor: '#00aeef', r: 3.8 },
    { x: COROA_FRENTE[2].x, y: COROA_FRENTE[2].y, cor: '#3ddc97', r: 3.8 },
  ];
  /** Faixas do chapéu de festa: arcos cada vez mais pequenos ao subir pelo cone */
  const FESTA_FAIXAS = [0.22, 0.5, 0.76].map((k) => arcoDaFrente({ cx: A.festa.cx, cy: A.festa.cy - 74 * k, rx: A.festa.rx * (1 - k), ry: A.festa.ry * (1 - k * 0.6) }));
  const BRUXA_FRENTE_BASE = arcoDaFrente({ cx: 123, cy: 80, rx: 36, ry: 8 });
  const BRUXA_BANDA = arcoDaFrente({ cx: 123, cy: 70, rx: 31, ry: 7 });

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
    { n: 0, cor: BOLAS_CMYK[0], r: 19, rx: 214, ry: 132, vx: 6, vy: 150, cx: 212, cy: 205, frente: false },
    { n: 1, cor: BOLAS_CMYK[1], r: 21, rx: 44, ry: 182, vx: -24, vy: 150, cx: 36, cy: 203, frente: true },
    { n: 2, cor: BOLAS_CMYK[2], r: 11, rx: 28, ry: 138, vx: -50, vy: 150, cx: 68, cy: 213, frente: false },
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
  class="mascote {atual} mov-{mov} bolas-{bol}"
  class:voando
  class:esq={sentido === -1}
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
    <linearGradient id="{id}-lateral" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.32" /><stop offset="0.45" stop-color="#fff" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity="0.32" /></linearGradient>
    <linearGradient id="{id}-boina" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a98ff" /><stop offset="1" stop-color="#4655dc" /></linearGradient>
    <linearGradient id="{id}-laco" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6fc4" /><stop offset="1" stop-color="#c4006f" /></linearGradient>
    <linearGradient id="{id}-cachecol" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7c86" /><stop offset="1" stop-color="#c62d3d" /></linearGradient>
    <linearGradient id="{id}-cachecol-tras" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b92a38" /><stop offset="1" stop-color="#8f1f2b" /></linearGradient>
    <linearGradient id="{id}-vidro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.32" /><stop offset="0.5" stop-color="#cfe9ff" stop-opacity="0.12" /><stop offset="1" stop-color="#fff" stop-opacity="0.04" /></linearGradient>
    <linearGradient id="{id}-sol" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b3358" /><stop offset="1" stop-color="#0d0a15" /></linearGradient>
    <linearGradient id="{id}-metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e0a22a" /><stop offset="0.3" stop-color="#ffe9a0" /><stop offset="0.55" stop-color="#ffd45e" /><stop offset="1" stop-color="#c98a1c" /></linearGradient>
    <radialGradient id="{id}-pelo" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff" /><stop offset="1" stop-color="#cfd8f2" /></radialGradient>
    <radialGradient id="{id}-joia" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.9" /><stop offset="0.5" stop-color="#fff" stop-opacity="0" /></radialGradient>
    <clipPath id="{id}-clip-sol"><path d="M72 128 Q72 121 80 121 H106 Q114 121 114 128 Q114 148 100 150 H86 Q72 150 72 132 Z" /><path d="M168 128 Q168 121 160 121 H134 Q126 121 126 128 Q126 148 140 150 H154 Q168 150 168 132 Z" /></clipPath>
    <clipPath id="{id}-irrita-e"><polygon points="70,123 104,134 104,160 70,160" /></clipPath>
    <clipPath id="{id}-irrita-d"><polygon points="170,123 136,134 136,160 170,160" /></clipPath>
    <filter id="{id}-b2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
    <filter id="{id}-b4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
  </defs>

  <ellipse class="chao" cx="120" cy="226" rx="74" ry="9" filter="url(#{id}-b4)" />

  {#if cauda}
    <g transform={sentido === -1 ? 'translate(240 0) scale(-1 1)' : undefined}>
      <g class="vento"><rect x="-16" y="116" width="34" height="4" rx="2" /><rect x="8" y="196" width="40" height="4" rx="2" /><rect x="-46" y="164" width="24" height="4" rx="2" /></g>
    </g>
  {/if}

  <g class="tudo">
    {#if p.acessorio === 'cachecol'}
      <!-- cachecol: a metade de trás, que só se vê onde sai do contorno do corpo -->
      <path d={TRAS} fill="none" stroke="url(#{id}-cachecol-tras)" stroke-width="23" stroke-linecap="round" />
    {/if}

    <!-- bolas que ficam atrás do corpo (e do que ela veste: por isso repousam onde nenhum acessório lhes chega) -->
    {#if p.bolas}
      <g class="camada">
        {#each BOLAS.filter((b) => !b.frente) as b (b.n)}
          <g class="pos bola-{b.n}" style:--rx="{b.rx}px" style:--ry="{b.ry}px" style:--vx="{b.vx}px" style:--vxe="{240 - b.vx}px" style:--vy="{b.vy}px" style:--cx="{b.cx}px" style:--cy="{b.cy}px" style:--ox="{b.ox}px" style:--oy="{b.oy}px" style:--ax="{b.ax}px" style:--ay="{b.ay}px">
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

    <!-- cara -->
    <g class="cara" style:transform="translate({ox * 0.5}px, {oy * 0.5}px)">
     <g transform="translate(0 8)">
      <!-- olhos -->
      <g class="olhos {ex.olhos}" style:transform="translate({ox * 0.5}px, {oy * 0.5}px)">
        {#if ex.olhos === 'normal' || ex.olhos === 'cima' || ex.olhos === 'lado'}
          <g class="olhos-giro">
            <g class="olho"><ellipse cx="92" cy="134" rx="10.5" ry="13" /></g>
            <g class="olho"><ellipse cx="148" cy="134" rx="10.5" ry="13" /></g>
          </g>
        {:else if ex.olhos === 'arregalados'}
          <g class="olho grande"><ellipse cx="92" cy="133" rx="12.5" ry="16" /></g>
          <g class="olho grande"><ellipse cx="148" cy="133" rx="12.5" ry="16" /></g>
        {:else if ex.olhos === 'tristes'}
          <g class="olho"><ellipse cx="92" cy="135" rx="11" ry="14" /></g>
          <g class="olho"><ellipse cx="148" cy="135" rx="11" ry="14" /></g>
        {:else if ex.olhos === 'irritados'}
          <g clip-path="url(#{id}-irrita-e)"><g class="olho parado"><ellipse cx="92" cy="136" rx="10.5" ry="13" /></g></g>
          <g clip-path="url(#{id}-irrita-d)"><g class="olho parado"><ellipse cx="148" cy="136" rx="10.5" ry="13" /></g></g>
        {:else if ex.olhos === 'feliz'}
          <path class="traco" d="M79 142 Q92 121 105 142" /><path class="traco" d="M135 142 Q148 121 161 142" />
        {:else if ex.olhos === 'fechados'}
          <path class="traco" d="M80 133 Q92 146 104 133" /><path class="traco" d="M136 133 Q148 146 160 133" />
        {:else if ex.olhos === 'espremidos'}
          <path class="traco" d="M82 126 L100 136 L82 146" /><path class="traco" d="M158 126 L140 136 L158 146" />
        {:else if ex.olhos === 'piscadela'}
          <g class="olho parado"><ellipse cx="92" cy="134" rx="10.5" ry="13" /></g>
          <path class="traco" d="M135 140 Q148 123 161 140" />
        {:else if ex.olhos === 'coracoes'}
          <g transform="translate(92 134)"><g class="coracao"><path d="M0 12 C-18 0 -16 -16 -7.5 -16 C-3 -16 0 -13 0 -10 C0 -13 3 -16 7.5 -16 C16 -16 18 0 0 12 Z" /></g></g>
          <g transform="translate(148 134)"><g class="coracao"><path d="M0 12 C-18 0 -16 -16 -7.5 -16 C-3 -16 0 -13 0 -10 C0 -13 3 -16 7.5 -16 C16 -16 18 0 0 12 Z" /></g></g>
        {:else if ex.olhos === 'espirais'}
          <g transform="translate(92 134)"><circle r="15.5" class="olho-branco" /><path class="espiral" d={ESPIRAL} /></g>
          <g transform="translate(148 134)"><circle r="15.5" class="olho-branco" /><path class="espiral inversa" d={ESPIRAL} /></g>
        {/if}
      </g>

      <!-- lágrimas, suor e bolha de sono -->
      {#if ex.extras.includes('lagrima')}
        <path class="gota lagrima" d="M84 150 q-5 9 0 12 q5 -3 0 -12 z" />
        <path class="gota lagrima l2" d="M156 150 q-5 9 0 12 q5 -3 0 -12 z" />
      {/if}
      {#if ex.extras.includes('suor')}<path class="gota suor" d="M186 104 q-7 11 0 15 q7 -4 0 -15 z" />{/if}
      {#if ex.extras.includes('bolha')}
        <g class="bolha"><circle cx="127" cy="153" r="8.5" /><ellipse cx="124" cy="149" rx="2.6" ry="1.6" transform="rotate(-30 124 149)" class="luz-bolha" /></g>
      {/if}
     </g>
    </g>

    <!-- acessórios: com luz, sombra projetada na cara e movimento próprio (atrasado em relação ao corpo) -->
    {#if p.acessorio === 'oculos'}
      <g class="acc"><g class="oculos" style:transform="translate({ox * 0.5}px, {oy * 0.5 + 8}px)">
        <ellipse cx="120" cy="150" rx="62" ry="5" fill="#000" opacity="0.14" filter="url(#{id}-b2)" />
        <path class="haste" d="M72 132 Q62 128 56 124 M168 132 Q178 128 184 124" />
        <circle class="lente" cx="92" cy="134" r="20" fill="url(#{id}-vidro)" /><circle class="lente" cx="148" cy="134" r="20" fill="url(#{id}-vidro)" />
        <path class="ponte" d="M112 131 Q120 125 128 131" />
        <path class="reflexo" d="M78 124 Q82 118 90 117" /><path class="reflexo" d="M134 124 Q138 118 146 117" />
        <path class="brilho-vidro" d="M99 148 Q106 144 110 138" /><path class="brilho-vidro" d="M155 148 Q162 144 166 138" />
      </g></g>
    {:else if p.acessorio === 'sol'}
      <g class="acc sol"><g transform="translate(0 8)">
        <ellipse cx="120" cy="153" rx="58" ry="5" fill="#000" opacity="0.2" filter="url(#{id}-b2)" />
        <path class="haste-sol" d="M72 129 Q62 125 54 121 M168 129 Q178 125 186 121" />
        <path d="M72 128 Q72 121 80 121 H106 Q114 121 114 128 Q114 148 100 150 H86 Q72 150 72 132 Z" fill="url(#{id}-sol)" />
        <path d="M168 128 Q168 121 160 121 H134 Q126 121 126 128 Q126 148 140 150 H154 Q168 150 168 132 Z" fill="url(#{id}-sol)" />
        <path class="haste-sol" d="M114 128 Q120 124 126 128" />
        <path d="M71 124 H169" stroke="#0d0a15" stroke-width="5" stroke-linecap="round" fill="none" />
        <path d="M78 140 L96 128 M130 142 L148 130" stroke="#5ee0ff" stroke-width="3" stroke-linecap="round" opacity="0.22" />
        <g clip-path="url(#{id}-clip-sol)"><rect class="brilho-passa" x="60" y="112" width="12" height="44" fill="#fff" opacity="0.5" transform="skewX(-20)" /></g>
        <path d="M80 127 l11 -3 M136 127 l11 -3" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.6" />
      </g></g>
    {:else if p.acessorio === 'boina'}
      <g class="acc chapeu" style="--ax: 122px; --ay: 92px">
        <g transform="rotate(-5 122 80)">
          <path d={BOINA_SOMBRA} fill="none" stroke="#000" stroke-width="15" stroke-linecap="round" opacity="0.26" filter="url(#{id}-b4)" />
          <path d="M46 92 C30 50 76 30 124 30 C180 30 218 56 202 92 A76 10 0 0 1 46 92 Z" fill="url(#{id}-boina)" />
          <path d="M46 92 C30 50 76 30 124 30 C180 30 218 56 202 92 A76 10 0 0 1 46 92 Z" fill="url(#{id}-lateral)" />
          <path d="M124 34 Q88 50 62 80 M124 34 Q108 54 90 86 M124 34 Q138 56 146 88 M124 34 Q166 50 192 80" fill="none" stroke="#2f3bb8" stroke-width="2.2" stroke-linecap="round" opacity="0.32" />
          <path d={BOINA_BANDA} fill="none" stroke="#2c37b0" stroke-width="9" stroke-linecap="round" />
          <path d={BOINA_BANDA} fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.25" transform="translate(0 -3)" />
          <g class="pompom"><ellipse cx="124" cy="30" rx="6" ry="5" fill="#2c37b0" /><ellipse cx="122.5" cy="28.5" rx="2.2" ry="1.5" fill="#fff" opacity="0.5" /></g>
          <ellipse cx="92" cy="58" rx="20" ry="7" transform="rotate(-22 92 58)" fill="#fff" opacity="0.28" filter="url(#{id}-b2)" />
        </g>
      </g>
    {:else if p.acessorio === 'laco'}
      <g class="acc laco" style="--ax: 164px; --ay: 78px">
        <g transform="rotate(-14 164 78) translate(-2 -9)">
          <ellipse cx="166" cy="100" rx="24" ry="5" fill="#000" opacity="0.2" filter="url(#{id}-b2)" />
          <path class="asa-laco" d="M166 86 C176 66 198 66 200 84 C201 102 182 100 166 88 Z" fill="url(#{id}-laco)" />
          <path class="asa-laco e" d="M166 86 C156 66 134 66 132 84 C131 102 150 100 166 88 Z" fill="url(#{id}-laco)" />
          <path d="M172 82 C180 76 190 76 194 82 M160 82 C152 76 142 76 138 82" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.3" />
          <path d="M162 90 L152 108 L160 105 L164 112 L168 92 Z M170 90 L180 108 L172 105 L168 112 L166 92 Z" fill="url(#{id}-laco)" />
          <ellipse cx="166" cy="87" rx="7.5" ry="8" fill="#b00064" /><ellipse cx="164" cy="84" rx="3" ry="2.4" fill="#fff" opacity="0.5" />
        </g>
      </g>
    {:else if p.acessorio === 'gorro'}
      <g class="acc chapeu" style="--ax: 120px; --ay: 96px">
        <path d={GORRO_SOMBRA} fill="none" stroke="#000" stroke-width="17" stroke-linecap="round" opacity="0.28" filter="url(#{id}-b4)" />
        <path d="M44 94 C40 38 78 32 120 32 C162 32 200 38 196 94 A76 11 0 0 1 44 94 Z" fill="url(#{id}-azul)" />
        <path d="M44 94 C40 38 78 32 120 32 C162 32 200 38 196 94 A76 11 0 0 1 44 94 Z" fill="url(#{id}-lateral)" />
        {#each GORRO_MALHA as d, i (i)}<path class="malha" {d} />{/each}
        <path d={GORRO_BAINHA} fill="none" stroke="#2a41b8" stroke-width="26" stroke-linecap="round" />
        <path d={GORRO_BAINHA} fill="none" stroke="#3e58e4" stroke-width="23" stroke-linecap="round" />
        <path d={GORRO_BAINHA} fill="none" stroke="url(#{id}-lateral)" stroke-width="23" stroke-linecap="round" />
        {#each GORRO_COSTELAS as d, i (i)}<path class="costela" {d} />{/each}
        <path d={GORRO_BAINHA} fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.3" transform="translate(0 -10)" />
        <g class="pompom">
          {#each [0, 1, 2, 3, 4, 5, 6, 7] as k (k)}<circle cx={120 + 11 * Math.cos((k * Math.PI) / 4)} cy={32 + 11 * Math.sin((k * Math.PI) / 4)} r="5" fill="url(#{id}-pelo)" />{/each}
          <circle cx="120" cy="32" r="11" fill="url(#{id}-pelo)" /><ellipse cx="116" cy="27" rx="4" ry="2.6" fill="#fff" opacity="0.8" />
        </g>
        <ellipse cx="88" cy="58" rx="16" ry="6" transform="rotate(-24 88 58)" fill="#fff" opacity="0.28" filter="url(#{id}-b2)" />
      </g>
    {:else if p.acessorio === 'festa'}
      <g class="acc chapeu" style="--ax: 152px; --ay: 84px">
        <g transform="translate(-8 -8) rotate(11 152 82) translate(152 82) scale(1.3) translate(-152 -82)">
          <ellipse cx="152" cy="90" rx="30" ry="6" fill="#000" opacity="0.26" filter="url(#{id}-b2)" />
          <path d="M128 82 L152 8 L176 82 A24 6 0 0 1 128 82 Z" fill="url(#{id}-festa)" />
          {#each FESTA_FAIXAS as d, i (i)}<path {d} fill="none" stroke={i === 1 ? '#5ee0ff' : '#ffe27a'} stroke-width={8 - i} stroke-linecap="round" />{/each}
          <path d="M152 8 L176 82 A24 6 0 0 1 152 88 Z" fill="#000" opacity="0.17" />
          <path d="M143 40 L136 72" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.34" />
          <path d={arcoDaFrente(A.festa)} fill="none" stroke="#c4006f" stroke-width="3" stroke-linecap="round" />
          <g class="pompom">
            <path class="fita f0" d="M152 8 Q140 0 134 8" /><path class="fita f1" d="M152 8 Q164 -2 172 6" /><path class="fita f2" d="M152 8 Q154 -6 162 -8" />
            <circle cx="152" cy="8" r="8" fill="#ffe27a" /><circle cx="149" cy="5" r="3" fill="#fff" opacity="0.75" />
          </g>
        </g>
      </g>
    {:else if p.acessorio === 'coroa'}
      <g class="acc chapeu" style="--ax: 120px; --ay: 80px">
        <path d={COROA_SOMBRA} fill="none" stroke="#000" stroke-width="12" stroke-linecap="round" opacity="0.3" filter="url(#{id}-b4)" />
        {#each COROA_TRAS as q, i (i)}<path d={q.d} fill="#a86f14" stroke="#946010" stroke-width="1.6" stroke-linejoin="round" /><circle cx={q.topo.x} cy={q.topo.y} r="3.4" fill="#e8c46a" />{/each}
        <path d={COROA_BANDA} fill="none" stroke="#a86f14" stroke-width="19" stroke-linecap="round" />
        {#each COROA_FRENTE as q, i (i)}<path d={q.d} fill="url(#{id}-metal)" stroke="#b9801c" stroke-width="1.8" stroke-linejoin="round" /><circle cx={q.topo.x} cy={q.topo.y} r={i === 1 ? 4.6 : 3.8} fill="#fff6cc" />{/each}
        <path d={COROA_BANDA} fill="none" stroke="url(#{id}-metal)" stroke-width="17" stroke-linecap="round" />
        <path d={COROA_BANDA} fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.45" transform="translate(0 -6)" />
        <path d={COROA_BANDA} fill="none" stroke="#b9801c" stroke-width="1.6" stroke-dasharray="2 5" stroke-linecap="round" transform="translate(0 5)" />
        {#each COROA_JOIAS as j, i (i)}
          <ellipse cx={j.x} cy={j.y + 0.4} rx={j.r} ry={j.r + 0.4} fill={j.cor} /><ellipse cx={j.x} cy={j.y + 0.4} rx={j.r} ry={j.r + 0.4} fill="url(#{id}-joia)" />
        {/each}
        <path class="b b0" d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z" transform="translate({COROA_FRENTE[1].topo.x + 9} {COROA_FRENTE[1].topo.y - 2})" />
      </g>
    {:else if p.acessorio === 'cachecol'}
      <!-- a metade da frente: passa por cima do corpo, com sombra por baixo e listras ao longo da curva -->
      <g class="acc cachecol">
        <path d={FRENTE} fill="none" stroke="#000" stroke-width="24" stroke-linecap="round" opacity="0.22" filter="url(#{id}-b4)" transform="translate(0 7)" />
        <path d={FRENTE} fill="none" stroke="#a5232f" stroke-width="25" stroke-linecap="round" />
        <path d={FRENTE} fill="none" stroke="url(#{id}-cachecol)" stroke-width="22" stroke-linecap="round" />
        {#each LISTRAS as d, i (i)}<path class="listra" {d} />{/each}
        <path d={FRENTE} fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.28" transform="translate(0 -8)" />
        <path d={FRENTE} fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" opacity="0.18" transform="translate(0 9)" />
        <!-- nó e pontas -->
        <g class="pontas">
          <g class="ponta p1" style="--ox: 166px; --oy: 192px">
            <path d="M158 192 L174 192 L176 226 Q164 232 152 226 Z" fill="url(#{id}-cachecol)" stroke="#a5232f" stroke-width="1.6" stroke-linejoin="round" />
            <path d="M156 206 L176 205 M154 218 L177 217" class="listra" />
            <path d="M153 226 L152 232 M158 228 L157 234 M163 229 L163 235 M169 228 L169 234 M174 227 L175 233" class="franja" />
          </g>
          <g class="ponta p2" style="--ox: 172px; --oy: 192px">
            <path d="M170 192 L188 190 L196 222 Q184 230 174 224 Z" fill="url(#{id}-cachecol)" stroke="#a5232f" stroke-width="1.6" stroke-linejoin="round" />
            <path d="M172 204 L192 202 M175 216 L196 214" class="listra" />
            <path d="M174 224 L173 230 M179 226 L179 232 M185 226 L186 232 M191 224 L193 230 M196 222 L198 227" class="franja" />
          </g>
        </g>
        <ellipse cx="168" cy="190" rx="11" ry="9" fill="url(#{id}-cachecol)" stroke="#a5232f" stroke-width="1.8" />
        <path d="M160 188 Q168 183 176 188" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.35" />
      </g>
    {:else if p.acessorio === 'bruxa'}
      <g class="acc chapeu" style="--ax: 120px; --ay: 84px">
        <ellipse cx="120" cy="96" rx="62" ry="9" fill="#000" opacity="0.28" filter="url(#{id}-b4)" />
        <ellipse cx="120" cy="86" rx="68" ry="13" fill="#2f1766" />
        <ellipse cx="120" cy="82" rx="66" ry="12" fill="#4b2a96" />
        <ellipse cx="120" cy="82" rx="66" ry="12" fill="url(#{id}-lateral)" />
        <ellipse cx="120" cy="81" rx="46" ry="8" fill="#3a1f78" opacity="0.7" />
        <g class="ponta-bruxa">
          <path d="M87 80 Q99 52 113 26 Q121 8 144 14 Q138 22 136 30 Q150 54 159 80 A36 8 0 0 1 87 80 Z" fill="url(#{id}-roxo)" />
          <path d="M87 80 Q99 52 113 26 Q121 8 144 14 Q138 22 136 30 Q150 54 159 80 A36 8 0 0 1 87 80 Z" fill="url(#{id}-lateral)" />
          <ellipse cx="105" cy="54" rx="4" ry="15" transform="rotate(18 105 54)" fill="#fff" opacity="0.2" />
          <path d="M94 62 Q123 72 152 62" fill="none" stroke="#2a1560" stroke-width="2" opacity="0.3" />
        </g>
        <path d={BRUXA_BANDA} fill="none" stroke="#c98a1c" stroke-width="11" stroke-linecap="round" />
        <path d={BRUXA_BANDA} fill="none" stroke="#ffb547" stroke-width="9" stroke-linecap="round" />
        <path d={BRUXA_BANDA} fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity="0.4" transform="translate(0 -3)" />
        <rect x="114" y="68" width="18" height="13" rx="2.5" fill="none" stroke="#c98a1c" stroke-width="3.2" /><rect x="117" y="70.5" width="12" height="8" rx="1.5" fill="#ffe27a" opacity="0.5" />
        <path class="estrela-bruxa e0" d="M106 44 l1.6 3.4 3.6 0.5 -2.6 2.5 0.6 3.6 -3.2 -1.7 -3.2 1.7 0.6 -3.6 -2.6 -2.5 3.6 -0.5 z" />
        <path class="estrela-bruxa e1" d="M130 56 l1.2 2.5 2.7 0.4 -2 1.9 0.5 2.7 -2.4 -1.3 -2.4 1.3 0.5 -2.7 -2 -1.9 2.7 -0.4 z" />
      </g>
    {/if}

    <!-- bolas à frente: por cima de tudo o que a mascote veste (as de trás ficam atrás do corpo) -->
    {#if p.bolas}
      <g class="camada">
        {#each BOLAS.filter((b) => b.frente) as b (b.n)}
          <g class="pos bola-{b.n}" style:--rx="{b.rx}px" style:--ry="{b.ry}px" style:--vx="{b.vx}px" style:--vxe="{240 - b.vx}px" style:--vy="{b.vy}px" style:--cx="{b.cx}px" style:--cy="{b.cy}px" style:--ox="{b.ox}px" style:--oy="{b.oy}px" style:--ax="{b.ax}px" style:--ay="{b.ay}px">
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

  /* ─────────── corpo: cada movimento é um conjunto de keyframes, preso ao chão ─────────── */
  .tudo {
    transform-box: view-box;
    transform-origin: 120px 224px;
    animation: respira 7s ease-in-out infinite;
  }
  /* respira, e de vez em quando dá um saltinho de contente (agacha-se, salta, aterra e assenta) */
  @keyframes respira {
    0%,
    40%,
    100% {
      transform: scale(1, 1);
    }
    20% {
      transform: scale(1.018, 0.974);
    }
    72% {
      transform: scale(1.025, 0.95);
    }
    78% {
      transform: translateY(-15px) scale(0.97, 1.05);
    }
    84% {
      transform: translateY(0) scale(1.05, 0.93);
    }
    90% {
      transform: translateY(-3px) scale(0.99, 1.02);
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
  .analisa .olhos-giro,
  .voando .olhos-giro {
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
  /* movimento próprio: balançam um pouco atrasados em relação ao corpo, e mais quando o corpo se mexe */
  .acc {
    transform-box: view-box;
    transform-origin: var(--ax, 120px) var(--ay, 120px);
    animation: acc-balanca 3.4s ease-in-out infinite 0.14s;
  }
  @keyframes acc-balanca {
    0%,
    100% {
      transform: rotate(-1deg) translateY(0);
    }
    50% {
      transform: rotate(1.4deg) translateY(-1.5px);
    }
  }
  .mov-salta .acc,
  .mov-danca .acc,
  .mov-cumprimenta .acc,
  .mov-sobe .acc,
  .mov-pisca .acc {
    animation: acc-pula 1s ease-in-out infinite;
  }
  .mov-danca .acc {
    animation-duration: 0.9s;
  }
  @keyframes acc-pula {
    0%,
    100% {
      transform: translateY(0) rotate(0);
    }
    30% {
      transform: translateY(3px) rotate(-2.5deg);
    }
    62% {
      transform: translateY(-4px) rotate(2.5deg);
    }
  }
  .mov-voa .acc,
  .mov-procura .acc {
    animation: acc-voa 0.6s ease-in-out infinite;
  }
  @keyframes acc-voa {
    0%,
    100% {
      transform: translate(-2px, 0) rotate(5deg);
    }
    50% {
      transform: translate(-4px, -1px) rotate(7deg);
    }
  }
  .mov-tonta .acc {
    animation: acc-tonta 1.8s ease-in-out infinite;
  }
  @keyframes acc-tonta {
    0%,
    100% {
      transform: rotate(10deg) translateX(3px);
    }
    50% {
      transform: rotate(-10deg) translateX(-3px);
    }
  }
  .mov-treme .acc,
  .mov-abana .acc {
    animation: acc-treme 0.3s ease-in-out infinite;
  }
  @keyframes acc-treme {
    0%,
    100% {
      transform: rotate(-2deg);
    }
    50% {
      transform: rotate(2deg);
    }
  }
  .mov-dorme .acc {
    animation: acc-dorme 4.4s ease-in-out infinite;
  }
  @keyframes acc-dorme {
    0%,
    100% {
      transform: rotate(-5deg) translateY(2px);
    }
    50% {
      transform: rotate(-3.5deg) translateY(1px);
    }
  }
  .mov-surpresa .acc {
    animation: acc-surpresa 0.7s cubic-bezier(0.34, 1.4, 0.64, 1) both;
  }
  @keyframes acc-surpresa {
    0% {
      transform: translateY(0);
    }
    35% {
      transform: translateY(-9px) rotate(-4deg);
    }
    100% {
      transform: translateY(0) rotate(0);
    }
  }
  /* pompons e fitas abanam por conta própria */
  .pompom {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: pompom 2.4s ease-in-out infinite;
  }
  @keyframes pompom {
    0%,
    100% {
      transform: translate(0, 0) scale(1, 1);
    }
    50% {
      transform: translate(1.5px, -2px) scale(1.05, 0.96);
    }
  }
  .mov-salta .pompom,
  .mov-danca .pompom,
  .mov-cumprimenta .pompom {
    animation-duration: 0.5s;
  }
  .fita {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
    transform-box: fill-box;
    transform-origin: 0 100%;
    animation: fita 1.6s ease-in-out infinite;
  }
  .fita.f0 {
    stroke: #5ee0ff;
  }
  .fita.f1 {
    stroke: #ffe27a;
    animation-delay: -0.5s;
  }
  .fita.f2 {
    stroke: #ff7fb0;
    animation-delay: -1s;
  }
  @keyframes fita {
    0%,
    100% {
      transform: rotate(-8deg);
    }
    50% {
      transform: rotate(10deg);
    }
  }
  /* o laço esvoaça */
  .asa-laco {
    transform-box: fill-box;
    transform-origin: 0% 50%;
    animation: laco 2.8s ease-in-out infinite;
  }
  .asa-laco.e {
    transform-origin: 100% 50%;
    animation-delay: -1.4s;
  }
  @keyframes laco {
    0%,
    100% {
      transform: scale(1, 1);
    }
    50% {
      transform: scale(1.04, 0.92);
    }
  }
  /* a ponta do chapéu de bruxa dá de si */
  .ponta-bruxa {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: ponta-bruxa 2.6s ease-in-out infinite;
  }
  @keyframes ponta-bruxa {
    0%,
    100% {
      transform: rotate(-2deg);
    }
    50% {
      transform: rotate(3deg);
    }
  }
  .estrela-bruxa {
    fill: #ffe27a;
    transform-box: fill-box;
    transform-origin: center;
    animation: brilha 1.8s ease-in-out infinite;
  }
  .estrela-bruxa.e1 {
    animation-delay: -0.9s;
  }
  /* reflexos que passam pelas coroas e pelos óculos */
  .brilho-passa {
    animation: passa 4s ease-in-out infinite;
  }
  @keyframes passa {
    0%,
    55% {
      transform: skewX(-20deg) translateX(0);
    }
    85%,
    100% {
      transform: skewX(-20deg) translateX(150px);
    }
  }
  .brilho-vidro {
    fill: none;
    stroke: #fff;
    stroke-width: 2.4;
    stroke-linecap: round;
    opacity: 0.4;
    animation: pisca-vidro 3.6s ease-in-out infinite;
  }
  @keyframes pisca-vidro {
    0%,
    100% {
      opacity: 0.2;
    }
    50% {
      opacity: 0.7;
    }
  }
  /* óculos */
  .oculos {
    transition: transform 0.14s ease-out;
  }
  .oculos .lente {
    stroke: var(--tinta);
    stroke-width: 4;
  }
  .oculos .haste,
  .oculos .ponte {
    fill: none;
    stroke: var(--tinta);
    stroke-width: 4;
    stroke-linecap: round;
  }
  .oculos .reflexo {
    fill: none;
    stroke: #fff;
    stroke-width: 3;
    stroke-linecap: round;
    opacity: 0.7;
  }
  .haste-sol {
    fill: none;
    stroke: #0d0a15;
    stroke-width: 4;
    stroke-linecap: round;
  }
  .malha {
    fill: none;
    stroke: #2a41b8;
    stroke-width: 2.2;
    stroke-linecap: round;
    opacity: 0.3;
  }
  .costela {
    fill: none;
    stroke: #2a41b8;
    stroke-width: 2.6;
    stroke-linecap: round;
    opacity: 0.55;
  }
  /* cachecol */
  .cachecol .listra {
    fill: none;
    stroke: #fff;
    stroke-width: 4.2;
    stroke-linecap: butt;
    opacity: 0.85;
  }
  .cachecol .franja {
    fill: none;
    stroke: #c62d3d;
    stroke-width: 2.4;
    stroke-linecap: round;
  }
  .ponta {
    transform-box: view-box;
    transform-origin: var(--ox) var(--oy);
    animation: ponta 2.6s ease-in-out infinite;
  }
  .ponta.p2 {
    animation-delay: -1.1s;
  }
  @keyframes ponta {
    0%,
    100% {
      transform: rotate(-3deg);
    }
    50% {
      transform: rotate(5deg);
    }
  }
  .mov-voa .ponta,
  .mov-procura .ponta {
    animation: ponta-voa 0.45s ease-in-out infinite;
  }
  .mov-salta .ponta,
  .mov-danca .ponta,
  .mov-cumprimenta .ponta {
    animation: ponta-pula 0.7s ease-in-out infinite;
  }
  @keyframes ponta-voa {
    0%,
    100% {
      transform: rotate(-24deg);
    }
    50% {
      transform: rotate(-34deg);
    }
  }
  @keyframes ponta-pula {
    0%,
    100% {
      transform: rotate(6deg);
    }
    50% {
      transform: rotate(-12deg);
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
  /* a voar para a esquerda: tudo do lado contrário (bolas e vento à direita, inclinada para o outro lado) */
  .esq.bolas-voam.com-cauda .pos {
    transform: translate(var(--vxe), var(--vy));
  }
  .esq.bolas-voam .flota {
    animation-name: onda-esq;
  }
  @keyframes onda-esq {
    0%,
    100% {
      transform: translate(3px, 4px);
    }
    50% {
      transform: translate(-4px, -14px);
    }
  }
  .esq.mov-voa .tudo {
    animation-name: voa-esq;
  }
  @keyframes voa-esq {
    0%,
    100% {
      transform: translateY(-4px) rotate(6deg);
    }
    50% {
      transform: translateY(-16px) rotate(3deg);
    }
  }
  .esq.mov-voa .acc,
  .esq.mov-procura .acc {
    animation-name: acc-voa-esq;
  }
  @keyframes acc-voa-esq {
    0%,
    100% {
      transform: translate(2px, 0) rotate(-5deg);
    }
    50% {
      transform: translate(4px, -1px) rotate(-7deg);
    }
  }
  .esq.mov-voa .ponta,
  .esq.mov-procura .ponta {
    animation-name: ponta-voa-esq;
  }
  @keyframes ponta-voa-esq {
    0%,
    100% {
      transform: rotate(24deg);
    }
    50% {
      transform: rotate(34deg);
    }
  }
  .esq.voando .olhos-giro {
    transform: translateX(-6px);
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
  .analisa .vento,
  .voando .vento {
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
