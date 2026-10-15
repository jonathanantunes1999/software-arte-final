<script lang="ts">
  import type { Caixa } from '../analise/caixas';
  import type { PaginaInfo } from '../analise/documento';
  import { formatarMm, ptParaMm } from '../comum/unidades';

  interface Props {
    pagina: PaginaInfo | null;
  }
  let { pagina }: Props = $props();

  const dim = (c: Caixa) => `${formatarMm(ptParaMm(c.x1 - c.x0))} × ${formatarMm(ptParaMm(c.y1 - c.y0))} mm`;

  const linhas = $derived(
    pagina
      ? [
          { nome: 'MediaBox', valor: dim(pagina.media), nota: '' },
          { nome: 'CropBox', valor: dim(pagina.crop), nota: pagina.origemTrim === 'MediaBox' ? 'igual à MediaBox' : '' },
          {
            nome: 'TrimBox',
            valor: dim(pagina.trim),
            nota: pagina.origemTrim === 'TrimBox' ? 'definida no ficheiro' : `não existe, usa a ${pagina.origemTrim}`,
          },
          {
            nome: 'BleedBox',
            valor: dim(pagina.bleed),
            nota: pagina.origemSangria === 'BleedBox' ? 'definida no ficheiro' : 'não existe',
          },
        ]
      : [],
  );
</script>

<div class="painel">
  <h2>Caixas da página</h2>
  {#if !pagina}
    <p class="vazio">Sem ficheiro aberto.</p>
  {:else}
    <dl>
      {#each linhas as l (l.nome)}
        <dt>{l.nome}</dt>
        <dd>
          <span class="valor">{l.valor}</span>
          {#if l.nota}<span class="nota">{l.nota}</span>{/if}
        </dd>
      {/each}
    </dl>
    {#if pagina.rotacao}
      <p class="nota">Página rodada {pagina.rotacao}°. As medidas são as que se veem no ecrã.</p>
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
  dl {
    margin: 0;
    display: grid;
    gap: 10px;
    padding: 0 4px;
  }
  dt {
    font-weight: 600;
  }
  dd {
    margin: 0;
    display: grid;
  }
  .valor {
    font-variant-numeric: tabular-nums;
  }
  .nota,
  .vazio {
    color: var(--texto-2);
    font-size: 12px;
  }
  .vazio {
    margin: 4px;
    font-size: 13px;
  }
  p.nota {
    margin: 14px 4px 0;
  }
</style>
