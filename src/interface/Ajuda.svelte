<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { TipoCorrecao } from '../alertas/correcao-sugerida';
  import { procurarTopicos, TOPICOS } from '../ajuda/conhecimento';
  import { formatar } from '../ajuda/formatar';

  interface Props {
    /** Que separador abre: o glossário (por omissão) ou os atalhos */
    separador?: 'glossario' | 'atalhos';
    /** Um tópico do glossário a mostrar logo (vem do "O que é isto?" de um alerta) */
    topico?: string;
    /** "Ver nas Correções": fecha a ajuda e leva à correção */
    onverCorrecao?: (tipo: TipoCorrecao) => void;
    onfechar: () => void;
  }
  let { separador = 'glossario', topico, onverCorrecao, onfechar }: Props = $props();

  let dialogo: HTMLDialogElement;
  let aba = $state<'glossario' | 'atalhos'>(untrack(() => separador));
  let consulta = $state('');
  const topicos = $derived(procurarTopicos(consulta));

  onMount(() => {
    dialogo.showModal();
    if (topico && aba === 'glossario') {
      void tick().then(() => document.getElementById(`topico-${topico}`)?.scrollIntoView({ block: 'start' }));
    }
  });

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
      titulo: 'Separadores',
      teclas: [
        ['Ctrl T', 'Novo separador'],
        ['Ctrl W', 'Fechar o separador'],
        ['Ctrl Tab', 'Separador seguinte (com Shift, o anterior)'],
        ['Ctrl 1 … 9', 'Ir ao separador n.º (9 é o último)'],
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
  <header>
    <h2 id="titulo-ajuda">Ajuda</h2>
    <div class="abas" role="tablist">
      <button type="button" role="tab" class:ativa={aba === 'glossario'} aria-selected={aba === 'glossario'} onclick={() => (aba = 'glossario')}>Glossário</button>
      <button type="button" role="tab" class:ativa={aba === 'atalhos'} aria-selected={aba === 'atalhos'} onclick={() => (aba = 'atalhos')}>Atalhos</button>
    </div>
    <button type="button" class="icone fechar" aria-label="Fechar" onclick={() => dialogo.close()}>✕</button>
  </header>

  {#if aba === 'glossario'}
    <div class="procura">
      <input type="search" placeholder="Pesquisar: sangria, overprint, RGB…" bind:value={consulta} aria-label="Pesquisar no glossário" />
    </div>
    <div class="lista">
      {#each topicos as t (t.id)}
        <article id="topico-{t.id}" class:destaque={t.id === topico && !consulta}>
          <h3>{t.titulo}</h3>
          {#each formatar(t.texto) as par, i (i)}
            <p>
              {#each par as linha, j (j)}{#if j > 0}<br />{/if}{#each linha as pe, k (k)}{#if pe.negrito}<b>{pe.texto}</b>{:else}{pe.texto}{/if}{/each}{/each}
            </p>
          {/each}
          {#if t.correcao && onverCorrecao}
            <button type="button" class="ver" onclick={() => { dialogo.close(); onverCorrecao?.(t.correcao!); }}>Ver nas Correções</button>
          {/if}
        </article>
      {:else}
        <p class="vazio">Não encontrei nada para «{consulta}». Há {TOPICOS.length} termos no glossário: tenta uma palavra só.</p>
      {/each}
    </div>
  {:else}
    <div class="lista">
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
    </div>
  {/if}
</dialog>

<style>
  dialog {
    border: 1px solid var(--borda);
    border-radius: var(--raio);
    background: var(--superficie);
    color: var(--texto);
    padding: 0;
    width: min(600px, calc(100vw - 32px));
    max-height: min(680px, calc(100vh - 48px));
    box-shadow: var(--sombra-cartao);
  }
  dialog[open] {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }
  header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px 8px 22px;
  }
  h2 {
    margin: 0;
    font-size: 20px;
    letter-spacing: -0.02em;
  }
  .abas {
    display: flex;
    gap: 4px;
    margin-left: 6px;
    padding: 3px;
    background: var(--superficie-2);
    border-radius: 999px;
  }
  .abas button,
  .abas button:hover:not(:disabled) {
    border: 0;
    border-radius: 999px;
    background: none;
    padding: 5px 14px;
    font-weight: 600;
    font-size: 13px;
    color: var(--texto-2);
  }
  .abas button.ativa,
  .abas button.ativa:hover:not(:disabled) {
    background: var(--superficie);
    color: var(--texto);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
  }
  .fechar {
    margin-left: auto;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    padding: 0;
    background: var(--superficie-2);
    border-color: transparent;
  }
  .procura {
    padding: 4px 22px 10px;
  }
  .procura input {
    width: 100%;
    background: var(--superficie-2);
    border-color: transparent;
    border-radius: 12px;
    padding: 9px 14px;
  }
  .lista {
    overflow: auto;
    padding: 4px 22px 20px;
    min-height: 0;
  }
  article {
    padding: 12px 14px;
    margin: 0 -14px 6px;
    border-radius: var(--raio-2);
  }
  article.destaque {
    background: var(--superficie-2);
  }
  h3 {
    margin: 0 0 4px;
    font-size: 15px;
  }
  section h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--texto-2);
    margin-top: 12px;
  }
  article p {
    margin: 0 0 6px;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--texto);
  }
  .ver,
  .ver:hover:not(:disabled) {
    border-radius: 999px;
    background: var(--primario);
    color: var(--primario-texto);
    border-color: transparent;
    font-size: 12px;
    font-weight: 700;
    padding: 5px 13px;
    margin-top: 2px;
  }
  .vazio,
  .nota {
    color: var(--texto-2);
    font-size: 13px;
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
</style>
