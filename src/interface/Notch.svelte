<script lang="ts">
  import { onMount } from 'svelte';
  import { desktop } from './desktop';
  import { definicoes } from './definicoes.svelte';
  import { PERFIL_OMISSAO } from '../mascote/personalizacao';
  import Mascote from './Mascote.svelte';
  import type { EstadoMascote } from '../mascote/expressoes';
  import { alvoDaBarra } from './barra-notch';

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

  // --- a sequência de entrada: uma barra fina enche-se à medida que a análise avança, e a mascote vai lá dentro, na ponta
  /** null = a janelinha de sempre; 'encher' = a barra a encher (enquanto a janela principal analisa); 'concluir' = a barra fecha */
  let fase = $state<'encher' | 'concluir' | null>(null);
  /** O que a mascote faz: analisa (a empurrar a barra) e fica contente (a barra chegou ao fim) */
  let passo = $state<'analisa' | 'feliz'>('analisa');
  const caraSeq = $derived<EstadoMascote>(passo === 'analisa' ? 'analisa' : 'orgulhosa');
  /** Na sequência a mascote vem sem acessórios nem bolas (é pequena, dentro da barra) e na cor dela */
  const perfilSeq = $derived({ ...(definicoes.mascote ?? PERFIL_OMISSAO), acessorio: 'nenhum' as const, bolas: false, visivel: true, animada: true });
  let quadro = 0;
  function limparSequencia() {
    cancelAnimationFrame(quadro);
    rodando = false;
  }

  // O palco tem 440 × 130. A barra fica ao meio da área útil (por baixo da notch física, quando a há).
  const BARRA = { larg: 260, alt: 26 };
  /** A mascote tem este tamanho (largura do desenho) e o corpo ocupa ~83 % dele; fica toda dentro da barra */
  const MASC = 32;
  /** Onde fica o centro do corpo dentro do desenho da mascote (sem cauda): fração da largura e da altura */
  const CENTRO_Y = 0.556;
  /** O corpo, em px, para a ponta da barra nunca o deixar de fora (a barra tem este mínimo quando está vazia) */
  const CORPO = MASC * 0.83;

  /** O progresso real da análise, 0…1 (vem da janela principal) */
  let real = 0;
  let concluindo = false;
  let rodando = false;
  /** O que a barra mostra agora (0…1) */
  let enche = $state(0);
  let barraVisivel = $state(false);
  /** Largura do que está cheio, em px: nunca menos do que o corpo da mascote, que vai lá dentro */
  const cheio = $derived(CORPO + 6 + enche * (BARRA.larg - CORPO - 6));

  function rodar() {
    const t0 = performance.now();
    let ultimo = t0;
    rodando = true;
    const f = (agora: number) => {
      if (!rodando) return;
      const t = (agora - t0) / 1000;
      const dt = Math.min(0.05, (agora - ultimo) / 1000);
      ultimo = agora;
      // a barra espera um instante (a janelinha ainda está a crescer) e aparece
      if (t > 0.18 && !barraVisivel) barraVisivel = true;
      if (barraVisivel) {
        const alvo = alvoDaBarra(real, t - 0.18, concluindo);
        enche += (alvo - enche) * (1 - Math.exp(-dt * (concluindo ? 9 : 4.5)));
        // a barra chegou ao fim: a mascote fica contente
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
    if (f === 'encher') {
      limparSequencia();
      fase = 'encher';
      passo = 'analisa';
      enche = 0;
      real = 0;
      concluindo = false;
      barraVisivel = false;
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
      <!-- uma barra fina, ao meio; a mascote vai lá dentro, na ponta do que já está cheio -->
      <div class="centro" class:com-notch={temNotch}>
        <div class="barra" class:visivel={barraVisivel} style:width="{BARRA.larg}px" style:height="{BARRA.alt}px" role="progressbar" aria-label="A analisar o PDF" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(enche * 100)}>
          <div class="enche" style:width="{cheio}px"></div>
          <div class="corpo" class:pop={passo === 'feliz'} style:left="{cheio - CORPO / 2 - MASC / 2 - 1}px" style:width="{MASC}px" style:top="{BARRA.alt / 2 - CENTRO_Y * ((MASC * 252) / 212)}px">
            <Mascote tamanho={MASC} estado={caraSeq} perfil={perfilSeq} seguir={false} interativa={false} configuravel={false} titulo="A mascote" />
          </div>
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
    transition: background 0.5s;
  }
  .palco:not(.com-notch) {
    border-radius: 30px;
    border-top: 1px solid rgb(255 255 255 / 0.08);
  }
  .palco.fim {
    background: radial-gradient(70% 120% at 50% 55%, #0d1217 0%, #000 80%);
  }
  @keyframes cresce-palco {
    from {
      width: 360px;
      height: 100px;
      margin-left: auto;
      margin-right: auto;
    }
  }
  /* o meio da área útil: por baixo da notch física quando a há */
  .centro {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }
  .centro.com-notch {
    top: 38px;
  }

  /* a barra: um trilho discreto que se enche de cor, devagar; a mascote vai lá dentro, na ponta */
  .barra {
    position: relative;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.07);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.09);
    opacity: 0;
    transform: scaleX(0.82);
    transition: opacity 0.45s ease, transform 0.6s cubic-bezier(0.2, 0.9, 0.25, 1);
  }
  .barra.visivel {
    opacity: 1;
    transform: none;
  }
  /* o cheio: as três tintas de cor (ciano, magenta, amarelo) num degradé suave, fixo à barra toda, por isso a cor
     revela-se à medida que enche em vez de se esticar */
  .enche {
    position: absolute;
    left: 2px;
    top: 2px;
    bottom: 2px;
    border-radius: 999px;
    background: linear-gradient(90deg, #3cc4f4 0%, #f05aaa 52%, #ffd84d 100%) left center / 256px 100% no-repeat;
    box-shadow: 0 0 14px rgb(94 224 255 / 0.18), inset 0 1px 0 rgb(255 255 255 / 0.35);
  }
  /* a mascote: o corpo cabe dentro do cheio; a posição vem do script */
  .corpo {
    position: absolute;
    z-index: 2;
    pointer-events: none;
  }
  .corpo.pop {
    animation: pop 0.55s cubic-bezier(0.2, 1.3, 0.4, 1) both;
    transform-origin: 50% 70%;
  }
  @keyframes pop {
    0% {
      transform: scale(1.25, 0.82);
    }
    45% {
      transform: scale(0.94, 1.12);
    }
    100% {
      transform: scale(1, 1);
    }
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
