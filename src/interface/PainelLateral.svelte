<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    titulo: string;
    dica?: string;
    onfechar: () => void;
    children: Snippet;
  }
  let { titulo, dica = '', onfechar, children }: Props = $props();
</script>

<section class="painel" aria-label={titulo}>
  <header>
    <div>
      <h2>{titulo}</h2>
      {#if dica}<p>{dica}</p>{/if}
    </div>
    <button class="icone fechar" onclick={onfechar} title="Esconder o painel" aria-label="Esconder o painel">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
    </button>
  </header>
  <div class="corpo">{@render children()}</div>
</section>

<style>
  .painel {
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 0;
    height: 100%;
    background: var(--superficie);
    border: 1px solid var(--borda);
    border-radius: var(--raio);
    box-shadow: var(--sombra-cartao);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 18px 16px 8px 20px;
  }
  h2 {
    margin: 0;
    font-size: 22px;
    letter-spacing: -0.02em;
  }
  p {
    margin: 2px 0 0;
    font-size: 13px;
    color: var(--texto-2);
  }
  .fechar {
    border-radius: 50%;
    width: 30px;
    height: 30px;
    min-width: 0;
    padding: 0;
    display: grid;
    place-items: center;
    background: var(--superficie-2);
    border-color: transparent;
    color: var(--texto-2);
  }
  .corpo {
    overflow: auto;
    min-height: 0;
    padding: 0 6px 6px;
  }
</style>
