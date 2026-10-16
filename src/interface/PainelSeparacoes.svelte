<script lang="ts">
  import type { Contagens } from '../separacoes/reescrever';
  import type { Placa } from '../separacoes/placas';

  interface Props {
    ativa: boolean;
    simular: boolean;
    placas: Placa[] | null;
    /** Placas que o utilizador escondeu (id → true) */
    escondidas: Record<string, boolean>;
    /** Placas sem tinta nesta página (id → true) */
    vazias: Record<string, boolean>;
    aCarregar: boolean;
    falhou: boolean;
    avisos: Contagens | null;
    onativar(v: boolean): void;
    onsimular(v: boolean): void;
    onalternar(id: string, visivel: boolean): void;
    ontodas(): void;
    onnenhuma(): void;
    onsolo(id: string): void;
  }
  let { ativa, simular, placas, escondidas, vazias, aCarregar, falhou, avisos, onativar, onsimular, onalternar, ontodas, onnenhuma, onsolo }: Props = $props();

  const css = (p: Placa) => `rgb(${p.rgb[0]} ${p.rgb[1]} ${p.rgb[2]})`;
</script>

<div class="painel">
  <label class="mestre">
    <input type="checkbox" checked={ativa} onchange={(e) => onativar(e.currentTarget.checked)} />
    <span>Ver separações</span>
  </label>
  <p class="nota">Mostra o que cada chapa (C, M, Y, K e cada spot) imprime, como a pré-visualização de saída do Acrobat.</p>

  {#if ativa}
    <label class="sub">
      <input type="checkbox" checked={simular} onchange={(e) => onsimular(e.currentTarget.checked)} />
      <span>Simular overprint</span>
    </label>

    {#if falhou}
      <p class="erro">Não consegui separar esta página.</p>
    {:else if !placas}
      <p class="nota">{aCarregar ? 'A separar a página…' : ''}</p>
    {:else}
      <div class="acoes">
        <button onclick={ontodas}>Todas</button>
        <button onclick={onnenhuma}>Nenhuma</button>
        {#if aCarregar}<span class="nota">a atualizar…</span>{/if}
      </div>
      <ul>
        {#each placas as p (p.id)}
          <li>
            <label>
              <input type="checkbox" checked={!escondidas[p.id]} onchange={(e) => onalternar(p.id, e.currentTarget.checked)} />
              <span class="amostra" style:background={css(p)} aria-hidden="true"></span>
              <span class="nome" title={p.nome}>{p.nome}</span>
              {#if vazias[p.id]}<span class="vazia">sem tinta</span>{/if}
            </label>
            <button class="solo" onclick={() => onsolo(p.id)} title="Mostrar só esta placa">só</button>
          </li>
        {/each}
      </ul>

      {#if avisos && (avisos.imagens || avisos.degrades || avisos.padroes || avisos.ambiguos)}
        <div class="avisos">
          <strong>Não separado nesta página</strong>
          <ul>
            {#if avisos.imagens}<li>{avisos.imagens} {avisos.imagens === 1 ? 'imagem não aparece' : 'imagens não aparecem'} nas placas{avisos.motivos.length ? ` (${avisos.motivos.join(', ')})` : ''}.</li>{/if}
            {#if avisos.degrades}<li>{avisos.degrades} {avisos.degrades === 1 ? 'degradé não aparece' : 'degradés não aparecem'}{avisos.motivosDegrades.length ? ` (${avisos.motivosDegrades.join(', ')})` : ''}.</li>{/if}
            {#if avisos.padroes}<li>{avisos.padroes} {avisos.padroes === 1 ? 'padrão não aparece' : 'padrões não aparecem'}{avisos.motivosDegrades.length ? ` (${avisos.motivosDegrades.join(', ')})` : ''}.</li>{/if}
            {#if avisos.ambiguos}<li>Há Forms usados com overprint diferente em sítios diferentes; só se simulou o primeiro.</li>{/if}
          </ul>
        </div>
      {/if}
      <p class="nota">É uma aproximação: transparências, modos de mistura e perfis de cor não são simulados. O leitor de cor continua a ler o objeto, não a placa.</p>
    {/if}
  {/if}
</div>

<style>
  .painel {
    padding: 10px 12px 14px;
  }
  .mestre {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    cursor: pointer;
  }
  .sub {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    cursor: pointer;
  }
  .nota {
    color: var(--texto-2);
    font-size: 12px;
    margin: 8px 0 0;
  }
  .erro {
    color: var(--erro);
    margin: 10px 0 0;
  }
  .acoes {
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 12px 0 8px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  li {
    display: flex;
    align-items: center;
  }
  li label {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 6px;
    cursor: pointer;
  }
  li label:hover {
    background: var(--superficie-2);
  }
  .amostra {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid var(--borda);
  }
  .nome {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .vazia {
    margin-left: auto;
    flex: none;
    font-size: 11px;
    color: var(--texto-2);
  }
  .solo {
    flex: none;
    font-size: 11px;
    padding: 1px 7px;
  }
  .avisos {
    margin-top: 12px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--aviso-fundo);
    color: var(--aviso);
    font-size: 12px;
  }
  .avisos ul {
    margin-top: 4px;
    padding-left: 16px;
    list-style: disc;
    display: block;
  }
</style>
