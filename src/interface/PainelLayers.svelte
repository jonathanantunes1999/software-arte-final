<script lang="ts">
  import type { CamadaInfo } from '../analise/ir';

  interface Props {
    /** Layers desta página (as que já se viram, mesmo que estejam desligadas) */
    camadas: CamadaInfo[];
    /** O que o utilizador escolheu: id → visível. O que falta segue o ficheiro. */
    sobreposicoes: Record<string, boolean>;
    /** Quantas layers o ficheiro declara ao todo */
    totalDocumento: number;
    aCarregar: boolean;
    onalternar(id: string, visivel: boolean): void;
    onrepor(): void;
    onmostrarTodas(): void;
  }
  let { camadas, sobreposicoes, totalDocumento, aCarregar, onalternar, onrepor, onmostrarTodas }: Props = $props();

  const visivel = (c: CamadaInfo) => sobreposicoes[c.id] ?? !c.desligada;

  /** Nomes repetidos (acontece muito em ficheiros do Illustrator) ganham um número */
  const itens = $derived.by(() => {
    const total = new Map<string, number>();
    for (const c of camadas) total.set(c.nome, (total.get(c.nome) ?? 0) + 1);
    const visto = new Map<string, number>();
    return camadas.map((c) => {
      const n = (visto.get(c.nome) ?? 0) + 1;
      visto.set(c.nome, n);
      return { ...c, rotulo: (total.get(c.nome) ?? 0) > 1 ? `${c.nome} (${n})` : c.nome };
    });
  });
  const alterado = $derived(Object.keys(sobreposicoes).length > 0);
</script>

<div class="painel">
  {#if camadas.length === 0}
    {#if aCarregar}
      <p class="nota">A ler as layers…</p>
    {:else if totalDocumento === 0}
      <p class="nota">Este ficheiro não tem layers PDF (Optional Content).</p>
      <p class="nota">As layers do Illustrator num PDF editável ficam guardadas dentro dos dados do Illustrator e não são layers PDF, por isso não aparecem aqui.</p>
    {:else}
      <p class="nota">Esta página não usa nenhuma das {totalDocumento} layers do ficheiro.</p>
    {/if}
  {:else}
    <div class="acoes">
      <button onclick={onmostrarTodas}>Mostrar todas</button>
      <button onclick={onrepor} disabled={!alterado}>Repor</button>
    </div>
    <ul>
      {#each itens as c (c.id)}
        <li>
          <label>
            <input type="checkbox" checked={visivel(c)} onchange={(e) => onalternar(c.id, e.currentTarget.checked)} />
            <span class="nome" title={c.rotulo}>{c.rotulo}</span>
            {#if c.desligada && sobreposicoes[c.id] === undefined}<span class="etiqueta">desligada no ficheiro</span>{/if}
          </label>
        </li>
      {/each}
    </ul>
    <p class="nota">Só aparecem as layers usadas nesta página. Desligar uma layer esconde-a no ecrã, no leitor de cor e nas separações; o ficheiro não muda.</p>
  {/if}
</div>

<style>
  .painel {
    padding: 4px 12px 14px;
  }
  .acoes {
    display: flex;
    gap: 6px;
    margin: 4px 0 10px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 6px;
    cursor: pointer;
  }
  label:hover {
    background: var(--superficie-2);
  }
  .nome {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .etiqueta {
    margin-left: auto;
    flex: none;
    font-size: 11px;
    color: var(--texto-2);
  }
  .nota {
    color: var(--texto-2);
    font-size: 12px;
    margin: 12px 4px 0;
  }
</style>
