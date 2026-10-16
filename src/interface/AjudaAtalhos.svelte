<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    onfechar: () => void;
  }
  let { onfechar }: Props = $props();
  let dialogo: HTMLDialogElement;
  onMount(() => dialogo.showModal());

  const grupos: { titulo: string; teclas: [string, string][] }[] = [
    {
      titulo: 'Alertas',
      teclas: [
        ['N', 'Alerta seguinte (vai ao local)'],
        ['P', 'Alerta anterior'],
        ['Clique na marca', 'Seleciona o alerta na lista'],
      ],
    },
    {
      titulo: 'Ferramentas',
      teclas: [
        ['V', 'Leitor de cor: vê a cor e o overprint debaixo do cursor'],
        ['H', 'Mão: arrasta a página'],
        ['Espaço (segurar)', 'Mão temporária'],
        ['M', 'Régua: arrasta para medir em mm (Shift fixa o eixo, Esc limpa)'],
      ],
    },
    {
      titulo: 'Páginas e zoom',
      teclas: [
        ['← →', 'Página anterior e seguinte'],
        ['Ctrl + roda', 'Zoom'],
        ['Ctrl +  /  Ctrl −', 'Ampliar e reduzir'],
        ['Ctrl 0', 'Ajustar à página'],
      ],
    },
    {
      titulo: 'Geral',
      teclas: [
        ['Ctrl O', 'Abrir um PDF'],
        ['?', 'Esta ajuda'],
        ['Duplo clique no divisor', 'Repõe a largura do painel'],
      ],
    },
  ];
</script>

<dialog bind:this={dialogo} onclose={onfechar} aria-labelledby="titulo-ajuda">
  <form method="dialog">
    <header>
      <h2 id="titulo-ajuda">Atalhos de teclado</h2>
      <button class="icone" aria-label="Fechar">✕</button>
    </header>
    {#each grupos as g (g.titulo)}
      <section>
        <h3>{g.titulo}</h3>
        <dl>
          {#each g.teclas as [tecla, texto] (tecla)}
            <dt><kbd>{tecla}</kbd></dt>
            <dd>{texto}</dd>
          {/each}
        </dl>
      </section>
    {/each}
    <p class="nota">No Mac, usa Cmd em vez de Ctrl.</p>
  </form>
</dialog>

<style>
  dialog {
    border: 1px solid var(--borda);
    border-radius: 12px;
    background: var(--superficie);
    color: var(--texto);
    padding: 0 0 12px;
    width: min(520px, calc(100vw - 32px));
    box-shadow: var(--sombra);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px;
  }
  h2 {
    margin: 0;
    font-size: 17px;
  }
  h3 {
    margin: 0 0 6px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--texto-2);
  }
  section {
    padding: 6px 18px;
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: 170px 1fr;
    gap: 6px 12px;
    align-items: baseline;
  }
  dt {
    text-align: right;
  }
  dd {
    margin: 0;
    font-size: 13px;
  }
  kbd {
    font: 600 12px ui-monospace, monospace;
    padding: 2px 7px;
    border: 1px solid var(--borda);
    border-bottom-width: 2px;
    border-radius: 5px;
    background: var(--superficie-2);
    white-space: nowrap;
  }
  .nota {
    margin: 8px 18px 0;
    font-size: 12px;
    color: var(--texto-2);
  }
</style>
