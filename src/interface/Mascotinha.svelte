<script lang="ts">
  import { definicoes } from './definicoes.svelte';
  import { balao, fecharBalao } from './estadoBaloes.svelte';
  import Mascote from './Mascote.svelte';

  interface Props {
    /** Mostra o botão (só com um ficheiro aberto) */
    lancador?: boolean;
    /** Margem à direita, para não tapar o painel lateral */
    direita?: number;
    /** O botão da mascote abre a Ajuda */
    aoAjuda: () => void;
    /** Clicar no balão leva ao sítio de que ele fala */
    aoBalao: (destino: 'alertas' | 'ajuda') => void;
  }
  let { lancador = true, direita = 14, aoAjuda, aoBalao }: Props = $props();

  const visivel = $derived(definicoes.mascote.visivel);
</script>

{#if lancador && visivel}
  {#if balao.atual && definicoes.mascote.balao}
    <div class="balao" style:right="{direita + 62}px" role="status">
      <button type="button" class="texto-balao" onclick={() => { const d = balao.atual?.destino ?? 'ajuda'; fecharBalao(); aoBalao(d); }}>{balao.atual.texto}</button>
      <button type="button" class="fecha-balao" aria-label="Fechar o aviso" onclick={fecharBalao}>✕</button>
    </div>
  {/if}
  <button type="button" class="lancador" style:right="{direita}px" title="Ajuda e glossário" aria-label="Abrir a ajuda" onclick={aoAjuda}>
    <Mascote tamanho={78} interativa={false} />
  </button>
{/if}

<style>
  /* o botão global pinta um fundo ao passar o rato: aqui a mascote vai solta, sem círculo atrás */
  .lancador,
  .lancador:hover:not(:disabled),
  .lancador:active:not(:disabled) {
    position: fixed;
    bottom: 14px;
    z-index: 40;
    border: none;
    background: none;
    box-shadow: none;
    padding: 0;
    cursor: pointer;
    color: var(--texto);
    border-radius: 50%;
    transform: none;
  }
  .lancador:hover:not(:disabled) {
    filter: drop-shadow(0 6px 14px rgb(94 224 255 / 0.35));
  }
  /* o balãozinho: por cima do botão, com a pontinha a apontar-lhe */
  .balao {
    position: fixed;
    bottom: 88px;
    z-index: 41;
    display: flex;
    align-items: stretch;
    max-width: min(280px, calc(100vw - 40px));
    background: var(--superficie);
    color: var(--texto);
    border: 1px solid var(--borda);
    border-radius: 16px 16px 4px 16px;
    box-shadow: var(--sombra-cartao);
    animation: sobe-balao 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.15);
  }
  .balao::after {
    content: '';
    position: absolute;
    right: 14px;
    bottom: -7px;
    width: 12px;
    height: 12px;
    background: var(--superficie);
    border-right: 1px solid var(--borda);
    border-bottom: 1px solid var(--borda);
    transform: rotate(45deg);
  }
  .texto-balao,
  .texto-balao:hover:not(:disabled) {
    border: 0;
    background: none;
    padding: 10px 6px 10px 14px;
    border-radius: 16px 0 0 4px;
    text-align: left;
    font-weight: 600;
    font-size: 13.5px;
    line-height: 1.35;
    cursor: pointer;
  }
  .texto-balao:hover:not(:disabled) {
    color: var(--acento);
  }
  .fecha-balao,
  .fecha-balao:hover:not(:disabled) {
    border: 0;
    background: none;
    align-self: flex-start;
    padding: 6px 9px 0 3px;
    font-size: 11px;
    color: var(--texto-2);
    cursor: pointer;
  }
  @keyframes sobe-balao {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.92);
      transform-origin: 90% 100%;
    }
  }
</style>
