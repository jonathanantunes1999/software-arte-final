<script lang="ts">
  import type { PageViewport } from 'pdfjs-dist';
  import type { Caixa } from '../analise/caixas';
  import { mmParaPt } from '../comum/unidades';
  import { objetoEm, type ObjetoVivo } from '../edicao/estado';
  import { ehIdentidade, matrizParaCaixa, translacao } from '../edicao/matriz';
  import type { Edicao } from '../edicao/tipos';

  /**
   * A camada de edição por cima da página: clicar num objeto seleciona-o; arrastá-lo move-o; as alças mudam-lhe o tamanho
   * (Shift mantém a proporção, Alt é a partir do centro); as setas empurram (Shift: 1 mm, senão 0,1 mm); Delete apaga.
   * Não altera nada: só diz ao pai o que se quer fazer (`onedicao`), e o pai refaz a cópia e volta a desenhar.
   * Tudo se calcula no ecrã (px) e converte-se para a página só no fim, por isso a página rodada não dá trabalho.
   */
  interface Props {
    viewport: PageViewport;
    objetos: ObjetoVivo[];
    selecionado: number | null;
    pagina: number;
    aFrente: boolean;
    onselecionar(id: number | null): void;
    onedicao(e: Edicao): void;
  }
  let { viewport, objetos, selecionado, pagina, aFrente, onselecionar, onedicao }: Props = $props();

  interface Retangulo {
    x: number;
    y: number;
    w: number;
    h: number;
  }
  type Alca = { nx: -1 | 0 | 1; ny: -1 | 0 | 1 };

  let svg: SVGSVGElement;
  let hover = $state<number | null>(null);
  let cursor = $state('default');
  /** O que se está a arrastar: mover o objeto ou mudar-lhe o tamanho por uma alça */
  let arrasto = $state<{ id: number; alca: Alca | null; x0: number; y0: number; inicio: Retangulo; atual: Retangulo; moveu: boolean } | null>(null);

  const escala = $derived(viewport.scale);
  const sel = $derived(selecionado === null ? null : (objetos.find((o) => o.id === selecionado && !o.apagado) ?? null));

  const paraEcra = (c: Caixa): Retangulo => {
    const [ax, ay] = viewport.convertToViewportPoint(c.x0, c.y0);
    const [bx, by] = viewport.convertToViewportPoint(c.x1, c.y1);
    return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
  };
  const paraPagina = (r: Retangulo): Caixa => {
    const [ax, ay] = viewport.convertToPdfPoint(r.x, r.y);
    const [bx, by] = viewport.convertToPdfPoint(r.x + r.w, r.y + r.h);
    return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
  };
  const posicao = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  const ALCA = 9;
  const ALCAS: Alca[] = [
    { nx: -1, ny: -1 },
    { nx: 0, ny: -1 },
    { nx: 1, ny: -1 },
    { nx: 1, ny: 0 },
    { nx: 1, ny: 1 },
    { nx: 0, ny: 1 },
    { nx: -1, ny: 1 },
    { nx: -1, ny: 0 },
  ];
  const centroDaAlca = (r: Retangulo, a: Alca) => ({ x: r.x + ((a.nx + 1) / 2) * r.w, y: r.y + ((a.ny + 1) / 2) * r.h });
  const cursorDaAlca = (a: Alca) => (a.nx === 0 ? 'ns-resize' : a.ny === 0 ? 'ew-resize' : a.nx === a.ny ? 'nwse-resize' : 'nesw-resize');

  function alcaEm(p: { x: number; y: number }, r: Retangulo): Alca | null {
    for (const a of ALCAS) {
      const c = centroDaAlca(r, a);
      if (Math.abs(p.x - c.x) <= ALCA && Math.abs(p.y - c.y) <= ALCA) return a;
    }
    return null;
  }

  const ret = (c: Caixa) => paraEcra(c);
  const selEcra = $derived(sel ? ret(sel.bbox) : null);

  function aoPremir(ev: PointerEvent) {
    if (ev.button !== 0) return;
    const p = posicao(ev);
    if (sel && selEcra) {
      const a = alcaEm(p, selEcra);
      if (a) {
        arrasto = { id: sel.id, alca: a, x0: p.x, y0: p.y, inicio: selEcra, atual: selEcra, moveu: false };
        svg.setPointerCapture(ev.pointerId);
        return;
      }
    }
    const [x, y] = viewport.convertToPdfPoint(p.x, p.y);
    const alvo = objetoEm(objetos, x, y, 6 / escala);
    if (!alvo) {
      onselecionar(null);
      return;
    }
    if (alvo.id !== selecionado) onselecionar(alvo.id);
    const r = ret(alvo.bbox);
    arrasto = { id: alvo.id, alca: null, x0: p.x, y0: p.y, inicio: r, atual: r, moveu: false };
    svg.setPointerCapture(ev.pointerId);
  }

  /** O retângulo novo (em px do ecrã) para o arrasto em curso */
  function novoRetangulo(a: NonNullable<typeof arrasto>, p: { x: number; y: number }, ev: PointerEvent): Retangulo {
    const r = a.inicio;
    if (!a.alca) {
      let dx = p.x - a.x0;
      let dy = p.y - a.y0;
      // Shift: só na horizontal ou só na vertical
      if (ev.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      return { ...r, x: r.x + dx, y: r.y + dy };
    }
    const { nx, ny } = a.alca;
    const MIN = 4;
    const doCentro = ev.altKey;
    let x0 = r.x;
    let x1 = r.x + r.w;
    let y0 = r.y;
    let y1 = r.y + r.h;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    if (nx === -1) x0 = Math.min(p.x, x1 - MIN);
    if (nx === 1) x1 = Math.max(p.x, x0 + MIN);
    if (ny === -1) y0 = Math.min(p.y, y1 - MIN);
    if (ny === 1) y1 = Math.max(p.y, y0 + MIN);
    if (doCentro) {
      // o lado oposto espelha-se em torno do centro
      if (nx === -1) x1 = 2 * cx - x0;
      if (nx === 1) x0 = 2 * cx - x1;
      if (ny === -1) y1 = 2 * cy - y0;
      if (ny === 1) y0 = 2 * cy - y1;
    }
    // Shift nas alças dos cantos: mantém a proporção (manda o lado que mais cresceu)
    if (ev.shiftKey && nx !== 0 && ny !== 0 && r.w > 0 && r.h > 0) {
      const k = Math.max((x1 - x0) / r.w, (y1 - y0) / r.h);
      const w = r.w * k;
      const h = r.h * k;
      if (doCentro) {
        x0 = cx - w / 2;
        x1 = cx + w / 2;
        y0 = cy - h / 2;
        y1 = cy + h / 2;
      } else {
        if (nx === -1) x0 = x1 - w;
        else x1 = x0 + w;
        if (ny === -1) y0 = y1 - h;
        else y1 = y0 + h;
      }
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function aoMover(ev: PointerEvent) {
    const p = posicao(ev);
    if (arrasto) {
      if (!arrasto.moveu && Math.hypot(p.x - arrasto.x0, p.y - arrasto.y0) < 3) return;
      arrasto = { ...arrasto, moveu: true, atual: novoRetangulo(arrasto, p, ev) };
      return;
    }
    const [x, y] = viewport.convertToPdfPoint(p.x, p.y);
    if (sel && selEcra) {
      const a = alcaEm(p, selEcra);
      if (a) {
        cursor = cursorDaAlca(a);
        hover = null;
        return;
      }
    }
    const alvo = objetoEm(objetos, x, y, 6 / escala);
    hover = alvo?.id ?? null;
    cursor = alvo ? (alvo.id === selecionado ? 'move' : 'pointer') : 'default';
  }

  function aoLargar(ev: PointerEvent) {
    const a = arrasto;
    arrasto = null;
    if (svg.hasPointerCapture(ev.pointerId)) svg.releasePointerCapture(ev.pointerId);
    if (!a?.moveu) return;
    const objeto = objetos.find((o) => o.id === a.id);
    if (!objeto) return;
    const m = matrizParaCaixa(objeto.bbox, paraPagina(a.atual));
    if (!ehIdentidade(m, 1e-6)) onedicao({ tipo: 'transformar', pagina, objeto: a.id, matriz: m });
  }

  function aoSair() {
    if (!arrasto) hover = null;
  }

  /** Empurrar com as setas: o passo é em mm, na direção que se vê no ecrã (a página pode estar rodada) */
  function empurrar(ev: KeyboardEvent, id: number) {
    const sx = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    const sy = ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0;
    const passo = mmParaPt(ev.shiftKey ? 1 : 0.1);
    const [x0, y0] = viewport.convertToPdfPoint(0, 0);
    const [x1, y1] = viewport.convertToPdfPoint(sx, sy);
    const d = Math.hypot(x1 - x0, y1 - y0) || 1;
    onedicao({ tipo: 'transformar', pagina, objeto: id, matriz: translacao(((x1 - x0) / d) * passo, ((y1 - y0) / d) * passo) });
  }

  function aoTeclar(ev: KeyboardEvent) {
    if (!aFrente || selecionado === null || !sel) return;
    const alvo = ev.target as HTMLElement;
    if (alvo.tagName === 'INPUT' || alvo.tagName === 'SELECT' || alvo.tagName === 'TEXTAREA') return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      onedicao({ tipo: 'apagar', pagina, objeto: selecionado });
      onselecionar(null);
    } else if (ev.key === 'Escape') {
      onselecionar(null);
    } else if (ev.key.startsWith('Arrow')) {
      ev.preventDefault();
      empurrar(ev, selecionado);
    }
  }

  const alturaDoDesenho = $derived(viewport.height);
</script>

<svelte:window onkeydown={aoTeclar} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
  bind:this={svg}
  class="editor"
  width={viewport.width}
  height={alturaDoDesenho}
  style:cursor={arrasto ? (arrasto.alca ? cursorDaAlca(arrasto.alca) : 'grabbing') : cursor}
  onpointerdown={aoPremir}
  onpointermove={aoMover}
  onpointerup={aoLargar}
  onpointercancel={aoLargar}
  onpointerleave={aoSair}
  role="application"
  aria-label="Edição de objetos: clica num objeto para o selecionar"
>
  {#if hover !== null && hover !== selecionado && !arrasto}
    {@const h = objetos.find((o) => o.id === hover)}
    {#if h}
      {@const r = ret(h.bbox)}
      <rect class="hover" x={r.x} y={r.y} width={r.w} height={r.h} />
    {/if}
  {/if}
  {#if sel && selEcra}
    <rect class="sel" class:fantasma={!!arrasto?.moveu} x={selEcra.x} y={selEcra.y} width={selEcra.w} height={selEcra.h} />
    {#if arrasto?.moveu}
      <rect class="novo" x={arrasto.atual.x} y={arrasto.atual.y} width={arrasto.atual.w} height={arrasto.atual.h} />
    {:else}
      {#each ALCAS as a (`${a.nx}${a.ny}`)}
        {@const c = centroDaAlca(selEcra, a)}
        <rect class="alca" x={c.x - ALCA / 2} y={c.y - ALCA / 2} width={ALCA} height={ALCA} rx="2" />
      {/each}
    {/if}
  {/if}
</svg>

<style>
  .editor {
    position: absolute;
    inset: 0;
    pointer-events: auto !important;
    overflow: visible;
    touch-action: none;
  }
  rect {
    fill: none;
    vector-effect: non-scaling-stroke;
  }
  .hover {
    stroke: var(--acento);
    stroke-width: 1.2;
    opacity: 0.55;
  }
  .sel {
    stroke: var(--acento);
    stroke-width: 1.6;
  }
  .sel.fantasma {
    opacity: 0.35;
    stroke-dasharray: 4 3;
  }
  .novo {
    stroke: var(--acento);
    stroke-width: 1.6;
    stroke-dasharray: 5 3;
    fill: color-mix(in srgb, var(--acento) 12%, transparent);
  }
  .alca {
    fill: #fff;
    stroke: var(--acento);
    stroke-width: 1.5;
  }
</style>
