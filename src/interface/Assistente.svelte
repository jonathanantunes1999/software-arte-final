<script lang="ts">
  import { tick } from 'svelte';
  import { formatar } from '../assistente/formatar';
  import type { ResultadoAcao } from '../assistente/conversa';
  import type { Acao, ContextoAssistente } from '../assistente/tipos';
  import { assistente, abrirAssistente, alternarAssistente, balao, enviarMensagem, fecharAssistente, fecharBalao, limparConversa } from './estadoAssistente.svelte';
  import { definicoes } from './definicoes.svelte';
  import Mascote from './Mascote.svelte';

  interface Props {
    contexto: () => ContextoAssistente;
    executar: (a: Acao) => Promise<ResultadoAcao>;
    /** Margem à direita, para não tapar o painel lateral */
    direita?: number;
    /** Mostra o botão flutuante (no ecrã inicial é a mascote grande que abre a conversa) */
    lancador?: boolean;
  }
  let { contexto, executar, direita = 14, lancador = true }: Props = $props();

  let texto = $state('');
  let lista: HTMLDivElement | undefined = $state();
  let campo: HTMLInputElement | undefined = $state();

  const ultima = $derived(assistente.mensagens.at(-1));
  const sugestoes = $derived(!assistente.pensando && ultima?.de === 'mascote' ? (ultima.sugestoes ?? []) : []);

  async function enviar(t = texto) {
    if (!t.trim() || assistente.pensando) return;
    texto = '';
    await enviarMensagem(t, contexto, executar);
  }

  // a conversa desce sozinha quando chega uma mensagem; o foco vai para o campo ao abrir
  $effect(() => {
    void assistente.mensagens.length;
    void assistente.pensando;
    void tick().then(() => lista?.scrollTo({ top: lista.scrollHeight, behavior: 'smooth' }));
  });
  $effect(() => {
    if (assistente.aberto) void tick().then(() => campo?.focus());
  });

  /** Clicar no balão abre a conversa e, se o balão trazia uma oferta ("Queres que explique?"), já a faz */
  function abrirPeloBalao() {
    const pergunta = balao.atual?.pergunta;
    abrirAssistente(contexto);
    if (pergunta) void enviar(pergunta);
  }

  function tecla(e: KeyboardEvent) {
    // Ctrl/Cmd+K abre e fecha, de qualquer sítio
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      alternarAssistente(contexto);
    } else if (e.key === 'Escape' && assistente.aberto && document.activeElement === campo) {
      fecharAssistente();
    }
  }
</script>

<svelte:window onkeydown={tecla} />

{#if assistente.aberto}
  <div class="chat" style:right="{direita}px" role="dialog" aria-label="Conversa com a mascote">
    <header>
      {#if definicoes.mascote.visivel}
        <Mascote tamanho={58} estado={assistente.expressao} configuravel={false} />
      {/if}
      <div class="titulo">
        <strong>Pergunta-me</strong>
        <span>{assistente.pensando ? 'a pensar…' : 'Corrijo, explico e levo-te aos sítios'}</span>
      </div>
      <button type="button" class="icone" title="Limpar a conversa" aria-label="Limpar a conversa" onclick={limparConversa}>
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 6h10M8 6V4h4v2m-6 0 .7 10h6.6L14 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <button type="button" class="icone" title="Fechar (Esc)" aria-label="Fechar" onclick={fecharAssistente}>✕</button>
    </header>

    <div class="mensagens" bind:this={lista} aria-live="polite">
      {#each assistente.mensagens as m (m.id)}
        <div class="msg {m.de}">
          {#each formatar(m.texto) as p, i (i)}
            <p>
              {#each p as linha, j (j)}{#if j > 0}<br />{/if}{#each linha as pe, k (k)}{#if pe.negrito}<b>{pe.texto}</b>{:else}{pe.texto}{/if}{/each}{/each}
            </p>
          {/each}
        </div>
      {/each}
      {#if assistente.pensando}
        <div class="msg mascote pensa" aria-label="A pensar"><span class="ponto"></span><span class="ponto"></span><span class="ponto"></span></div>
      {/if}
      {#if sugestoes.length}
        <div class="sugestoes">
          {#each sugestoes as s (s)}
            <button type="button" onclick={() => enviar(s)}>{s}</button>
          {/each}
        </div>
      {/if}
    </div>

    <form
      onsubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <input bind:this={campo} bind:value={texto} placeholder="Escreve o que queres… (ex.: corrige o RGB)" autocomplete="off" spellcheck="true" aria-label="Mensagem" maxlength="400" />
      <button type="submit" class="enviar" disabled={!texto.trim() || assistente.pensando} aria-label="Enviar">
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 10l14-6-5 14-2-6-7-2z" fill="currentColor" /></svg>
      </button>
    </form>
  </div>
{:else if lancador}
  {#if balao.atual && definicoes.mascote.balao}
    <div class="balao" style:right="{direita + 62}px" role="status">
      <button type="button" class="texto-balao" onclick={abrirPeloBalao}>{balao.atual.texto}</button>
      <button type="button" class="fecha-balao" aria-label="Fechar o aviso" onclick={fecharBalao}>✕</button>
    </div>
  {/if}
  <button type="button" class="lancador" class:so-icone={!definicoes.mascote.visivel} style:right="{direita}px" title="Pergunta-me (Ctrl/Cmd+K)" aria-label="Abrir a conversa com a mascote" onclick={() => abrirAssistente(contexto)}>
    {#if definicoes.mascote.visivel}
      <Mascote tamanho={78} interativa={false} />
    {:else}
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
    {/if}
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
  .lancador.so-icone,
  .lancador.so-icone:hover:not(:disabled),
  .lancador.so-icone:active:not(:disabled) {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    background: var(--brilho);
    color: #04121a;
    box-shadow: var(--brilho-sombra);
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
  .chat {
    position: fixed;
    bottom: 14px;
    z-index: 40;
    width: min(400px, calc(100vw - 24px));
    height: min(560px, calc(100vh - 90px));
    display: grid;
    grid-template-rows: auto 1fr auto;
    background: var(--superficie);
    border: 1px solid var(--borda);
    border-radius: 18px;
    box-shadow: 0 18px 60px rgb(0 0 0 / 0.45), 0 0 0 1px rgb(94 224 255 / 0.06);
    overflow: hidden;
    animation: entra 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.1);
  }
  @keyframes entra {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.97);
    }
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px 6px 8px;
    border-bottom: 1px solid var(--borda);
    background: linear-gradient(180deg, var(--superficie-2), var(--superficie));
  }
  .titulo {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .titulo strong {
    font-size: 14px;
  }
  .titulo span {
    font-size: 11.5px;
    color: var(--texto-2);
  }
  .icone {
    border: none;
    background: none;
    color: var(--texto-2);
    width: 28px;
    height: 28px;
    border-radius: 8px;
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .icone:hover {
    background: var(--superficie-2);
    color: var(--texto);
  }
  .mensagens {
    overflow-y: auto;
    padding: 14px 12px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .msg {
    max-width: 88%;
    padding: 9px 12px;
    border-radius: 14px;
    font-size: 13.5px;
    line-height: 1.45;
    overflow-wrap: anywhere;
    animation: sobe 0.18s ease-out;
  }
  @keyframes sobe {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  .msg p {
    margin: 0;
  }
  .msg p + p {
    margin-top: 7px;
  }
  .msg.mascote {
    align-self: flex-start;
    background: var(--superficie-2);
    border-bottom-left-radius: 4px;
  }
  .msg.eu {
    align-self: flex-end;
    background: var(--brilho);
    color: #04121a;
    border-bottom-right-radius: 4px;
  }
  .msg.pensa {
    display: flex;
    gap: 4px;
    padding: 12px 14px;
  }
  .ponto {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--texto-2);
    animation: salto 1s infinite;
  }
  .ponto:nth-child(2) {
    animation-delay: 0.15s;
  }
  .ponto:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes salto {
    0%,
    60%,
    100% {
      transform: translateY(0);
      opacity: 0.5;
    }
    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }
  .sugestoes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-top: 2px;
  }
  .sugestoes button {
    border: 1px solid var(--borda);
    background: transparent;
    color: var(--acento);
    border-radius: 999px;
    padding: 5px 11px;
    font-size: 12.5px;
    cursor: pointer;
  }
  .sugestoes button:hover {
    background: var(--info-fundo);
    border-color: var(--acento);
  }
  form {
    display: flex;
    gap: 8px;
    padding: 10px;
    border-top: 1px solid var(--borda);
  }
  input {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--borda);
    background: var(--superficie-2);
    color: var(--texto);
    border-radius: 12px;
    padding: 9px 12px;
    font-size: 13.5px;
  }
  input:focus {
    outline: 2px solid var(--acento);
    outline-offset: -1px;
  }
  .enviar {
    width: 40px;
    border: none;
    border-radius: 12px;
    background: var(--brilho);
    color: #04121a;
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .enviar:disabled {
    opacity: 0.4;
    cursor: default;
  }
  @media (prefers-reduced-motion: reduce) {
    .chat,
    .msg,
    .ponto {
      animation: none;
    }
  }
</style>
