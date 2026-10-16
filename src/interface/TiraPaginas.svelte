<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import type { DocumentoInfo } from '../analise/documento';

  interface Contagem {
    erro: number;
    aviso: number;
    info: number;
  }
  interface Props {
    doc: PDFDocumentProxy;
    info: DocumentoInfo;
    pagina: number;
    /** Alertas de cada página (índice 0-based) */
    contagens: Record<number, Contagem>;
  }
  let { doc, info, pagina = $bindable(), contagens }: Props = $props();

  const LARGURA = 72;
  let lista: HTMLDivElement;
  let observador: IntersectionObserver | undefined;
  /** Páginas já desenhadas (por documento) */
  let feitas = new WeakMap<PDFDocumentProxy, Set<number>>();
  let fila: Promise<void> = Promise.resolve();
  let geracao = 0;

  /** Proporção de cada página, para a miniatura ter já a altura certa antes de desenhar */
  const proporcao = (i: number) => {
    const p = info.paginas[i];
    return p && p.larguraMm > 0 ? p.alturaMm / p.larguraMm : 1.414;
  };

  function desenhar(canvas: HTMLCanvasElement, i: number) {
    const d = doc;
    const minha = geracao;
    const set = feitas.get(d) ?? feitas.set(d, new Set()).get(d)!;
    if (set.has(i)) return;
    set.add(i);
    // uma de cada vez: um livro com centenas de páginas não pode pedir tudo ao pdf.js de uma vez
    fila = fila.then(async () => {
      if (minha !== geracao) return;
      try {
        const pg = await d.getPage(i + 1);
        const dpr = window.devicePixelRatio || 1;
        const base = pg.getViewport({ scale: 1 });
        const vp = pg.getViewport({ scale: (LARGURA * dpr) / base.width });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await pg.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
        pg.cleanup();
      } catch {
        set.delete(i); // volta a tentar quando reaparecer
      }
    });
  }

  /** Desenha a miniatura quando aparece no ecrã */
  function lazy(no: HTMLElement, i: number) {
    const canvas = no.querySelector('canvas')!;
    (no as HTMLElement & { _desenhar?: () => void })._desenhar = () => desenhar(canvas, i);
    observador ??= new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) if (e.isIntersecting) (e.target as HTMLElement & { _desenhar?: () => void })._desenhar?.();
      },
      { root: lista, rootMargin: '300px 0px' },
    );
    observador.observe(no);
    return { destroy: () => observador?.unobserve(no) };
  }

  // outro documento: recomeça
  $effect(() => {
    void doc;
    geracao++;
    fila = Promise.resolve();
  });

  // a página atual fica sempre à vista
  $effect(() => {
    const p = pagina;
    requestAnimationFrame(() => lista?.querySelector<HTMLElement>(`[data-pagina="${p}"]`)?.scrollIntoView({ block: 'nearest' }));
  });

  onDestroy(() => {
    geracao++;
    observador?.disconnect();
  });

  function aoTeclar(ev: KeyboardEvent) {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      pagina = Math.min(info.paginas.length - 1, Math.max(0, pagina + (ev.key === 'ArrowDown' ? 1 : -1)));
    }
  }
</script>

<nav class="tira" aria-label="Páginas">
  <div class="lista" bind:this={lista} role="listbox" tabindex="-1" onkeydown={aoTeclar}>
    {#each info.paginas as _, i (i)}
      {@const c = contagens[i]}
      <button
        class="pagina"
        class:atual={pagina === i}
        data-pagina={i}
        role="option"
        aria-selected={pagina === i}
        aria-label={`Página ${i + 1}${c?.erro ? `, ${c.erro} erros` : ''}${c?.aviso ? `, ${c.aviso} avisos` : ''}`}
        onclick={() => (pagina = i)}
        use:lazy={i}
      >
        <span class="folha" style:aspect-ratio={`1 / ${proporcao(i)}`}>
          <canvas></canvas>
          {#if c && (c.erro || c.aviso || c.info)}
            <span class="selo" class:erro={c.erro > 0} class:aviso={!c.erro && c.aviso > 0} class:info={!c.erro && !c.aviso}>
              {c.erro || c.aviso || c.info}
            </span>
          {/if}
        </span>
        <span class="n">{i + 1}</span>
      </button>
    {/each}
  </div>
</nav>

<style>
  .tira {
    background: var(--superficie);
    border-right: 1px solid var(--borda);
    min-height: 0;
    display: grid;
  }
  .lista {
    overflow-y: auto;
    padding: 10px 0;
    display: grid;
    gap: 10px;
    justify-items: center;
    align-content: start;
  }
  .pagina {
    all: unset;
    cursor: pointer;
    display: grid;
    gap: 3px;
    justify-items: center;
    width: 84px;
    padding: 5px 0 3px;
    border-radius: 8px;
    box-sizing: border-box;
  }
  .pagina:hover {
    background: var(--superficie-2);
  }
  .pagina:focus-visible {
    outline: 2px solid var(--acento);
  }
  .pagina.atual {
    background: var(--info-fundo);
    box-shadow: inset 0 0 0 2px var(--acento);
  }
  .folha {
    position: relative;
    width: 72px;
    background: #fff;
    box-shadow: 0 0 0 1px var(--borda), 0 1px 3px rgb(0 0 0 / 0.15);
    display: block;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .selo {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    box-sizing: border-box;
    border-radius: 9px;
    font-size: 10px;
    font-weight: 700;
    line-height: 17px;
    text-align: center;
    color: #fff;
    border: 1.5px solid var(--superficie);
  }
  .selo.erro {
    background: var(--erro);
  }
  .selo.aviso {
    background: #e08a00;
  }
  .selo.info {
    background: var(--info);
  }
  .n {
    font-size: 11px;
    color: var(--texto-2);
    font-variant-numeric: tabular-nums;
  }
  .pagina.atual .n {
    color: var(--acento);
    font-weight: 700;
  }
</style>
