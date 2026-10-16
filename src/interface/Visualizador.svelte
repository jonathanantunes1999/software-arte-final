<script lang="ts">
  import { untrack } from 'svelte';
  import type { PDFDocumentProxy, PageViewport, RenderTask } from 'pdfjs-dist';
  import type { Caixa } from '../analise/caixas';
  import type { PaginaInfo } from '../analise/documento';
  import { lerToque, objetosEm, type Leitura } from '../analise/inspecao';
  import type { PaginaIR } from '../analise/ir';
  import { definicoes } from './definicoes.svelte';
  import { idLayerPdfjs } from './pdf';
  import LeitorCor from './LeitorCor.svelte';
  import { canalCinzento, compor, temTinta } from '../separacoes/compor';
  import { diferenca, pixeisNormais, pixeisSeparados, type Pixeis } from './comparar';
  import type { Placa } from '../separacoes/placas';

  /** Sítio de um alerta a desenhar por cima da página */
  interface Marca {
    caixa: Caixa;
    /** O local em foco (os outros do mesmo alerta aparecem mais discretos) */
    ativa: boolean;
  }
  /** Pedido de zoom para um local. `versao` muda a cada pedido, mesmo para o mesmo sítio. */
  interface Foco {
    pagina: number;
    caixa: Caixa;
    versao: number;
  }

  /** PDF com as placas da página (uma página por placa) para mostrar em vez da página */
  interface Separacao {
    doc: PDFDocumentProxy;
    placas: Placa[];
    /** Muda a cada separação nova */
    chave: string;
  }

  interface Props {
    doc: PDFDocumentProxy;
    pagina: number;
    total: number;
    info: PaginaInfo;
    marcas?: Marca[];
    foco?: Foco | null;
    /** Página interpretada com contornos, para o leitor de cor */
    inspecao?: PaginaIR | null;
    /** Layers ligadas (true) ou desligadas (false) pelo utilizador, por etiqueta */
    sobreposicoes?: Record<string, boolean>;
    separacao?: Separacao | null;
    /** Placas escondidas pelo utilizador (id → true) */
    escondidas?: Record<string, boolean>;
    /** Diz quais as placas sem tinta, depois de desenhadas */
    aoMedirPlacas?(chave: string, vazias: string[]): void;
    /** Mostra a cópia corrigida ao lado do original: antes, depois ou só o que mudou */
    comparar?: { doc: PDFDocumentProxy; separacao: Separacao | null } | null;
    modoComparacao?: 'antes' | 'depois' | 'diferenca';
    aoSairComparacao?(): void;
  }
  let {
    doc,
    pagina = $bindable(),
    total,
    info,
    marcas = [],
    foco = null,
    inspecao = null,
    sobreposicoes = {},
    separacao = null,
    escondidas = {},
    aoMedirPlacas,
    comparar = null,
    modoComparacao = $bindable('diferenca'),
    aoSairComparacao,
  }: Props = $props();

  type Modo = 'pagina' | 'largura' | number;
  const CSS_POR_PT = 96 / 72;
  const MARGEM = 32;

  let modo = $state<Modo>('pagina');
  let escalaAtual = $state(1);
  let larguraArea = $state(0);
  let alturaArea = $state(0);
  let canvas: HTMLCanvasElement;
  let area: HTMLDivElement;
  let folha: HTMLDivElement;
  /** Incrementa para obrigar a redesenhar (mesmo zoom, mesma página) quando há um foco a aplicar */
  let redesenhar = $state(0);
  let pendente: Foco | null = null;
  let viewport = $state.raw<PageViewport | null>(null);
  let tarefa: RenderTask | null = null;
  let tarefasPlacas: RenderTask[] = [];
  let geracao = 0;
  /** Placas desenhadas (um byte por pixel), à espera de serem compostas */
  let placasPixeis = $state.raw<{ chave: string; largura: number; altura: number; dados: Uint8Array[] } | null>(null);

  const percentagem = $derived(Math.round((escalaAtual / CSS_POR_PT) * 100));

  $effect(() => {
    // dependências lidas de forma síncrona
    const d = doc;
    const p = pagina;
    const m = modo;
    const w = larguraArea;
    const h = alturaArea;
    void redesenhar;
    void JSON.stringify(sobreposicoes);
    void separacao?.chave;
    if (comparar) {
      void comparar.doc;
      void comparar.separacao?.chave;
      void JSON.stringify(escondidas);
    }
    if (!w || !h) return;
    desenhar(d, p, m, w, h);
  });

  async function desenhar(d: PDFDocumentProxy, p: number, m: Modo, w: number, h: number) {
    const minha = ++geracao;
    tarefa?.cancel();
    const pg = await d.getPage(p + 1);
    if (minha !== geracao) return;

    const base = pg.getViewport({ scale: 1 });
    let escala: number;
    if (m === 'pagina') escala = Math.min((w - MARGEM) / base.width, (h - MARGEM) / base.height);
    else if (m === 'largura') escala = (w - MARGEM) / base.width;
    else escala = m * CSS_POR_PT;
    escala = Math.min(Math.max(escala, 0.05), 10);

    const vp = pg.getViewport({ scale: escala });
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = `${vp.width}px`;
    canvas.style.height = `${vp.height}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    escalaAtual = escala;
    viewport = vp;

    if (comparar) {
      tarefa = null;
      placasPixeis = null;
      await desenharComparacao(d, p, escala, dpr, minha);
      if (minha === geracao && pendente && pendente.pagina === p) {
        rolarPara(pendente.caixa, vp);
        pendente = null;
      }
      return;
    }

    // as placas só valem para a página para que foram montadas; enquanto não chegam mostra-se a página
    const sep = separacao && separacao.chave.split(':')[0] === String(p) ? separacao : null;
    if (sep) {
      tarefa = null;
      await desenharPlacas(sep, escala, dpr, minha, vp);
      if (minha === geracao && pendente && pendente.pagina === p) {
        rolarPara(pendente.caixa, vp);
        pendente = null;
      }
      return;
    }
    placasPixeis = null;

    // layers: cada render leva uma configuração própria, com o que o utilizador ligou ou desligou
    const layers = await d.getOptionalContentConfig();
    for (const [tag, visivel] of Object.entries(sobreposicoes)) {
      const id = idLayerPdfjs(tag);
      if (layers.getGroup(id)) layers.setVisibility(id, visivel);
    }
    if (minha !== geracao) return;

    const t = pg.render({
      canvas,
      canvasContext: ctx,
      viewport: vp,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      optionalContentConfigPromise: Promise.resolve(layers),
    });
    tarefa = t;
    try {
      await t.promise;
    } catch (e) {
      if ((e as Error).name !== 'RenderingCancelledException') console.error(e);
      return;
    }
    if (minha === geracao && pendente && pendente.pagina === p) {
      rolarPara(pendente.caixa, vp);
      pendente = null;
    }
  }

  // --- comparação antes/depois: os dois renders ficam em memória e só se recompõe quando muda o modo
  let renders = $state.raw<{ chave: string; a: Pixeis; b: Pixeis } | null>(null);
  let diff = $state<{ mudados: number; total: number } | null>(null);

  async function desenharComparacao(d: PDFDocumentProxy, p: number, escala: number, dpr: number, minha: number) {
    const daPagina = (s: Separacao | null | undefined) => (s && s.chave.split(':')[0] === String(p) ? s : null);
    const sepA = daPagina(separacao);
    const sepB = daPagina(comparar!.separacao);
    const comPlacas = !!sepA && !!sepB;
    const chave = [p, escala, dpr, comPlacas ? `${sepA!.chave}|${sepB!.chave}` : 'normal', JSON.stringify(sobreposicoes), JSON.stringify(escondidas), comparar!.doc.fingerprints?.[0] ?? ''].join('#');
    if (!renders || renders.chave !== chave) {
      const cancelado = () => minha !== geracao;
      const a = comPlacas ? await pixeisSeparados(sepA!, escala, dpr, escondidas, cancelado) : await pixeisNormais(d, p, escala, dpr, sobreposicoes, cancelado);
      if (!a || cancelado()) return;
      const b = comPlacas ? await pixeisSeparados(sepB!, escala, dpr, escondidas, cancelado) : await pixeisNormais(comparar!.doc, p, escala, dpr, sobreposicoes, cancelado);
      if (!b || cancelado()) return;
      renders = { chave, a, b };
      const r = diferenca(a, b);
      diff = { mudados: r.mudados, total: r.total };
    }
    if (minha !== geracao || !renders) return;
    const { a, b } = renders;
    const saida = modoComparacao === 'antes' ? a : modoComparacao === 'depois' ? b : diferenca(a, b).pixeis;
    canvas.getContext('2d')!.putImageData(new ImageData(saida.dados as Uint8ClampedArray<ArrayBuffer>, saida.largura, saida.altura), 0, 0);
  }

  /** Desenha cada placa à parte (em cinzento) e guarda os pixeis; a composição faz-se noutro sítio */
  async function desenharPlacas(sep: Separacao, escala: number, dpr: number, minha: number, vp: PageViewport) {
    for (const t of tarefasPlacas) t.cancel();
    tarefasPlacas = [];
    const largura = Math.floor(vp.width * dpr);
    const altura = Math.floor(vp.height * dpr);
    const dados: Uint8Array[] = [];
    const vazias: string[] = [];
    const tela = document.createElement('canvas');
    tela.width = largura;
    tela.height = altura;
    const c2 = tela.getContext('2d', { willReadFrequently: true })!;
    for (let k = 0; k < sep.placas.length; k++) {
      const pg = await sep.doc.getPage(k + 1);
      if (minha !== geracao) return;
      c2.fillStyle = '#ffffff';
      c2.fillRect(0, 0, largura, altura);
      const t = pg.render({
        canvas: tela,
        canvasContext: c2,
        viewport: pg.getViewport({ scale: escala }),
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        annotationMode: 0,
      });
      tarefasPlacas.push(t);
      try {
        await t.promise;
      } catch (e) {
        if ((e as Error).name !== 'RenderingCancelledException') console.error(e);
        return;
      }
      if (minha !== geracao) return;
      const cinza = canalCinzento(c2.getImageData(0, 0, largura, altura).data);
      if (!temTinta(cinza)) vazias.push(sep.placas[k].id);
      dados.push(cinza);
    }
    if (minha !== geracao) return;
    placasPixeis = { chave: sep.chave, largura, altura, dados };
    aoMedirPlacas?.(sep.chave, vazias);
  }

  // junta as placas visíveis no ecrã, sem voltar a desenhá-las
  $effect(() => {
    const px = placasPixeis;
    const sep = separacao;
    const escondidasAgora = escondidas;
    if (!px || !sep || px.chave !== sep.chave) return;
    const visiveis = sep.placas.map((p, i) => ({ p, i })).filter(({ p }) => !escondidasAgora[p.id]);
    const saida = compor(visiveis.map(({ p, i }) => ({ dados: px.dados[i], cor: p.rgb })), px.largura, px.altura);
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(new ImageData(saida as Uint8ClampedArray<ArrayBuffer>, px.largura, px.altura), 0, 0);
  });

  // --- zoom para o local de um alerta
  $effect(() => {
    const versao = foco?.versao;
    if (versao === undefined) return;
    untrack(() => void prepararFoco(foco!));
  });

  async function prepararFoco(f: Foco) {
    pendente = f;
    const pg = await doc.getPage(f.pagina + 1);
    if (pendente !== f) return;
    const base = pg.getViewport({ scale: 1 });
    const [ax, ay] = base.convertToViewportPoint(f.caixa.x0, f.caixa.y0);
    const [bx, by] = base.convertToViewportPoint(f.caixa.x1, f.caixa.y1);
    const rw = Math.abs(bx - ax);
    const rh = Math.abs(by - ay);
    // folga em redor: metade da região, no mínimo 40 pt
    const folga = Math.max(40, Math.max(rw, rh) * 0.5);
    const daRegiao = Math.min((larguraArea - MARGEM) / (rw + 2 * folga), (alturaArea - MARGEM) / (rh + 2 * folga));
    const daPagina = Math.min((larguraArea - MARGEM) / base.width, (alturaArea - MARGEM) / base.height);
    // nunca menos que a página inteira
    const escala = Math.min(Math.max(daRegiao, daPagina, 0.05), 10);
    modo = escala / CSS_POR_PT;
    redesenhar++;
  }

  function rolarPara(c: Caixa, vp: PageViewport) {
    if (!area || !folha) return;
    const r = retangulo(c, vp);
    const f = folha.getBoundingClientRect();
    const a = area.getBoundingClientRect();
    area.scrollLeft += f.left + r.x + r.largura / 2 - (a.left + a.width / 2);
    area.scrollTop += f.top + r.y + r.altura / 2 - (a.top + a.height / 2);
  }

  function retangulo(c: Caixa, vp: PageViewport) {
    const [a, b] = vp.convertToViewportPoint(c.x0, c.y0);
    const [x, y] = vp.convertToViewportPoint(c.x1, c.y1);
    return { x: Math.min(a, x), y: Math.min(b, y), largura: Math.abs(x - a), altura: Math.abs(y - b) };
  }

  const caixas = $derived(viewport ? { trim: retangulo(info.trim, viewport), bleed: retangulo(info.bleed, viewport) } : null);
  const destaques = $derived(
    viewport ? marcas.map((m) => ({ ...retangulo(m.caixa, viewport!), ativa: m.ativa })) : [],
  );
  const temBleed = $derived(info.origemSangria === 'BleedBox');
  const temTrim = $derived(info.origemTrim === 'TrimBox');

  // --- leitor de cor: o que está debaixo do cursor
  let rato = $state<{ x: number; y: number; px: number; py: number } | null>(null);
  let quadro = 0;

  function aoMoverRato(ev: PointerEvent) {
    if (!definicoes.mostrarLeitor) return;
    const { clientX, clientY } = ev;
    cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(() => {
      if (!viewport) return;
      const r = canvas.getBoundingClientRect();
      const [px, py] = viewport.convertToPdfPoint(clientX - r.left, clientY - r.top);
      rato = { x: clientX, y: clientY, px, py };
    });
  }
  function aoSairRato() {
    cancelAnimationFrame(quadro);
    rato = null;
  }

  const leituras = $derived.by((): { lista: Leitura[]; camada?: string } | null => {
    if (!rato || !inspecao || !definicoes.mostrarLeitor) return null;
    // 3 px de ecrã de tolerância, para apanhar linhas finas
    const toques = objetosEm(inspecao.eventos, rato.px, rato.py, 3 / escalaAtual, 4);
    return { lista: toques.map(lerToque), camada: toques[0]?.evento.camada };
  });

  function ir(delta: number) {
    pagina = Math.min(Math.max(pagina + delta, 0), total - 1);
  }

  function zoomPara(novo: number) {
    modo = Math.min(Math.max(novo, 5), 1000) / 100;
  }

  function aoRato(ev: WheelEvent) {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    zoomPara(percentagem * (ev.deltaY < 0 ? 1.1 : 1 / 1.1));
  }

  function aoTeclado(ev: KeyboardEvent) {
    const alvo = ev.target as HTMLElement;
    if (alvo.tagName === 'INPUT' || alvo.tagName === 'SELECT') return;
    if (ev.key === 'ArrowRight' || ev.key === 'PageDown') ir(1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') ir(-1);
    else if ((ev.ctrlKey || ev.metaKey) && (ev.key === '+' || ev.key === '=')) {
      ev.preventDefault();
      zoomPara(percentagem * 1.25);
    } else if ((ev.ctrlKey || ev.metaKey) && ev.key === '-') {
      ev.preventDefault();
      zoomPara(percentagem / 1.25);
    } else if ((ev.ctrlKey || ev.metaKey) && ev.key === '0') {
      ev.preventDefault();
      modo = 'pagina';
    }
  }

  function aoMudarPagina(ev: Event) {
    const n = parseInt((ev.currentTarget as HTMLInputElement).value, 10);
    if (Number.isFinite(n)) pagina = Math.min(Math.max(n - 1, 0), total - 1);
    (ev.currentTarget as HTMLInputElement).value = String(pagina + 1);
  }
</script>

<svelte:window onkeydown={aoTeclado} />

<div class="visualizador">
  <div class="barra">
    <div class="grupo">
      <button class="icone" onclick={() => ir(-1)} disabled={pagina === 0} aria-label="Página anterior" title="Página anterior (←)">‹</button>
      <label class="pagina">
        <input type="text" inputmode="numeric" value={pagina + 1} onchange={aoMudarPagina} aria-label="Número da página" />
        <span>/ {total}</span>
      </label>
      <button class="icone" onclick={() => ir(1)} disabled={pagina >= total - 1} aria-label="Página seguinte" title="Página seguinte (→)">›</button>
    </div>

    <div class="grupo">
      <button class="icone" onclick={() => zoomPara(percentagem / 1.25)} aria-label="Reduzir" title="Reduzir (Ctrl −)">−</button>
      <span class="zoom" aria-live="polite">{percentagem}%</span>
      <button class="icone" onclick={() => zoomPara(percentagem * 1.25)} aria-label="Ampliar" title="Ampliar (Ctrl +)">+</button>
      <button onclick={() => (modo = 'pagina')} class:ativo={modo === 'pagina'} title="Ajustar à página (Ctrl 0)">Página</button>
      <button onclick={() => (modo = 'largura')} class:ativo={modo === 'largura'}>Largura</button>
      <button onclick={() => zoomPara(100)}>100%</button>
    </div>

    {#if comparar}
      <div class="grupo">
        {#each [['antes', 'Antes'], ['depois', 'Depois'], ['diferenca', 'Diferença']] as [id, nomeModo] (id)}
          <button class:ativo={modoComparacao === id} onclick={() => (modoComparacao = id as typeof modoComparacao)}>{nomeModo}</button>
        {/each}
        {#if diff}
          <span class="mudou" title="Pixeis que mudaram entre o original e a cópia corrigida">
            {diff.mudados === 0 ? 'sem diferenças' : `${((diff.mudados / diff.total) * 100).toFixed(diff.mudados / diff.total < 0.01 ? 2 : 1).replace('.', ',')}% mudou`}
          </span>
        {/if}
        <button onclick={() => aoSairComparacao?.()}>Sair</button>
      </div>
    {/if}
    <div class="grupo legenda">
      <label class="interruptor" title="Mostra a cor e o overprint do objeto debaixo do cursor">
        <input type="checkbox" bind:checked={definicoes.mostrarLeitor} />
        Leitor de cor
      </label>
      <label class="interruptor">
        <input type="checkbox" bind:checked={definicoes.mostrarCaixas} />
        Mostrar corte e sangria
      </label>
      {#if definicoes.mostrarCaixas}
        <span class="chave trim" title={temTrim ? 'TrimBox' : 'Sem TrimBox: a linha de corte é a página'}>Corte</span>
        {#if temBleed}<span class="chave bleed">Sangria</span>{/if}
      {/if}
    </div>
  </div>

  <div class="area" bind:this={area} bind:clientWidth={larguraArea} bind:clientHeight={alturaArea} onwheel={aoRato}>
    <!-- o leitor de cor só faz sentido com rato; não há equivalente de teclado para "o que está debaixo do cursor" -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="folha" bind:this={folha} class:com-leitor={definicoes.mostrarLeitor} onpointermove={aoMoverRato} onpointerleave={aoSairRato}>
      <canvas bind:this={canvas}></canvas>
      {#if destaques.length && viewport}
        <svg class="destaques" width={viewport.width} height={viewport.height} aria-hidden="true">
          {#each destaques as d, i (i)}
            <rect
              class="marca"
              class:ativa={d.ativa}
              x={d.x - 3}
              y={d.y - 3}
              width={Math.max(d.largura, 4) + 6}
              height={Math.max(d.altura, 4) + 6}
              rx="3"
            />
          {/each}
        </svg>
      {/if}
      {#if definicoes.mostrarCaixas && caixas && viewport}
        <svg width={viewport.width} height={viewport.height} aria-hidden="true">
          {#if temBleed}
            <rect class="bleed" x={caixas.bleed.x} y={caixas.bleed.y} width={caixas.bleed.largura} height={caixas.bleed.altura} />
          {/if}
          <rect class="trim" x={caixas.trim.x} y={caixas.trim.y} width={caixas.trim.largura} height={caixas.trim.altura} />
        </svg>
      {/if}
    </div>
  </div>
</div>

{#if rato && leituras}
  <LeitorCor leituras={leituras.lista} camada={leituras.camada} x={rato.x} y={rato.y} />
{/if}

<style>
  .folha.com-leitor {
    cursor: crosshair;
  }
  .visualizador {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100%;
    min-height: 0;
  }
  .barra {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 20px;
    padding: 6px 12px;
    background: var(--superficie);
    border-bottom: 1px solid var(--borda);
  }
  .grupo {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .grupo.legenda {
    margin-left: auto;
    gap: 10px;
  }
  .pagina {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--texto-2);
  }
  .pagina input {
    width: 44px;
    text-align: center;
  }
  .mudou {
    font-size: 12px;
    color: var(--texto-2);
    font-variant-numeric: tabular-nums;
  }
  .zoom {
    min-width: 46px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  button.ativo {
    background: var(--info-fundo);
    border-color: var(--acento);
    color: var(--info);
  }
  .interruptor {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
  }
  .chave {
    font-size: 12px;
    font-weight: 600;
    padding-left: 18px;
    position: relative;
  }
  .chave::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    width: 13px;
    border-top: 2px solid;
  }
  .chave.trim::before {
    border-color: var(--caixa-trim);
  }
  .chave.bleed::before {
    border-color: var(--caixa-bleed);
    border-top-style: dashed;
  }
  .area {
    overflow: auto;
    display: grid;
    min-height: 0;
    padding: 16px;
  }
  .folha {
    position: relative;
    margin: auto;
    line-height: 0;
    box-shadow: var(--sombra);
    background: #fff;
  }
  canvas {
    display: block;
  }
  svg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
  }
  rect {
    fill: none;
    vector-effect: non-scaling-stroke;
  }
  rect.trim {
    stroke: var(--caixa-trim);
    stroke-width: 1.5;
  }
  rect.bleed {
    stroke: var(--caixa-bleed);
    stroke-width: 1.5;
    stroke-dasharray: 6 4;
  }
  rect.marca {
    stroke: var(--destaque);
    stroke-width: 2;
    fill: color-mix(in srgb, var(--destaque) 12%, transparent);
    opacity: 0.55;
  }
  rect.marca.ativa {
    opacity: 1;
    stroke-width: 3;
    fill: color-mix(in srgb, var(--destaque) 22%, transparent);
    animation: pulsar 0.9s ease-in-out 3;
  }
  @keyframes pulsar {
    50% {
      stroke-width: 6;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    rect.marca.ativa {
      animation: none;
    }
  }
</style>
