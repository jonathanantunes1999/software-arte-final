<script lang="ts">
  import type { Separador } from './separadores';

  interface Props {
    separadores: Separador[];
    ativo: number;
    onescolher(id: number): void;
    onfechar(id: number): void;
    onnovo(): void;
  }
  let { separadores, ativo, onescolher, onfechar, onnovo }: Props = $props();

  /** O ponto de estado de cada separador: a carregar, com erros, com avisos, ou em ordem */
  function estado(s: Separador): 'carrega' | 'erro' | 'aviso' | 'ok' | null {
    if (s.aCarregar) return 'carrega';
    if (!s.temFicheiro) return null;
    return s.erros ? 'erro' : s.avisos ? 'aviso' : 'ok';
  }
  const dica = (s: Separador) =>
    !s.temFicheiro ? 'Novo separador' : `${s.nome}${s.erros || s.avisos ? ` · ${s.erros} ${s.erros === 1 ? 'erro' : 'erros'}, ${s.avisos} ${s.avisos === 1 ? 'aviso' : 'avisos'}` : ''}`;

  function tecla(e: KeyboardEvent, s: Separador) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onescolher(s.id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onfechar(s.id);
    }
  }
</script>

<div class="barra" role="tablist" aria-label="Ficheiros abertos">
  {#each separadores as s (s.id)}
    {@const e = estado(s)}
    <!-- o separador é um botão com um botão de fechar lá dentro: não podem ser os dois <button> -->
    <div
      class="sep"
      class:ativo={s.id === ativo}
      role="tab"
      tabindex="0"
      aria-selected={s.id === ativo}
      title={dica(s)}
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
    transition: background 0.12s, color 0.12s;
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
