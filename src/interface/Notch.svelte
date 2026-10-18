<script lang="ts">
  import { onMount } from 'svelte';
  import { desktop } from './desktop';
  import { definicoes } from './definicoes.svelte';
  import { PERFIL_OMISSAO } from '../mascote/personalizacao';
  import Mascote from './Mascote.svelte';
  import type { EstadoMascote } from '../mascote/expressoes';
  import { alvoDaBarra, grampear } from './barra-notch';

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

  // --- a sequência de entrada: a mascote come o PDF e depois leva uma barra a encher, enquanto a análise corre a sério
  /** null = a janelinha de sempre; 'devorar' = come o PDF e leva a barra (enquanto a janela principal analisa); 'concluir' = a barra fecha */
  let fase = $state<'devorar' | 'concluir' | null>(null);
  /** 0 = corpo macio; 1 = retangular (a "boca" larga que engole o PDF) */
  let forma = $state(0);
  /** O que a mascote está a fazer: come, analisa (a empurrar a barra) e fica contente (a barra chegou ao fim) */
  let passo = $state<'come' | 'analisa' | 'feliz'>('come');
  const caraSeq = $derived<EstadoMascote>(passo === 'come' ? 'surpresa' : passo === 'analisa' ? 'analisa' : 'feliz');
  /** Na sequência a mascote vem sem acessórios (o corpo muda de forma e um chapéu ficava a flutuar) e na cor dela */
  const perfilSeq = $derived({ ...(definicoes.mascote ?? PERFIL_OMISSAO), acessorio: 'nenhum' as const, visivel: true, animada: true });
  let temporizadores: ReturnType<typeof setTimeout>[] = [];
  let quadro = 0;
  const depois = (ms: number, f: () => void) => temporizadores.push(setTimeout(f, ms));
  function limparSequencia() {
    temporizadores.forEach(clearTimeout);
    temporizadores = [];
    cancelAnimationFrame(quadro);
    cancelAnimationFrame(quadroForma);
    rodando = false;
  }

  /** Anima `forma` até `alvo` */
  let quadroForma = 0;
  function animarForma(alvo: number, ms: number) {
    cancelAnimationFrame(quadroForma);
    const de = forma;
    const t0 = performance.now();
    const quadroF = (agora: number) => {
      const t = Math.min(1, (agora - t0) / ms);
      forma = de + (alvo - de) * (1 - Math.pow(1 - t, 3));
      if (t < 1) quadroForma = requestAnimationFrame(quadroF);
      else forma = alvo;
    };
    quadroForma = requestAnimationFrame(quadroF);
  }

  // O palco tem 440 × 130. A mascote (o centro do corpo) e a barra são posicionadas por aqui, em px do palco.
  const LARGURA_MASC = 155;
  /** Onde fica o centro do corpo dentro do desenho da mascote (com cauda): fração da largura e da altura */
  const CENTRO_X = 0.643;
  const CENTRO_Y = 0.556;
  const BARRA = { esq: 70, larg: 300, y: 110, alt: 8 };
  /** A barra pelas tintas de processo: ciano, magenta, amarelo e preto, como uma tira de controlo de cor */
  const TINTAS = ['#00aeef', '#ec008c', '#ffd400', '#5b6076'];
  const T_TRANSICAO = 1.1;
  const D_TRANSICAO = 0.5;
  /** O progresso real da análise, 0…1 (vem da janela principal) */
  let real = 0;
  let concluindo = false;
  let rodando = false;
  /** O que a barra mostra agora (0…1) e onde está a mascote (centro do corpo, escala) */
  let enche = $state(0);
  let pose = $state({ x: 220, y: 84, s: 1 });
  let barraVisivel = $state(false);
  const suave = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  function rodar() {
    const topo = temNotch ? 38 : 0;
    const grande = { x: 220, y: topo + (130 - topo) / 2, s: 1 };
    const naBarra = (f: number) => ({ x: BARRA.esq + f * BARRA.larg, y: BARRA.y - 26, s: 0.78 });
    const t0 = performance.now();
    let ultimo = t0;
    rodando = true;
    const f = (agora: number) => {
      if (!rodando) return;
      const t = (agora - t0) / 1000;
      const dt = Math.min(0.05, (agora - ultimo) / 1000);
      ultimo = agora;
      if (t < T_TRANSICAO) {
        pose = grande;
      } else {
        if (!barraVisivel) {
          barraVisivel = true;
          passo = 'analisa';
          animarForma(0, 420);
        }
        const alvo = alvoDaBarra(real, t - T_TRANSICAO, concluindo);
        enche += (alvo - enche) * (1 - Math.exp(-dt * (concluindo ? 9 : 5)));
        const bar = naBarra(enche);
        const k = grampear((t - T_TRANSICAO) / D_TRANSICAO);
        const e = suave(k);
        pose = k < 1 ? { x: grande.x + (bar.x - grande.x) * e, y: grande.y + (bar.y - grande.y) * e, s: grande.s + (bar.s - grande.s) * e } : bar;
        // a barra chegou ao fim: a mascote deixa de voar e fica contente
        if (concluindo && enche > 0.985 && passo !== 'feliz') {
          enche = 1;
          passo = 'feliz';
        }
      }
      quadro = requestAnimationFrame(f);
    };
    quadro = requestAnimationFrame(f);
  }

  function aoFase(f: string) {
    if (f === 'devorar') {
      limparSequencia();
      fase = 'devorar';
      passo = 'come';
      forma = 0;
      enche = 0;
      real = 0;
      concluindo = false;
      barraVisivel = false;
      depois(60, () => animarForma(1, 420));
      rodar();
    } else if (f === 'concluir') {
      concluindo = true;
      fase = 'concluir';
    }
  }

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
    // o progresso nunca recua: com vários ficheiros a média podia baixar quando entra o seguinte
    const pararProgresso = ponte?.aoProgresso((v) => (real = Math.max(real, Math.min(1, Math.max(0, v)))));
    const pararEsconder = ponte?.aoEsconder(() => {
      saindo = true;
      setTimeout(() => {
        modo = null;
        saindo = false;
        sobre = false;
        fase = null;
        forma = 0;
        barraVisivel = false;
        limparSequencia();
      }, 300);
    });
    return () => {
      pararMostrar?.();
      pararFase?.();
      pararProgresso?.();
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
    <div class="palco" class:saindo class:fim={fase === 'concluir'} class:com-notch={temNotch}>
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
      </div>
      <!-- a barra enche com as quatro tintas; a mascote vai na ponta e é ela que a empurra -->
      <div class="barra" class:visivel={barraVisivel} style:left="{BARRA.esq}px" style:top="{BARRA.y - BARRA.alt / 2}px" style:width="{BARRA.larg}px" style:height="{BARRA.alt}px" role="progressbar" aria-label="A analisar o PDF" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(enche * 100)}>
        <div class="enche" style:width="{enche * 100}%">
          <div class="tintas" style:width="{BARRA.larg}px">
            {#each TINTAS as cor (cor)}<span style:background={cor}></span>{/each}
          </div>
        </div>
      </div>
      <div class="corpo" style:left="{pose.x - CENTRO_X * LARGURA_MASC}px" style:top="{pose.y - CENTRO_Y * ((LARGURA_MASC * 252) / 336)}px" style:width="{LARGURA_MASC}px" style:transform="scale({pose.s})" style:transform-origin="{CENTRO_X * 100}% {CENTRO_Y * 100}%">
        <!-- o salto de contente vai por dentro: a escala do corpo (a posição na barra) não se pode misturar com a dele -->
        <div class="salto" class:pop={passo === 'feliz'}>
          <Mascote tamanho={LARGURA_MASC} cauda estado={caraSeq} {forma} perfil={perfilSeq} seguir={false} interativa={false} configuravel={false} titulo="A mascote" />
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
  .ator {
    position: absolute;
    left: 50%;
    width: 0;
    height: 100%;
  }
  /* a mascote: a posição e a escala vêm do script (primeiro no meio, a comer; depois na ponta da barra) */
  .corpo {
    position: absolute;
    z-index: 2;
    animation: aparece-corpo 0.4s cubic-bezier(0.2, 1.2, 0.4, 1) both;
  }
  .salto {
    transform-origin: 64.3% 80%;
  }
  .salto.pop {
    animation: pop 0.55s cubic-bezier(0.2, 1.3, 0.4, 1) both;
  }
  /* o PDF sobe de baixo e some por trás do corpo */
  .folha {
    position: absolute;
    left: -22px;
    top: 150px;
    z-index: 1;
    opacity: 0;
    filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.55));
    animation: engole 0.62s 0.3s cubic-bezier(0.55, 0, 0.75, 0.45) both;
  }
  @keyframes aparece-corpo {
    from {
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

  /* a barra: um trilho escuro que se enche com as quatro tintas, como a tira de cor de uma prova */
  .barra {
    position: absolute;
    z-index: 1;
    border-radius: 999px;
    background: #14151b;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1);
    overflow: hidden;
    opacity: 0;
    transform: scaleX(0.7);
    transition: opacity 0.3s, transform 0.4s cubic-bezier(0.2, 0.9, 0.25, 1);
  }
  .barra.visivel {
    opacity: 1;
    transform: none;
  }
  .enche {
    height: 100%;
    overflow: hidden;
    border-radius: 999px;
  }
  .tintas {
    display: flex;
    height: 100%;
  }
  .tintas span {
    flex: 1;
    height: 100%;
    box-shadow: inset 0 1.5px 0 rgb(255 255 255 / 0.35), inset 0 -1.5px 0 rgb(0 0 0 / 0.25);
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
