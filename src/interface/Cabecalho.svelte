<script lang="ts">
  import type { Alerta } from '../alertas/tipos';
  import type { DocumentoInfo, PaginaInfo } from '../analise/documento';
  import { resumirSangria } from '../analise/resumo';
  import { identificarFormato } from '../comum/formatos';
  import { formatarMm } from '../comum/unidades';
  import { definicoes, type Tema } from './definicoes.svelte';
  import PilulaEstado from './PilulaEstado.svelte';

  interface Props {
    nome: string;
    pagina: PaginaInfo | null;
    info: DocumentoInfo | null;
    alertas: Alerta[];
    onabrir: () => void;
    ondefinicoes: () => void;
    onrelatorio?: () => void;
    onajuda?: () => void;
    emAnalise?: boolean;
    progresso?: { feitas: number; total: number };
    /** Clicar na pílula de estado */
    onpilula?: () => void;
  }
  let { nome, pagina, info, alertas, onabrir, ondefinicoes, onrelatorio, onajuda, emAnalise = false, progresso = { feitas: 0, total: 0 }, onpilula }: Props = $props();

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

  const proximoTema: Record<Tema, Tema> = { auto: 'claro', claro: 'escuro', escuro: 'auto' };
  const rotuloTema: Record<Tema, string> = { auto: 'Tema: automático', claro: 'Tema: claro', escuro: 'Tema: escuro' };
  const simboloTema: Record<Tema, string> = { auto: '◐', claro: '☀', escuro: '☾' };
</script>

<header>
  <div class="marca-app" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="26" height="26">
      <defs>
        <linearGradient id="g-logo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ee0ff" /><stop offset="1" stop-color="#8b7bff" /></linearGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill="url(#g-logo)" />
      <!-- marcas de corte: o sinal do ofício -->
      <path d="M8 5.5v10.5h10.5M5.5 8h2.5M16 18.5v-2.5" fill="none" stroke="#04121a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </div>
  <div class="nome" title={nome}>
    {#if nome}{nome}{:else}<strong class="marca-nome">Arte Final</strong>{/if}
  </div>

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

  <div class="acoes">
    <PilulaEstado aberto={!!info} {emAnalise} {progresso} {contagem} onclick={onpilula} />
    <button class="icone" title={rotuloTema[definicoes.tema]} aria-label={rotuloTema[definicoes.tema]} onclick={() => (definicoes.tema = proximoTema[definicoes.tema])}>
      {simboloTema[definicoes.tema]}
    </button>
    {#if onajuda}<button class="icone" onclick={onajuda} title="Atalhos de teclado (?)" aria-label="Atalhos de teclado">?</button>{/if}
    {#if info && onrelatorio}<button onclick={onrelatorio} title="Abre um relatório para o cliente, pronto a imprimir ou guardar em PDF">Relatório</button>{/if}
    <button onclick={ondefinicoes}>Definições</button>
    <button class="primario" onclick={onabrir}>Abrir</button>
  </div>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px 16px;
    background: var(--superficie);
    border-bottom: 1px solid var(--borda);
    min-height: 56px;
    position: relative;
  }
  .marca-app {
    display: grid;
    margin-right: -10px;
    filter: drop-shadow(0 0 12px rgb(94 224 255 / 0.35));
  }
  .marca-nome {
    letter-spacing: -0.01em;
  }
  .nome {
    font-weight: 600;
    max-width: 24ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .medida {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }
  .valor {
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    margin-right: 2px;
  }
  .chip {
    font-size: 12px;
    font-weight: 600;
    padding: 2px 9px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .chip.info {
    background: var(--info-fundo);
    color: var(--info);
  }
  .chip.ok {
    background: var(--ok-fundo);
    color: var(--ok);
  }
  .chip.aviso {
    background: var(--aviso-fundo);
    color: var(--aviso);
  }
  .chip.neutro {
    background: var(--superficie-2);
    color: var(--texto-2);
  }
  .chip.neutro.aviso {
    background: var(--aviso-fundo);
    color: var(--aviso);
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
    gap: 8px;
    margin-left: auto;
  }
</style>
