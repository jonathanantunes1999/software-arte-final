<script lang="ts">
  import { alertaTamanhosDiferentes } from '../alertas/tamanhos-diferentes';
  import type { Alerta } from '../alertas/tipos';
  import type { DocumentoInfo } from '../analise/documento';
  import { definicoes } from './definicoes.svelte';

  interface Props {
    info: DocumentoInfo | null;
    pagina: number;
  }
  let { info, pagina = $bindable() }: Props = $props();

  const alertas = $derived<Alerta[]>(info ? alertaTamanhosDiferentes(info.paginas, definicoes.toleranciaFormatoMm) : []);

  const simbolo = { erro: '✕', aviso: '!', info: 'i' } as const;
  const rotulo = { erro: 'Erro', aviso: 'Aviso', info: 'Informação' } as const;
</script>

<div class="painel">
  <h2>Alertas {#if alertas.length}<span class="contagem">{alertas.length}</span>{/if}</h2>

  {#if !info}
    <p class="vazio">Abre um PDF para ver os alertas.</p>
  {:else}
    <ul>
      {#each alertas as a (a.id)}
        <li>
          <button class="alerta {a.gravidade}" onclick={() => a.pagina !== undefined && (pagina = a.pagina)}>
            <span class="icone" title={rotulo[a.gravidade]} aria-label={rotulo[a.gravidade]}>{simbolo[a.gravidade]}</span>
            <span class="texto">
              <strong>{a.titulo}</strong>
              {#if a.detalhe}<span class="detalhe">{a.detalhe}</span>{/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
    {#if alertas.length === 0}
      <p class="vazio">Sem alertas de tamanho. As restantes verificações (sangria, cores, fontes, overprint…) chegam na fase 2.</p>
    {/if}
  {/if}
</div>

<style>
  .painel {
    padding: 14px 12px;
  }
  h2 {
    margin: 0 4px 10px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--texto-2);
  }
  .contagem {
    background: var(--aviso-fundo);
    color: var(--aviso);
    border-radius: 999px;
    padding: 0 7px;
    margin-left: 4px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .alerta {
    display: flex;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 9px 10px;
    align-items: flex-start;
  }
  .icone {
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 800;
    margin-top: 1px;
  }
  .alerta.erro .icone {
    background: var(--erro-fundo);
    color: var(--erro);
  }
  .alerta.aviso .icone {
    background: var(--aviso-fundo);
    color: var(--aviso);
  }
  .alerta.info .icone {
    background: var(--info-fundo);
    color: var(--info);
  }
  .texto {
    display: grid;
    gap: 2px;
  }
  .detalhe {
    color: var(--texto-2);
    font-size: 12px;
    white-space: pre-line;
    font-variant-numeric: tabular-nums;
  }
  .vazio {
    color: var(--texto-2);
    margin: 4px;
    font-size: 13px;
  }
</style>
