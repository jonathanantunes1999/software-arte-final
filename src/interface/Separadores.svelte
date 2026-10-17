<script lang="ts">
  import { tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { posicaoAoArrastar, type Separador } from './separadores';

  interface Props {
    separadores: Separador[];
    ativo: number;
    onescolher(id: number): void;
    onfechar(id: number): void;
    onnovo(): void;
    /** Pôs-se o separador `id` na posição `destino` (0 = primeiro) */
    onmover(id: number, destino: number): void;
  }
  let { separadores, ativo, onescolher, onfechar, onnovo, onmover }: Props = $props();

  let barra: HTMLDivElement;
  const els: Record<number, HTMLElement | undefined> = {};

  // --- arrastar para reordenar: o separador segue o rato e os outros afastam-se à medida que ele passa por cima
  /** Carregou-se num separador mas ainda não se mexeu o suficiente para ser um arrasto (um clique não é um arrasto) */
  let premido: { id: number; x0: number; agarra: number; ponteiro: number } | null = null;
  let arrasto = $state<number | null>(null);
  let ultimoX = 0;
  let aPosicionar = false;
  const SEM_ANIMACAO = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /** x do rato dentro da barra (conta com o deslocamento da barra, que pode ter rolado) */
  const xDaBarra = (ev: PointerEvent) => ev.clientX - barra.getBoundingClientRect().left + barra.scrollLeft;

  function premir(ev: PointerEvent, s: Separador) {
    if (ev.button !== 0 || separadores.length < 2) return;
    if ((ev.target as HTMLElement).closest('.fechar')) return;
    const el = ev.currentTarget as HTMLElement;
    premido = { id: s.id, x0: ev.clientX, agarra: xDaBarra(ev) - el.offsetLeft, ponteiro: ev.pointerId };
  }

  function mexer(ev: PointerEvent) {
    if (!premido || ev.pointerId !== premido.ponteiro) return;
    if (arrasto === null) {
      if (Math.abs(ev.clientX - premido.x0) < 5) return;
      arrasto = premido.id;
      els[premido.id]?.setPointerCapture(ev.pointerId);
    }
    // perto das pontas a barra rola, para se poder levar o separador para longe
    const r = barra.getBoundingClientRect();
    if (ev.clientX < r.left + 28) barra.scrollLeft -= 12;
    else if (ev.clientX > r.right - 28) barra.scrollLeft += 12;
    ultimoX = xDaBarra(ev);
    void posicionar();
  }

  /** Põe o separador arrastado debaixo do rato e, se passou o centro de um vizinho, troca-lhe o lugar */
  async function posicionar() {
    if (arrasto === null || !premido || aPosicionar) return;
    aPosicionar = true;
    try {
      const id = arrasto;
      const el = els[id];
      if (!el) return;
      const esquerda = ultimoX - premido.agarra;
      el.style.transform = `translateX(${esquerda - el.offsetLeft}px)`;
      const centros = separadores.filter((s) => s.id !== id).map((s) => (els[s.id]?.offsetLeft ?? 0) + (els[s.id]?.offsetWidth ?? 0) / 2);
      const destino = posicaoAoArrastar(centros, esquerda + el.offsetWidth / 2);
      if (destino !== separadores.findIndex((s) => s.id === id)) {
        onmover(id, destino);
        await tick();
        // o separador mudou de sítio na barra: acerta-se o deslocamento para ele continuar debaixo do rato
        el.style.transform = `translateX(${esquerda - el.offsetLeft}px)`;
      }
    } finally {
      aPosicionar = false;
    }
  }

  function largar() {
    if (arrasto !== null) {
      const el = els[arrasto];
      if (el) el.style.transform = '';
    }
    arrasto = null;
    premido = null;
  }

  async function mudarComTeclado(id: number, delta: 1 | -1) {
    const i = separadores.findIndex((s) => s.id === id);
    const para = i + delta;
    if (i < 0 || para < 0 || para >= separadores.length) return;
    onmover(id, para);
    await tick();
    els[id]?.focus();
  }

  /** O ponto de estado de cada separador: a carregar, com erros, com avisos, ou em ordem */
  function estado(s: Separador): 'carrega' | 'erro' | 'aviso' | 'ok' | null {
    if (s.aCarregar) return 'carrega';
    if (!s.temFicheiro) return null;
    return s.erros ? 'erro' : s.avisos ? 'aviso' : 'ok';
  }
  const dica = (s: Separador) =>
    !s.temFicheiro ? 'Novo separador' : `${s.nome}${s.erros || s.avisos ? ` · ${s.erros} ${s.erros === 1 ? 'erro' : 'erros'}, ${s.avisos} ${s.avisos === 1 ? 'aviso' : 'avisos'}` : ''}`;

  function tecla(e: KeyboardEvent, s: Separador) {
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      void mudarComTeclado(s.id, e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onescolher(s.id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onfechar(s.id);
    }
  }
</script>

<div class="barra" role="tablist" aria-label="Ficheiros abertos" bind:this={barra}>
  {#each separadores as s (s.id)}
    {@const e = estado(s)}
    <!-- o separador é um botão com um botão de fechar lá dentro: não podem ser os dois <button> -->
    <div
      class="sep"
      class:ativo={s.id === ativo}
      class:arrastado={s.id === arrasto}
      role="tab"
      tabindex="0"
      aria-selected={s.id === ativo}
      aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
      title={dica(s)}
      bind:this={els[s.id]}
      animate:flip={{ duration: SEM_ANIMACAO || s.id === arrasto ? 0 : 170 }}
      onpointerdown={(ev) => premir(ev, s)}
      onpointermove={mexer}
      onpointerup={largar}
      onpointercancel={largar}
      onclick={() => onescolher(s.id)}
      onkeydown={(ev) => tecla(ev, s)}
      onauxclick={(ev) => {
        // clique do meio fecha, como nos browsers
        if (ev.button === 1) {
          ev.preventDefault();
          onfechar(s.id);
        }
      }}
    >
      {#if e}<span class="ponto {e}" aria-hidden="true"></span>{/if}
      <span class="nome">{s.temFicheiro ? s.nome : s.aCarregar ? 'A abrir…' : 'Novo separador'}</span>
      <button type="button" class="fechar" aria-label={`Fechar ${s.temFicheiro ? s.nome : 'o separador'}`} title="Fechar (Ctrl/Cmd+W)" tabindex="-1" onclick={(ev) => { ev.stopPropagation(); onfechar(s.id); }}>
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
      </button>
    </div>
  {/each}
  <button type="button" class="novo" aria-label="Novo separador" title="Novo separador (Ctrl/Cmd+T)" onclick={onnovo}>
    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M7 2.5v9M2.5 7h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
  </button>
</div>

<style>
  .barra {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px;
    overflow-x: auto;
    scrollbar-width: none;
    min-height: 40px;
    position: relative;
  }
  .barra::-webkit-scrollbar {
    display: none;
  }
  .sep {
    flex: 0 1 210px;
    min-width: 112px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px 7px 13px;
    border-radius: 12px;
    border: 1px solid transparent;
    color: var(--texto-2);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    touch-action: none;
    transition: background 0.12s, color 0.12s, transform 0.16s ease;
  }
  /* o que se arrasta segue o rato sem atraso e fica por cima dos outros */
  .sep.arrastado {
    transition: background 0.12s, color 0.12s;
    z-index: 2;
    cursor: grabbing;
    background: var(--superficie);
    border-color: var(--borda);
    color: var(--texto);
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.28);
  }
  .sep:hover {
    background: color-mix(in srgb, var(--superficie) 70%, transparent);
    color: var(--texto);
  }
  .sep.ativo {
    background: var(--superficie);
    border-color: var(--borda);
    color: var(--texto);
    box-shadow: var(--sombra-cartao);
  }
  .nome {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ponto {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .ponto.erro {
    background: var(--erro);
  }
  .ponto.aviso {
    background: var(--aviso);
  }
  .ponto.ok {
    background: var(--ok);
  }
  .ponto.carrega {
    background: none;
    border: 2px solid color-mix(in srgb, var(--acento) 30%, transparent);
    border-top-color: var(--acento);
    animation: gira 0.8s linear infinite;
  }
  @keyframes gira {
    to {
      transform: rotate(360deg);
    }
  }
  .fechar,
  .fechar:hover:not(:disabled) {
    flex: none;
    width: 20px;
    height: 20px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--texto-2);
    opacity: 0;
  }
  .sep:hover .fechar,
  .sep.ativo .fechar,
  .sep:focus-visible .fechar {
    opacity: 1;
  }
  .fechar:hover:not(:disabled) {
    background: var(--superficie-2);
    color: var(--texto);
  }
  .novo,
  .novo:hover:not(:disabled) {
    flex: none;
    width: 30px;
    height: 30px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--texto-2);
  }
  .novo:hover:not(:disabled) {
    background: color-mix(in srgb, var(--superficie) 75%, transparent);
    color: var(--texto);
  }
</style>
