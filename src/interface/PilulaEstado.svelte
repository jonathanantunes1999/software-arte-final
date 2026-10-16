<script lang="ts">
  import { fly } from 'svelte/transition';

  interface Props {
    /** Há um PDF aberto */
    aberto: boolean;
    emAnalise: boolean;
    progresso: { feitas: number; total: number };
    contagem: { erro: number; aviso: number; info: number };
    /** Clicar leva ao primeiro alerta */
    onclick?: () => void;
  }
  let { aberto, emAnalise, progresso, contagem, onclick }: Props = $props();

  const R = 7;
  const CIRC = 2 * Math.PI * R;
  const fracao = $derived(progresso.total ? Math.min(1, progresso.feitas / progresso.total) : 0);

  type Estado = 'vazio' | 'analisa' | 'erro' | 'aviso' | 'ok';
  const estado = $derived<Estado>(!aberto ? 'vazio' : emAnalise ? 'analisa' : contagem.erro ? 'erro' : contagem.aviso ? 'aviso' : 'ok');
  const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;
  const texto = $derived(
    estado === 'vazio'
      ? 'Pronto'
      : estado === 'analisa'
        ? `A analisar${progresso.total > 1 ? ` ${progresso.feitas}/${progresso.total}` : '…'}`
        : estado === 'ok'
          ? 'Tudo em ordem'
          : [contagem.erro ? plural(contagem.erro, 'erro', 'erros') : '', contagem.aviso ? plural(contagem.aviso, 'aviso', 'avisos') : ''].filter(Boolean).join(' · '),
  );
</script>

<button class="pilula {estado}" {onclick} disabled={estado === 'vazio' || estado === 'analisa' || !onclick} aria-live="polite" title={estado === 'erro' || estado === 'aviso' ? 'Ir ao primeiro alerta (N)' : ''}>
  <span class="ponto" aria-hidden="true">
    {#if estado === 'analisa'}
      <svg viewBox="0 0 20 20" width="18" height="18">
        <circle cx="10" cy="10" r={R} class="pista" />
        <circle cx="10" cy="10" r={R} class="progresso" style:stroke-dasharray={CIRC} style:stroke-dashoffset={CIRC * (1 - (fracao || 0.25))} class:gira={!fracao} />
      </svg>
    {:else if estado === 'ok'}
      <svg viewBox="0 0 20 20" width="18" height="18"><path d="M5 10.5l3.4 3.4L15 6.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
    {:else}
      <i class="bolinha"></i>
    {/if}
  </span>
  {#key texto}
    <span class="texto mono" in:fly={{ y: 6, duration: 180 }}>{texto}</span>
  {/key}
</button>

<style>
  .pilula {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 6px 15px 6px 11px;
    border-radius: 999px;
    border: 1px solid var(--borda);
    background: color-mix(in srgb, var(--superficie) 80%, transparent);
    backdrop-filter: blur(12px);
    font-size: 13px;
    font-weight: 600;
    min-height: 32px;
    color: var(--texto-2);
    --cor: var(--texto-2);
    box-shadow: var(--sombra);
    transition: border-color 0.3s, box-shadow 0.3s, color 0.3s;
  }
  .pilula:disabled {
    opacity: 1;
    cursor: default;
  }
  .pilula.analisa {
    --cor: var(--acento);
    color: var(--texto);
  }
  .pilula.erro {
    --cor: var(--erro);
    color: var(--texto);
    border-color: color-mix(in srgb, var(--erro) 55%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--erro) 25%, transparent), 0 4px 22px color-mix(in srgb, var(--erro) 28%, transparent);
  }
  .pilula.aviso {
    --cor: var(--aviso);
    color: var(--texto);
    border-color: color-mix(in srgb, var(--aviso) 55%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--aviso) 25%, transparent), 0 4px 22px color-mix(in srgb, var(--aviso) 24%, transparent);
  }
  .pilula.ok {
    --cor: var(--ok);
    color: var(--texto);
    border-color: color-mix(in srgb, var(--ok) 55%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--ok) 25%, transparent), 0 4px 22px color-mix(in srgb, var(--ok) 26%, transparent);
  }
  .pilula.erro:hover,
  .pilula.aviso:hover {
    filter: brightness(1.12);
  }
  .ponto {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    color: var(--cor);
  }
  .bolinha {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--cor);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--cor) 60%, transparent);
    animation: pulsa 2.2s ease-out infinite;
  }
  .pilula.vazio .bolinha {
    animation-duration: 3.2s;
  }
  @keyframes pulsa {
    70%,
    100% {
      box-shadow: 0 0 0 9px transparent;
    }
  }
  .pista {
    fill: none;
    stroke: var(--borda);
    stroke-width: 2.4;
  }
  .progresso {
    fill: none;
    stroke: var(--cor);
    stroke-width: 2.4;
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: center;
    transition: stroke-dashoffset 0.25s;
  }
  .progresso.gira {
    animation: roda 0.9s linear infinite;
  }
  @keyframes roda {
    to {
      transform: rotate(270deg);
    }
  }
  .texto {
    font-variant-numeric: tabular-nums;
  }
</style>
