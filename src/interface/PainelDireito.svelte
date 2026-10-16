<script lang="ts">
  import type { Snippet } from 'svelte';

  type Aba = 'layers' | 'separacoes' | 'correcoes' | 'caixas';
  interface Props {
    layers: Snippet;
    separacoes: Snippet;
    correcoes: Snippet;
    caixas: Snippet;
    numeroLayers?: number;
    /** Avisa quando se muda de separador */
    aoMudar?(aba: Aba): void;
  }
  let { layers, separacoes, correcoes, caixas, numeroLayers = 0, aoMudar }: Props = $props();

  let aba = $state<Aba>('layers');
  const abas: { id: Aba; nome: string }[] = [
    { id: 'layers', nome: 'Layers' },
    { id: 'separacoes', nome: 'Separações' },
    { id: 'correcoes', nome: 'Correções' },
    { id: 'caixas', nome: 'Caixas' },
  ];
</script>

<div class="direito">
  <div class="abas" role="tablist">
    {#each abas as a (a.id)}
      <button role="tab" aria-selected={aba === a.id} class:ativa={aba === a.id} onclick={() => { aba = a.id; aoMudar?.(a.id); }}>
        {a.nome}{#if a.id === 'layers' && numeroLayers}<span class="n">{numeroLayers}</span>{/if}
      </button>
    {/each}
  </div>
  <div class="corpo" role="tabpanel">
    {#if aba === 'layers'}{@render layers()}{:else if aba === 'separacoes'}{@render separacoes()}{:else if aba === 'correcoes'}{@render correcoes()}{:else}{@render caixas()}{/if}
  </div>
</div>

<style>
  .direito {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100%;
    min-height: 0;
  }
  .abas {
    display: flex;
    gap: 2px;
    padding: 8px 8px 0;
    border-bottom: 1px solid var(--borda);
  }
  .abas button {
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 6px 6px 0 0;
    background: transparent;
    color: var(--texto-2);
    padding: 6px 8px;
    font-weight: 600;
    font-size: 13px;
  }
  .abas button.ativa {
    color: var(--texto);
    border-bottom-color: var(--acento);
  }
  .n {
    margin-left: 5px;
    font-size: 11px;
    background: var(--superficie-2);
    border-radius: 9px;
    padding: 0 6px;
  }
  .corpo {
    overflow: auto;
    min-height: 0;
  }
</style>
