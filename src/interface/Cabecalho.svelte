<script lang="ts">
  import type { Alerta } from '../alertas/tipos';
  import type { DocumentoInfo, PaginaInfo } from '../analise/documento';
  import { resumirSangria } from '../analise/resumo';
  import { identificarFormato } from '../comum/formatos';
  import { formatarMm } from '../comum/unidades';
  import { definicoes } from './definicoes.svelte';
  import PilulaEstado from './PilulaEstado.svelte';

  interface Props {
    nome: string;
    pagina: PaginaInfo | null;
    info: DocumentoInfo | null;
    alertas: Alerta[];
    onabrir: () => void;
    emAnalise?: boolean;
    progresso?: { feitas: number; total: number };
    /** Clicar na pílula de estado */
    onpilula?: () => void;
    /** Só no desktop com o modo notch ligado: a janela encolhe de volta para a pílula */
    onrecolher?: () => void;
  }
  let { nome, pagina, info, alertas, onabrir, emAnalise = false, progresso = { feitas: 0, total: 0 }, onpilula, onrecolher }: Props = $props();

  const formato = $derived(
    pagina
      ? identificarFormato(pagina.larguraMm, pagina.alturaMm, definicoes.formatos, definicoes.toleranciaFormatoMm)
      : null,
  );

  const sangria = $derived(
    pagina ? resumirSangria(pagina.sangriaMm, pagina.origemSangria, definicoes.sangriaReferenciaMm) : null,
  );

  /** A BleedBox pode dizer 3 mm e o desenho não lá chegar: o alerta de sangria desta página manda */
  const sangriaSemConteudo = $derived(
    !!pagina &&
      alertas.some(
        (a) => (a.id === 'sangria-ausente' || a.id === 'sangria-curta') && a.locais?.some((l) => l.pagina === pagina.indice),
      ),
  );

  const textoSangria = $derived.by(() => {
    if (!pagina || !sangria) return '';
    if (sangria.estado === 'sem-bleedbox') return 'Sem BleedBox';
    const s = pagina.sangriaMm;
    if (sangria.uniforme) return `Sangria ${formatarMm(s.esquerda)} mm`;
    return `Sangria E ${formatarMm(s.esquerda)} · D ${formatarMm(s.direita)} · C ${formatarMm(s.cima)} · B ${formatarMm(s.baixo)} mm`;
  });

  const tituloSangria = $derived(
    sangriaSemConteudo
      ? 'A BleedBox existe, mas há elementos que não chegam até ela. Vê os alertas.'
      : sangria?.estado === 'abaixo'
      ? `Abaixo da referência de ${formatarMm(definicoes.sangriaReferenciaMm)} mm`
      : sangria?.estado === 'ok'
        ? `Cumpre a referência de ${formatarMm(definicoes.sangriaReferenciaMm)} mm`
        : 'O ficheiro não define BleedBox, por isso não dá para medir a sangria',
  );

  const textoOrigem = $derived(
    pagina?.origemTrim === 'TrimBox'
      ? 'TrimBox definida'
      : pagina
        ? `Sem TrimBox, usa a ${pagina.origemTrim}`
        : '',
  );

  const contagem = $derived({
    erro: alertas.filter((a) => a.gravidade === 'erro').length,
    aviso: alertas.filter((a) => a.gravidade === 'aviso').length,
    info: alertas.filter((a) => a.gravidade === 'info').length,
  });

</script>

{#if info || onrecolher}
<header>
  <div class="titulo">
    <div class="nome" title={nome}>{nome}</div>
    {#if pagina}
      <div class="medida" aria-label="Medida final">
        <span class="valor">{formatarMm(pagina.larguraMm)} × {formatarMm(pagina.alturaMm)} mm</span>
        {#if formato}
          <span class="chip info">{formato.formato.nome}{formato.horizontal ? ' · horizontal' : ''}</span>
        {/if}
        <span class="chip neutro" class:aviso={pagina.origemTrim !== 'TrimBox'}>{textoOrigem}</span>
        {#if sangria}
          <span
            class="chip"
            class:ok={sangria.estado === 'ok' && !sangriaSemConteudo}
            class:aviso={sangria.estado === 'abaixo' || sangriaSemConteudo}
            class:neutro={sangria.estado === 'sem-bleedbox'}
            title={tituloSangria}>{textoSangria}{sangriaSemConteudo ? ' ⚠' : ''}</span
          >
        {/if}
        {#if info && info.paginas.length > 1}
          <span class="suave pequeno">pág. {pagina.indice + 1} de {info.paginas.length}</span>
        {/if}
      </div>
    {/if}
  </div>

  <div class="acoes">
    {#if info}
      <PilulaEstado aberto={true} {emAnalise} {progresso} {contagem} onclick={onpilula} />
      <button class="primario" onclick={onabrir}>Abrir PDF</button>
    {/if}
    {#if onrecolher}<button class="icone" onclick={onrecolher} title="Recolher para a notch" aria-label="Recolher para a notch">⌃</button>{/if}
  </div>
</header>
{/if}

<style>
  header {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 4px 6px 0 8px;
    min-height: 52px;
    position: relative;
  }
  .titulo {
    display: grid;
    gap: 5px;
    min-width: 0;
    flex: 1;
  }
  .nome {
    font-size: 20px;
    font-weight: 750;
    letter-spacing: -0.02em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .medida {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 8px;
    min-width: 0;
  }
  .valor {
    font-size: 13px;
    font-weight: 700;
    color: var(--texto-2);
    font-variant-numeric: tabular-nums;
    margin-right: 2px;
  }
  .chip {
    font-size: 12px;
    font-weight: 600;
    padding: 2px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .chip.info {
    background: var(--pastel-info);
    color: var(--pastel-info-t);
  }
  .chip.ok {
    background: var(--pastel-ok);
    color: var(--pastel-ok-t);
  }
  .chip.aviso {
    background: var(--pastel-aviso);
    color: var(--pastel-aviso-t);
  }
  .chip.neutro {
    background: var(--superficie-2);
    color: var(--texto-2);
  }
  .chip.neutro.aviso {
    background: var(--pastel-aviso);
    color: var(--pastel-aviso-t);
  }
  .suave {
    color: var(--texto-2);
  }
  .pequeno {
    font-size: 12px;
  }
  .acoes {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
  }
</style>
