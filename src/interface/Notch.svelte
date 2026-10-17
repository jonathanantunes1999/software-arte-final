<script lang="ts">
  import { onMount } from 'svelte';
  import { desktop } from './desktop';
  import { definicoes } from './definicoes.svelte';
  import { PERFIL_OMISSAO } from '../mascote/personalizacao';
  import Mascote from './Mascote.svelte';
  import type { EstadoMascote } from '../mascote/expressoes';

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
  /** A mascote reage: cumprimenta, apaixona-se quando o ficheiro está por cima, assusta-se com um erro */
  const cara = $derived<EstadoMascote>(erro ? 'erro' : saindo ? 'feliz' : modo === 'dica' ? 'cumprimenta' : sobre ? 'ama' : 'cumprimenta');
  const comMascote = $derived(definicoes.mascote.visivel);

  // --- a sequência de entrada: a mascote come o PDF, fica a pensar e rebenta em partículas
  /** null = a janelinha de sempre; 'devorar' = come e pensa (enquanto a janela principal analisa); 'explodir' = partículas */
  let fase = $state<'devorar' | 'explodir' | null>(null);
  /** 0 = corpo macio; 1 = retangular (a "boca" larga que engole o PDF) */
  let forma = $state(0);
  /** O que a mascote está a fazer por baixo da fase: come, pensa (primeiro) e trabalha (se a espera se prolonga) */
  let passo = $state<'come' | 'pensa' | 'trabalha' | 'feliz'>('come');
  let canvas: HTMLCanvasElement | undefined = $state();
  const caraSeq = $derived<EstadoMascote>(passo === 'come' ? 'surpresa' : passo === 'pensa' ? 'pensa' : passo === 'trabalha' ? 'trabalha' : 'feliz');
  /** Na sequência a mascote vem sem acessórios (o corpo muda de forma e um chapéu ficava a flutuar) e na cor dela */
  const perfilSeq = $derived({ ...(definicoes.mascote ?? PERFIL_OMISSAO), acessorio: 'nenhum' as const, visivel: true, animada: true });
  let temporizadores: ReturnType<typeof setTimeout>[] = [];
  let quadro = 0;
  const depois = (ms: number, f: () => void) => temporizadores.push(setTimeout(f, ms));
  function limparSequencia() {
    temporizadores.forEach(clearTimeout);
    temporizadores = [];
    cancelAnimationFrame(quadro);
  }

  /** Anima `forma` até `alvo`; `sobe` dá um pequeno balanço no fim (a mola) */
  function animarForma(alvo: number, ms: number, mola = false) {
    cancelAnimationFrame(quadro);
    const de = forma;
    const t0 = performance.now();
    const quadroF = (agora: number) => {
      const t = Math.min(1, (agora - t0) / ms);
      const suave = 1 - Math.pow(1 - t, 3);
      // a mola: passa um pouco do alvo e volta
      const extra = mola ? Math.sin(t * Math.PI) * 0.12 * (alvo < de ? -1 : 1) : 0;
      forma = de + (alvo - de) * suave + extra;
      if (t < 1) quadro = requestAnimationFrame(quadroF);
      else forma = alvo;
    };
    quadro = requestAnimationFrame(quadroF);
  }

  function aoFase(f: string) {
    limparSequencia();
    if (f === 'devorar') {
      fase = 'devorar';
      passo = 'come';
      forma = 0;
      depois(90, () => animarForma(1, 460));
      depois(980, () => (passo = 'pensa'));
      // se a análise demora, a mascote passa a "trabalhar" (as bolas a orbitar): a espera não fica parada
      depois(3200, () => (passo = 'trabalha'));
    } else if (f === 'explodir') {
      fase = 'explodir';
      passo = 'feliz';
      animarForma(0, 420, true);
      explodir();
    }
  }

  // --- partículas: bolinhas brancas e discretas, a abrir-se em roda à volta da mascote (sem brilho)
  interface Particula {
    /** Ângulo de partida e de chegada (a roda gira um pouco ao abrir) e raios de partida e de chegada */
    a0: number;
    a1: number;
    r0: number;
    r1: number;
    /** Tamanho da bolinha e opacidade */
    r: number;
    alfa: number;
    atraso: number;
    dura: number;
  }
  function explodir() {
    const c = canvas;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const L = c.clientWidth;
    const A = c.clientHeight;
    c.width = L * dpr;
    c.height = A * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    // o centro da mascote: por baixo da notch física (38 pt) quando a há
    const topo = temNotch ? 38 : 0;
    const cx = L / 2;
    const cy = topo + (A - topo) / 2;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    // três rodas, uma dentro da outra: cada uma com as bolinhas igualmente espaçadas; a de dentro é a mais pequena e
    // a mais lenta. O que passa da janelinha é cortado.
    const rodas = [
      { n: 30, r0: 40, r1: 215, tam: [2.6, 4.2], giro: 0.5, atraso: 0 },
      { n: 22, r0: 36, r1: 150, tam: [2, 3.2], giro: -0.45, atraso: 0.05 },
      { n: 15, r0: 32, r1: 98, tam: [1.5, 2.4], giro: 0.4, atraso: 0.1 },
    ];
    const ps: Particula[] = [];
    for (const [i, w] of rodas.entries()) {
      const fase = rnd(0, Math.PI * 2);
      for (let k = 0; k < w.n; k++) {
        const a = fase + (k / w.n) * Math.PI * 2 + rnd(-0.05, 0.05);
        ps.push({ a0: a, a1: a + w.giro, r0: w.r0, r1: w.r1 * rnd(0.94, 1.06), r: rnd(w.tam[0], w.tam[1]), alfa: rnd(0.5, 0.82), atraso: w.atraso + rnd(0, 0.04), dura: rnd(1.05, 1.3) + i * 0.05 });
      }
    }
    // umas poucas soltas, para a roda não parecer tão certinha
    for (let k = 0; k < 16; k++) {
      const a = rnd(0, Math.PI * 2);
      ps.push({ a0: a, a1: a + rnd(-0.3, 0.3), r0: 34, r1: rnd(60, 190), r: rnd(1.4, 2.4), alfa: rnd(0.3, 0.6), atraso: rnd(0.02, 0.18), dura: rnd(0.9, 1.4) });
    }
    const t0 = performance.now();
    const quadroP = (agora: number) => {
      const t = (agora - t0) / 1000;
      g.clearRect(0, 0, L, A);
      g.fillStyle = '#fff';
      let vivas = 0;
      for (const p of ps) {
        const k = (t - p.atraso) / p.dura;
        if (k <= 0) {
          vivas++;
          continue;
        }
        if (k >= 1) continue;
        vivas++;
        // abre depressa e abranda (ease-out); desvanece-se na segunda metade
        const e = 1 - Math.pow(1 - k, 3);
        const ang = p.a0 + (p.a1 - p.a0) * e;
        const raio = p.r0 + (p.r1 - p.r0) * e;
        g.globalAlpha = p.alfa * (k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6);
        g.beginPath();
        g.arc(cx + Math.cos(ang) * raio, cy + Math.sin(ang) * raio * 0.72, p.r * (1 - k * 0.35), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      if (vivas > 0) quadro2 = requestAnimationFrame(quadroP);
      else g.clearRect(0, 0, L, A);
    };
    cancelAnimationFrame(quadro2);
    quadro2 = requestAnimationFrame(quadroP);
  }
  let quadro2 = 0;

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
    const pararFase = ponte?.aoFase(aoFase);
    const pararEsconder = ponte?.aoEsconder(() => {
      saindo = true;
      setTimeout(() => {
        modo = null;
        saindo = false;
        sobre = false;
        fase = null;
        forma = 0;
        limparSequencia();
        cancelAnimationFrame(quadro2);
      }, 300);
    });
    return () => {
      pararMostrar?.();
      pararFase?.();
      pararEsconder?.();
      limparSequencia();
    };
  });

  // --- arrastar e largar
  let contador = 0;
  const temFicheiros = (ev: DragEvent) => !!ev.dataTransfer?.types.includes('Files');

  function aoEntrar(ev: DragEvent) {
    if (!temFicheiros(ev)) return;
    ev.preventDefault();
    contador++;
    if (contador === 1) ponte?.evento('dragenter');
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
    ponte?.evento('drop');
    const todos = [...(ev.dataTransfer?.files ?? [])];
    if (!todos.length || !ponte) return;
    const falha = (texto: string, ms = 3500) => {
      erro = texto;
      ponte.segurar(ms + 400); // a janelinha fica à vista a mostrar o erro
      setTimeout(() => (erro = ''), ms);
    };
    // só os PDFs: se vierem outras coisas misturadas, ignoram-se; se não houver nenhum, diz-se
    const pdfs = todos.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (!pdfs.length) {
      falha('Só PDFs', 2200);
      return;
    }
    try {
      // o processo principal abre a janela principal (com todos) e esconde esta; se falhar, diz porquê
      const itens = await Promise.all(
        pdfs.map(async (f) => {
          const caminho = desktop?.caminhoDe(f) ?? '';
          return caminho ? { caminho } : { nome: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
        }),
      );
      const r = await ponte.soltarLista(itens);
      if (!r.ok) falha(r.erro || 'Não consegui abrir');
    } catch (e) {
      falha(`Erro: ${(e as Error).message}`.slice(0, 120));
    }
  }
</script>

<svelte:window ondragenter={aoEntrar} ondragover={aoSobrepor} ondragleave={aoSair} ondrop={aoLargar} />

<div class="cena" class:com-notch={temNotch}>
  {#if modo && fase}
    <div class="palco" class:saindo class:fim={fase === 'explodir'} class:com-notch={temNotch}>
      <canvas class="particulas" bind:this={canvas}></canvas>
      <div class="ator" style:top="{temNotch ? 38 : 0}px">
        <!-- o PDF sobe de baixo (de onde o arrastaste) e desaparece por trás do corpo: foi engolido -->
        <svg class="folha" viewBox="0 0 60 78" width="44" height="57" aria-hidden="true">
          <rect x="2" y="2" width="56" height="74" rx="7" fill="#fff" />
          <rect x="10" y="12" width="26" height="6" rx="3" fill="#c9ced8" />
          <rect x="10" y="26" width="40" height="4" rx="2" fill="#dfe3ea" />
          <rect x="10" y="35" width="40" height="4" rx="2" fill="#dfe3ea" />
          <rect x="10" y="44" width="30" height="4" rx="2" fill="#dfe3ea" />
          <rect x="10" y="56" width="22" height="11" rx="4" fill="#ec008c" />
          <text x="21" y="64.6" font-size="6.6" font-weight="800" fill="#fff" text-anchor="middle" font-family="system-ui, sans-serif">PDF</text>
        </svg>
        <div class="corpo" class:gulp={passo !== 'come'} class:pulsa={passo === 'pensa' || passo === 'trabalha'} class:pop={passo === 'feliz'}>
          <Mascote tamanho={98} estado={caraSeq} {forma} perfil={perfilSeq} seguir={false} interativa={false} configuravel={false} titulo="A mascote" />
        </div>
      </div>
    </div>
  {:else if modo}
    <div class="zona {modo}" class:saindo class:sobre class:erro={!!erro} class:com-notch={temNotch}>
      {#if modo === 'aberto'}
        <div class="largar">
          {#if comMascote}
            <Mascote tamanho={50} estado={cara} seguir={false} interativa={false} configuravel={false} titulo="A mascote" />
          {:else}
            <svg viewBox="0 0 48 48" width="30" height="30" aria-hidden="true">
              <circle class="anel" cx="24" cy="24" r="21" />
              <path d="M24 33V15m0 0l-7 7m7-7l7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          {/if}
          <strong>{erro || (sobre ? 'Larga para abrir' : 'Coloca aqui o PDF')}</strong>
        </div>
      {:else}
        <div class="dica-linha">
          {#if comMascote}<Mascote tamanho={46} estado={cara} seguir={false} interativa={false} configuravel={false} titulo="A mascote" />{/if}
          <div class="texto-dica">
            <span>Arrasta um PDF para o topo do ecrã</span>
          </div>
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
    animation: nasce 0.38s cubic-bezier(0.2, 0.9, 0.25, 1);
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
  /* sai devagar: o texto esvai-se primeiro e a janelinha recolhe para o topo, como se voltasse para dentro da notch */
  .zona.saindo {
    animation: recolhe 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
  .zona.saindo > * {
    animation: esvai 0.14s ease-out forwards;
  }
  @keyframes esvai {
    to {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  @keyframes nasce {
    from {
      transform: scale(0.5, 0.25);
      opacity: 0.35;
    }
  }
  @keyframes recolhe {
    35% {
      opacity: 1;
    }
    to {
      transform: scale(0.78, 0.22);
      opacity: 0;
    }
  }
  .largar {
    display: flex;
    align-items: center;
    gap: 12px;
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
    font-size: 15px;
    font-weight: 600;
    color: #eef1f7;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  .dica-linha {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .texto-dica {
    text-align: center;
    gap: 2px;
    animation: entra 0.3s 0.08s ease both;
  }
  .texto-dica span {
    font-size: 12.5px;
    color: #8d95a9;
    white-space: nowrap;
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

  /* --- a sequência de entrada: tudo dentro da janelinha (palco = a própria pílula, só um pouco maior) --- */
  .palco {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-top: 0;
    border-radius: 0 0 30px 30px;
    transform-origin: top center;
    /* cresce da pílula (360 × 100) para o tamanho da sequência */
    animation: cresce-palco 0.4s cubic-bezier(0.2, 0.9, 0.25, 1.05) both;
    transition: background 0.35s;
  }
  .palco:not(.com-notch) {
    border-radius: 30px;
    border-top: 1px solid rgb(255 255 255 / 0.08);
  }
  .palco.fim {
    background: radial-gradient(75% 110% at 50% 55%, #10161c 0%, #000 78%);
  }
  @keyframes cresce-palco {
    from {
      width: 360px;
      height: 100px;
      margin-left: auto;
      margin-right: auto;
    }
  }
  .particulas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .ator {
    position: absolute;
    left: 50%;
    width: 0;
    height: 100%;
  }
  .corpo {
    position: absolute;
    left: -49px;
    top: 10px;
    z-index: 2;
    transform-origin: 50% 80%;
    animation: aparece-corpo 0.4s cubic-bezier(0.2, 1.2, 0.4, 1) both;
  }
  /* o PDF sobe de baixo e some por trás do corpo */
  .folha {
    position: absolute;
    left: -22px;
    top: 150px;
    z-index: 1;
    opacity: 0;
    filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.55));
    animation: engole 0.78s 0.5s cubic-bezier(0.55, 0, 0.75, 0.45) both;
  }
  @keyframes aparece-corpo {
    from {
      transform: scale(0.4);
      opacity: 0;
    }
  }
  @keyframes engole {
    0% {
      opacity: 1;
      transform: translateY(0) rotate(-9deg) scale(1);
    }
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateY(-96px) rotate(0deg) scale(0.6);
    }
  }
  /* o "gulp": esmaga e estica quando o PDF entra */
  @keyframes gulp {
    0% {
      transform: scale(1, 1);
    }
    28% {
      transform: scale(1.1, 0.88);
    }
    60% {
      transform: scale(0.96, 1.08);
    }
    100% {
      transform: scale(1, 1);
    }
  }
  @keyframes respira-pensa {
    0%,
    100% {
      transform: scale(1, 1);
    }
    50% {
      transform: scale(1.035, 0.975);
    }
  }
  @keyframes pop {
    0% {
      transform: scale(1.22, 0.84);
    }
    45% {
      transform: scale(0.94, 1.1);
    }
    100% {
      transform: scale(1, 1);
    }
  }
  .corpo.gulp {
    animation: gulp 0.44s cubic-bezier(0.3, 0.7, 0.4, 1) both;
  }
  .corpo.pulsa {
    animation: gulp 0.44s cubic-bezier(0.3, 0.7, 0.4, 1) both, respira-pensa 1.5s 0.5s ease-in-out infinite;
  }
  .corpo.pop {
    animation: pop 0.55s cubic-bezier(0.2, 1.3, 0.4, 1) both;
  }
  .palco.saindo {
    animation: recolhe-palco 0.34s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
  @keyframes recolhe-palco {
    35% {
      opacity: 1;
    }
    to {
      transform: scale(0.9, 0.7);
      opacity: 0;
    }
  }
</style>
