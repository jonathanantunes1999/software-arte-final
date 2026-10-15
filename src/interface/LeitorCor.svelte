<script lang="ts">
  import type { Leitura } from '../analise/inspecao';

  interface Props {
    /** Do objeto de cima para os de baixo */
    leituras: Leitura[];
    /** Posição do rato no ecrã */
    x: number;
    y: number;
    /** Nome da layer do objeto de cima, se houver */
    camada?: string;
  }
  let { leituras, x, y, camada }: Props = $props();

  const LARGURA = 270;
  let caixa: HTMLDivElement;
  let altura = $state(0);

  // junto ao cursor, mas sem sair da janela
  const esquerda = $derived(x + 18 + LARGURA > window.innerWidth ? Math.max(8, x - 18 - LARGURA) : x + 18);
  const topo = $derived(y + 18 + altura > window.innerHeight ? Math.max(8, y - 18 - altura) : y + 18);

  const ROTULO_OVERPRINT = {
    ligado: 'Overprint ligado',
    desligado: 'Overprint desligado',
    'sem-efeito': 'Overprint ligado, sem efeito (CMYK em modo 0)',
  } as const;

  const cima = $derived(leituras[0]);
  const baixo = $derived(leituras.slice(1, 4));
</script>

<div class="leitor" bind:this={caixa} bind:clientHeight={altura} style:left="{esquerda}px" style:top="{topo}px" style:width="{LARGURA}px" role="status">
  {#if !cima}
    <p class="nada">Sem objetos aqui (papel).</p>
  {:else}
    <div class="titulo">{cima.objeto}{#if camada}<span class="camada">layer «{camada}»</span>{/if}</div>
    {#each cima.partes as p (p.parte)}
      <div class="parte">
        <span class="amostra" class:spot={!p.amostra} style:background={p.amostra} aria-hidden="true"></span>
        <div class="texto">
          <span class="rotulo">{p.parte}</span>
          <span class="valores">{p.valores}</span>
          <span class="op {p.overprint}">{ROTULO_OVERPRINT[p.overprint]}</span>
        </div>
      </div>
    {/each}
    {#if cima.nota}<p class="nota">{cima.nota}</p>{/if}
    {#if baixo.length}
      <div class="baixo">
        <span class="rotulo">Por baixo</span>
        {#each baixo as b, i (i)}
          <div class="linha">
            <span>{b.objeto}</span>
            <span>{b.partes.map((p) => p.valores).join(' + ') || '—'}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .leitor {
    position: fixed;
    z-index: 40;
    pointer-events: none;
    background: var(--superficie);
    color: var(--texto);
    border: 1px solid var(--borda);
    border-radius: 9px;
    box-shadow: var(--sombra);
    padding: 9px 11px;
    font-size: 12.5px;
    line-height: 1.35;
    display: grid;
    gap: 7px;
  }
  .titulo {
    font-weight: 700;
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .camada {
    font-weight: 400;
    color: var(--texto-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .parte {
    display: flex;
    gap: 9px;
    align-items: flex-start;
  }
  .amostra {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 5px;
    border: 1px solid var(--borda);
    margin-top: 1px;
  }
  .amostra.spot {
    background: repeating-linear-gradient(45deg, var(--superficie-2) 0 4px, var(--superficie) 4px 8px);
  }
  .texto {
    display: grid;
    min-width: 0;
  }
  .rotulo {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--texto-2);
  }
  .valores {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .op {
    font-size: 12px;
  }
  .op.ligado {
    color: var(--aviso);
    font-weight: 600;
  }
  .op.desligado {
    color: var(--texto-2);
  }
  .op.sem-efeito {
    color: var(--texto-2);
    font-style: italic;
  }
  .nota,
  .nada {
    margin: 0;
    color: var(--texto-2);
    font-size: 12px;
  }
  .baixo {
    border-top: 1px solid var(--borda);
    padding-top: 6px;
    display: grid;
    gap: 2px;
  }
  .linha {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: var(--texto-2);
    font-size: 12px;
  }
  .linha span:last-child {
    text-align: right;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
