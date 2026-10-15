<script lang="ts">
  import { onMount } from 'svelte';
  import { FORMATOS_PREDEFINIDOS } from '../comum/formatos';
  import { definicoes } from './definicoes.svelte';

  interface Props {
    onfechar: () => void;
  }
  let { onfechar }: Props = $props();

  let dialogo: HTMLDialogElement;

  onMount(() => dialogo.showModal());

  function adicionar() {
    definicoes.formatos.push({ nome: 'Novo formato', larguraMm: 100, alturaMm: 100 });
  }

  function remover(i: number) {
    definicoes.formatos.splice(i, 1);
  }

  function restaurar() {
    if (confirm('Repor a lista de formatos original? Perdes os formatos que juntaste.')) {
      definicoes.formatos = FORMATOS_PREDEFINIDOS.map((f) => ({ ...f }));
    }
  }

  const invalido = (v: unknown) => !(typeof v === 'number' && v > 0);
</script>

<dialog bind:this={dialogo} onclose={onfechar} onclick={(e) => e.target === dialogo && dialogo.close()}>
  <form method="dialog">
    <header>
      <h2>Definições</h2>
      <button class="icone" aria-label="Fechar">✕</button>
    </header>

    <section>
      <h3>Sangria e tolerâncias</h3>
      <label class="campo">
        <span>Sangria de referência (mm)</span>
        <input type="number" min="0" step="0.5" bind:value={definicoes.sangriaReferenciaMm} />
      </label>
      <label class="campo">
        <span>Tolerância na deteção de formatos (± mm)</span>
        <input type="number" min="0" step="0.1" bind:value={definicoes.toleranciaFormatoMm} />
      </label>
    </section>

    <section>
      <h3>Formatos conhecidos</h3>
      <p class="ajuda">Larguras e alturas ao alto (vertical). A app reconhece-os também deitados.</p>
      <div class="formatos">
        <span class="cab">Nome</span><span class="cab">Largura</span><span class="cab">Altura</span><span></span>
        {#each definicoes.formatos as f, i (i)}
          <input type="text" bind:value={f.nome} aria-label="Nome do formato" />
          <input type="number" min="0" step="0.1" bind:value={f.larguraMm} aria-invalid={invalido(f.larguraMm)} aria-label="Largura em mm" />
          <input type="number" min="0" step="0.1" bind:value={f.alturaMm} aria-invalid={invalido(f.alturaMm)} aria-label="Altura em mm" />
          <button type="button" class="icone" onclick={() => remover(i)} aria-label="Remover {f.nome}">🗑</button>
        {/each}
      </div>
      <div class="acoes">
        <button type="button" onclick={adicionar}>+ Juntar formato</button>
        <button type="button" onclick={restaurar}>Repor originais</button>
      </div>
    </section>

    <footer>
      <button class="primario">Fechar</button>
    </footer>
  </form>
</dialog>

<style>
  dialog {
    border: 1px solid var(--borda);
    border-radius: 12px;
    background: var(--superficie);
    color: var(--texto);
    padding: 0;
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    box-shadow: var(--sombra);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }
  form {
    display: grid;
    gap: 4px;
  }
  header,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
  }
  footer {
    justify-content: flex-end;
    border-top: 1px solid var(--borda);
    margin-top: 8px;
  }
  h2 {
    margin: 0;
    font-size: 17px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--texto-2);
  }
  section {
    padding: 8px 18px;
  }
  .campo {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .campo input {
    width: 90px;
  }
  .ajuda {
    margin: 0 0 8px;
    color: var(--texto-2);
    font-size: 12px;
  }
  .formatos {
    display: grid;
    grid-template-columns: 1fr 80px 80px 36px;
    gap: 6px;
    max-height: 260px;
    overflow: auto;
    padding-right: 4px;
  }
  .cab {
    font-size: 12px;
    color: var(--texto-2);
  }
  input[aria-invalid='true'] {
    border-color: var(--erro);
  }
  .acoes {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
</style>
