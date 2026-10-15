<script lang="ts">
  import { untrack } from 'svelte';
  import type { PDFDocumentProxy, PageViewport, RenderTask } from 'pdfjs-dist';
  import type { Caixa } from '../analise/caixas';
  import type { PaginaInfo } from '../analise/documento';
  import { definicoes } from './definicoes.svelte';

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

  interface Props {
    doc: PDFDocumentProxy;
    pagina: number;
    total: number;
    info: PaginaInfo;
    marcas?: Marca[];
    foco?: Foco | null;
  }
  let { doc, pagina = $bindable(), total, info, marcas = [], foco = null }: Props = $props();

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
  let geracao = 0;

  const percentagem = $derived(Math.round((escalaAtual / CSS_POR_PT) * 100));

  $effect(() => {
    // dependências lidas de forma síncrona
    const d = doc;
    const p = pagina;
    const m = modo;
    const w = larguraArea;
    const h = alturaArea;
    void redesenhar;
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

    const t = pg.render({
      canvas,
      canvasContext: ctx,
      viewport: vp,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
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

    <div class="grupo legenda">
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
    <div class="folha" bind:this={folha}>
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

<style>
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
