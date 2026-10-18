<script lang="ts">
  import type { Cor } from '../analise/ir';
  import { rgbParaCmykPrensa } from '../cores/conversao';
  import type { ObjetoVivo } from '../edicao/estado';
  import type { Cmyk } from '../edicao/tipos';

  /**
   * O cartão da edição de objetos: o que está selecionado (posição e medidas em mm, cores CMYK) e o que se pode fazer
   * (apagar, desfazer, refazer, guardar a cópia). Não sabe nada de PDF: mostra o que o pai lhe dá e devolve o que se escreveu.
   */
  interface Props {
    objeto: ObjetoVivo | null;
    /** Posição e medidas de agora, em mm, a contar do canto de cima à esquerda do corte */
    medidas: { x: number; y: number; l: number; a: number } | null;
    nEdicoes: number;
    podeRefazer: boolean;
    /** A ferramenta de edição está ativa (se não, o cartão é só o resumo das alterações) */
    aEditar: boolean;
    aGuardar: boolean;
    aoMedidas(m: Partial<{ x: number; y: number; l: number; a: number }>): void;
    aoCor(alvo: 'preenchimento' | 'traco', c: Cmyk): void;
    aoApagar(): void;
    aoDesfazer(): void;
    aoRefazer(): void;
    aoDescartar(): void;
    aoGuardar(): void;
  }
  let { objeto, medidas, nEdicoes, podeRefazer, aEditar, aGuardar, aoMedidas, aoCor, aoApagar, aoDesfazer, aoRefazer, aoDescartar, aoGuardar }: Props = $props();

  const NOMES = { forma: 'Forma', texto: 'Texto', imagem: 'Imagem', degrade: 'Degradé', grupo: 'Grupo' } as const;

  /** A cor em CMYK, para mostrar: as CMYK tal como são; cinza e RGB convertidos; o resto (spots…) não se sabe */
  function emCmyk(c: Cor | undefined): { valores: Cmyk; exata: boolean } | null {
    if (!c) return null;
    if (c.familia === 'CMYK' && c.valores.length === 4) return { valores: c.valores as Cmyk, exata: true };
    if (c.familia === 'Gray' && c.valores.length === 1) return { valores: [0, 0, 0, 1 - c.valores[0]], exata: false };
    if (c.familia === 'RGB' && c.valores.length === 3) return { valores: rgbParaCmykPrensa(c.valores[0], c.valores[1], c.valores[2]), exata: false };
    return { valores: [0, 0, 0, 0], exata: false };
  }
  const css = (c: Cmyk) => `rgb(${[0, 1, 2].map((i) => Math.round(255 * (1 - c[i]) * (1 - c[3]))).join(' ')})`;
  const pct = (v: number) => Math.round(v * 100);

  const fill = $derived(objeto && objeto.preenche && (objeto.tipo === 'forma' || objeto.tipo === 'texto') ? emCmyk(objeto.cor) : null);
  const traco = $derived(objeto && objeto.traca && objeto.tipo === 'forma' ? emCmyk(objeto.corTraco) : null);

  const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

  function mudouMedida(campo: 'x' | 'y' | 'l' | 'a', e: Event) {
    const v = (e.currentTarget as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(v)) aoMedidas({ [campo]: v });
  }
  function mudouCor(alvo: 'preenchimento' | 'traco', e: Event) {
    const linha = (e.currentTarget as HTMLElement).closest('.cor')!;
    const v = [...linha.querySelectorAll('input')].map((i) => Math.min(100, Math.max(0, i.valueAsNumber || 0)) / 100);
    aoCor(alvo, v as Cmyk);
  }
</script>

<div class="cartao" role="region" aria-label="Edição de objetos">
  <div class="topo">
    <strong>{aEditar ? 'Editar' : 'Edições'}</strong>
    <span class="conta">{nEdicoes} {nEdicoes === 1 ? 'alteração' : 'alterações'}</span>
    <span class="espaco"></span>
    <button type="button" class="ic" onclick={aoDesfazer} disabled={nEdicoes === 0} title="Desfazer (Ctrl/Cmd+Z)" aria-label="Desfazer">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></svg>
    </button>
    <button type="button" class="ic" onclick={aoRefazer} disabled={!podeRefazer} title="Refazer (Shift+Ctrl/Cmd+Z)" aria-label="Refazer">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h3" /></svg>
    </button>
  </div>

  {#if aEditar}
    {#if objeto && medidas}
      <div class="tipo">{NOMES[objeto.tipo]}</div>
      <div class="medidas">
        <label>X<input type="number" step="0.1" value={fmt(medidas.x)} onchange={(e) => mudouMedida('x', e)} aria-label="Posição X em mm" /></label>
        <label>Y<input type="number" step="0.1" value={fmt(medidas.y)} onchange={(e) => mudouMedida('y', e)} aria-label="Posição Y em mm" /></label>
        <label>L<input type="number" step="0.1" min="0.1" value={fmt(medidas.l)} onchange={(e) => mudouMedida('l', e)} aria-label="Largura em mm" /></label>
        <label>A<input type="number" step="0.1" min="0.1" value={fmt(medidas.a)} onchange={(e) => mudouMedida('a', e)} aria-label="Altura em mm" /></label>
        <span class="un">mm</span>
      </div>
      {#each [{ nome: 'Preenchimento', alvo: 'preenchimento' as const, c: fill }, { nome: 'Traço', alvo: 'traco' as const, c: traco }] as parte (parte.alvo)}
        {#if parte.c}
          <div class="cor">
            <span class="rotulo"><i class="amostra" style:background={css(parte.c.valores)}></i>{parte.nome}</span>
            {#each ['C', 'M', 'Y', 'K'] as letra, i (letra)}
              <label class="tinta">{letra}<input type="number" min="0" max="100" step="1" value={pct(parte.c.valores[i])} onchange={(e) => mudouCor(parte.alvo, e)} aria-label="{parte.nome}: {letra} em %" /></label>
            {/each}
            {#if !parte.c.exata}<span class="nota">Não é CMYK: ao mudares, passa a CMYK.</span>{/if}
          </div>
        {/if}
      {/each}
      <button type="button" class="apagar" onclick={aoApagar} title="Apagar (Delete)">Apagar objeto</button>
    {:else}
      <p class="dica">Clica num objeto para o selecionar. Arrasta para mover, usa as alças para mudar o tamanho (Shift mantém a proporção, Alt é a partir do centro). As setas empurram 0,1 mm (Shift: 1 mm) e Delete apaga.</p>
    {/if}
  {/if}

  {#if nEdicoes > 0}
    <div class="rodape">
      <button type="button" class="primario" onclick={aoGuardar} disabled={aGuardar}>{aGuardar ? 'A preparar…' : 'Guardar cópia editada'}</button>
      <button type="button" class="ligacao" onclick={aoDescartar}>Descartar tudo</button>
    </div>
  {/if}
</div>

<style>
  .cartao {
    position: absolute;
    right: 14px;
    top: 66px;
    z-index: 5;
    width: 256px;
    display: grid;
    gap: 8px;
    padding: 10px 12px 12px;
    font-size: 12.5px;
    background: color-mix(in srgb, var(--superficie) 92%, transparent);
    backdrop-filter: blur(14px);
    border: 1px solid var(--borda);
    border-radius: 16px;
    box-shadow: var(--sombra-cartao);
  }
  .topo {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .topo strong {
    font-size: 13px;
  }
  .conta {
    white-space: nowrap;
    color: var(--texto-2);
    font-variant-numeric: tabular-nums;
  }
  .espaco {
    flex: 1;
  }
  .ic,
  .ic:hover:not(:disabled) {
    width: 28px;
    height: 28px;
    padding: 0;
    display: grid;
    place-items: center;
    border-radius: 8px;
  }
  .tipo {
    font-weight: 600;
    color: var(--acento);
  }
  .medidas {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 8px;
    align-items: center;
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--texto-2);
  }
  .medidas input,
  .tinta input {
    width: 100%;
    min-width: 0;
    padding: 4px 6px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .un {
    grid-column: 1 / -1;
    justify-self: end;
    color: var(--texto-2);
    font-size: 11px;
    margin-top: -4px;
  }
  .cor {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .rotulo {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--texto-2);
  }
  .amostra {
    width: 16px;
    height: 16px;
    border-radius: 5px;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.25);
  }
  .tinta {
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    font-size: 11px;
  }
  .nota {
    grid-column: 1 / -1;
    font-size: 11px;
    color: var(--texto-2);
  }
  .apagar {
    justify-self: start;
    padding: 5px 12px;
    border-radius: 999px;
    color: var(--erro);
    border-color: color-mix(in srgb, var(--erro) 45%, transparent);
  }
  .dica {
    margin: 0;
    color: var(--texto-2);
    line-height: 1.45;
    font-size: 12px;
  }
  .rodape {
    display: grid;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid var(--borda);
  }
  .ligacao,
  .ligacao:hover:not(:disabled) {
    background: none;
    border: 0;
    color: var(--texto-2);
    font-size: 12px;
    padding: 2px;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
