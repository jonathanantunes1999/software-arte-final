<script lang="ts">
  import type { Alerta } from '../alertas/tipos';
  import { VERIFICACOES } from '../alertas/registo';
  import { definicoes } from './definicoes.svelte';
  import type { DocumentoInfo } from '../analise/documento';
  import { correcaoDoAlerta, type TipoCorrecao } from '../alertas/correcao-sugerida';
  import Mascote, { type EstadoMascote } from './Mascote.svelte';

  interface Props {
    info: DocumentoInfo | null;
    alertas: Alerta[];
    emAnalise: boolean;
    progresso: { feitas: number; total: number };
    /** Procura de QR codes, que corre depois da análise */
    qr: { emCurso: boolean; feitas: number; total: number; limitado: boolean; limite: number };
    /** Limitações encontradas ao analisar (ex.: padrões não lidos por dentro) */
    avisos: string[];
    ativo: { id: string; indice: number } | null;
    onselecionar: (a: Alerta) => void;
    /** "Corrigir" num alerta com correção automática */
    oncorrigir?: (tipo: TipoCorrecao) => void;
    /** O botão só aparece se a correção tiver mesmo algo para fazer neste ficheiro */
    podeCorrigir?: (tipo: TipoCorrecao) => boolean;
    /** O rato entrou (id) ou saiu (null) de um alerta: a página destaca os seus locais */
    onpassar?: (id: string | null) => void;
  }
  let { info, alertas, emAnalise, progresso, qr, avisos, ativo, onselecionar, oncorrigir, podeCorrigir = () => true, onpassar }: Props = $props();

  // o alerta selecionado a partir da página (clique numa marca) aparece na lista
  $effect(() => {
    const id = ativo?.id;
    if (!id) return;
    requestAnimationFrame(() => document.getElementById(`alerta-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  });

  type Filtro = 'todos' | 'erro' | 'aviso' | 'info';
  let filtro = $state<Filtro>('todos');

  const simbolo = { erro: '✕', aviso: '!', info: 'i' } as const;
  const rotulo = { erro: 'Erro', aviso: 'Aviso', info: 'Informação' } as const;

  const contagem = $derived({
    erro: alertas.filter((a) => a.gravidade === 'erro').length,
    aviso: alertas.filter((a) => a.gravidade === 'aviso').length,
    info: alertas.filter((a) => a.gravidade === 'info').length,
  });
  // um filtro sem nada (ex.: outro ficheiro, sem avisos) não pode esconder os alertas todos
  const filtroAtual = $derived<Filtro>(filtro !== 'todos' && !alertas.some((a) => a.gravidade === filtro) ? 'todos' : filtro);
  const visiveis = $derived(filtroAtual === 'todos' ? alertas : alertas.filter((a) => a.gravidade === filtroAtual));
  const estado = $derived(
    emAnalise
      ? { classe: 'a-analisar', titulo: 'A analisar…', detalhe: '' }
      : contagem.erro
        ? { classe: 'erro', titulo: 'Precisa de correções', detalhe: `${contagem.erro} ${contagem.erro === 1 ? 'erro' : 'erros'}${contagem.aviso ? ` e ${contagem.aviso} ${contagem.aviso === 1 ? 'aviso' : 'avisos'}` : ''}` }
        : contagem.aviso
          ? { classe: 'aviso', titulo: 'Quase pronto', detalhe: `${contagem.aviso} ${contagem.aviso === 1 ? 'aviso' : 'avisos'} a rever` }
          : { classe: 'ok', titulo: 'Sem problemas encontrados', detalhe: contagem.info ? `${contagem.info} ${contagem.info === 1 ? 'nota' : 'notas'} informativas` : 'Nas verificações ativas' },
  );
  const estadoMascote = $derived<EstadoMascote>(estado.classe === 'a-analisar' ? 'analisa' : (estado.classe as EstadoMascote));
  const percentagem = $derived(progresso.total ? Math.round((progresso.feitas / progresso.total) * 100) : 0);
  const percentagemQr = $derived(qr.total ? Math.round((qr.feitas / qr.total) * 100) : 0);
</script>

<div class="painel">
  <h2>
    Alertas
    {#if contagem.erro}<span class="contagem erro" title="Erros">{contagem.erro}</span>{/if}
    {#if contagem.aviso}<span class="contagem aviso" title="Avisos">{contagem.aviso}</span>{/if}
  </h2>

  {#if !info}
    <p class="vazio">Abre um PDF para ver os alertas.</p>
  {:else}
    <div class="estado {estado.classe}" role="status">
      <span class="estado-icone"><Mascote tamanho={52} estado={estadoMascote} titulo={estado.titulo} /></span>
      <div>
        <strong>{estado.titulo}</strong>
        {#if estado.detalhe}<span>{estado.detalhe}</span>{/if}
      </div>
    </div>

    {#if alertas.length > 1}
      <div class="filtros" role="group" aria-label="Filtrar alertas">
        <button class:ativo={filtroAtual === 'todos'} onclick={() => (filtro = 'todos')}>Todos <em>{alertas.length}</em></button>
        {#if contagem.erro}<button class:ativo={filtroAtual === 'erro'} onclick={() => (filtro = 'erro')}>Erros <em>{contagem.erro}</em></button>{/if}
        {#if contagem.aviso}<button class:ativo={filtroAtual === 'aviso'} onclick={() => (filtro = 'aviso')}>Avisos <em>{contagem.aviso}</em></button>{/if}
        {#if contagem.info}<button class:ativo={filtroAtual === 'info'} onclick={() => (filtro = 'info')}>Notas <em>{contagem.info}</em></button>{/if}
      </div>
    {/if}

    {#if emAnalise}
      <div class="progresso" role="status">
        <div class="trilho"><div class="enchimento" style:width="{percentagem}%"></div></div>
        <span>A analisar{progresso.total > 1 ? ` ${progresso.feitas}/${progresso.total}` : '…'}</span>
      </div>
    {/if}

    {#if qr.emCurso}
      <div class="progresso" role="status">
        <div class="trilho"><div class="enchimento" style:width="{percentagemQr}%"></div></div>
        <span>A procurar QR codes {qr.feitas}/{qr.total}</span>
      </div>
    {/if}

    <ul>
      {#each visiveis as a (a.id)}
        {@const n = a.locais?.length ?? 0}
        {@const selecionado = ativo?.id === a.id}
        {@const correcao = correcaoDoAlerta(a.id)}
        <!-- o hover só alimenta o destaque na página; o foco por teclado faz o mesmo -->
        <li id="alerta-{a.id}" class="cartao" class:selecionado onmouseenter={() => onpassar?.(a.id)} onmouseleave={() => onpassar?.(null)} onfocusin={() => onpassar?.(a.id)} onfocusout={() => onpassar?.(null)}>
          <button class="alerta {a.gravidade}" class:selecionado onclick={() => onselecionar(a)} aria-pressed={selecionado}>
            <span class="icone" title={rotulo[a.gravidade]} aria-label={rotulo[a.gravidade]}>{simbolo[a.gravidade]}</span>
            <span class="texto">
              <strong><span class="num" title="Número na página">{alertas.indexOf(a) + 1}</span> {a.titulo}</strong>
              {#if a.detalhe}<span class="detalhe">{a.detalhe}</span>{/if}
              {#if n > 0}
                <span class="locais">
                  {#if selecionado && n > 1}Local {ativo!.indice + 1} de {n} · clica para o seguinte
                  {:else if selecionado}A mostrar o local
                  {:else}{n === 1 ? 'Ver o local' : `Ver os ${n} locais`}{/if}
                </span>
              {/if}
            </span>
          </button>
          {#if correcao && oncorrigir && podeCorrigir(correcao.tipo)}
            <div class="acao">
              <button class="corrigir" onclick={() => oncorrigir(correcao.tipo)}>✦ {correcao.rotulo}</button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    {#if !emAnalise && alertas.length === 0}
      <p class="ok">Sem alertas nas verificações ativas.</p>
    {/if}

    <p class="cobertura">
      <strong>Verificações ativas:</strong> {[...VERIFICACOES.ativas, ...(definicoes.revisarTexto ? ['texto em PT-PT (por regras)'] : [])].join(', ')}.<br />
      {#if VERIFICACOES.porFazer.length}<strong>Ainda por fazer:</strong> {VERIFICACOES.porFazer.join(', ')}.{/if}
      Sem alertas aqui não quer dizer que o ficheiro está pronto.
    </p>

    {#if qr.limitado}
      <p class="cobertura">
        <strong>QR codes:</strong> só procurei nas primeiras {qr.limite} páginas com gráficos ou imagens.
      </p>
    {/if}

    {#if avisos.length}
      <p class="cobertura">
        <strong>Limitações desta análise:</strong>
        {avisos.join(' · ')}
      </p>
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
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .contagem {
    border-radius: 999px;
    padding: 0 7px;
    font-size: 11px;
  }
  .contagem.erro {
    background: var(--erro-fundo);
    color: var(--erro);
  }
  .contagem.aviso {
    background: var(--aviso-fundo);
    color: var(--aviso);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .cartao {
    border: 1px solid var(--borda);
    border-radius: 8px;
    background: var(--superficie);
    overflow: hidden;
  }
  .cartao.selecionado {
    border-color: var(--acento);
    background: var(--info-fundo);
  }
  .alerta {
    display: flex;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 9px 10px;
    align-items: flex-start;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .acao {
    padding: 0 10px 9px 40px;
  }
  .corrigir {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    border-color: var(--acento);
    color: var(--acento);
    background: transparent;
  }
  .corrigir:hover {
    background: var(--acento);
    color: var(--acento-texto);
  }
  .estado {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    margin: 0 0 10px;
  }
  .estado div {
    display: grid;
  }
  .estado span:not(.estado-icone) {
    font-size: 12px;
    opacity: 0.85;
  }
  .estado-icone {
    flex: none;
    width: 52px;
    height: 52px;
    margin: -6px -4px -6px -6px;
    display: grid;
    place-items: center;
  }
  .estado.erro {
    background: var(--erro-fundo);
    --cor-estado: var(--erro);
  }
  .estado.aviso {
    background: var(--aviso-fundo);
    --cor-estado: var(--aviso);
  }
  .estado.ok {
    background: var(--ok-fundo);
    --cor-estado: var(--ok);
  }
  .estado.a-analisar {
    background: var(--superficie-2);
    --cor-estado: var(--texto-2);
  }
  .filtros {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0 0 10px;
  }
  .filtros button {
    font-size: 12px;
    padding: 2px 9px;
    border-radius: 999px;
  }
  .filtros button.ativo {
    background: var(--acento);
    border-color: var(--acento);
    color: var(--acento-texto);
  }
  .filtros em {
    font-style: normal;
    opacity: 0.7;
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
  .num {
    display: inline-block;
    min-width: 16px;
    padding: 0 4px;
    margin-right: 2px;
    border-radius: 8px;
    background: var(--superficie-2);
    color: var(--texto-2);
    font-size: 11px;
    text-align: center;
    font-weight: 600;
  }
  .texto {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .detalhe {
    color: var(--texto-2);
    font-size: 12px;
    white-space: pre-line;
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }
  .locais {
    font-size: 12px;
    color: var(--acento);
    font-weight: 600;
  }
  .vazio,
  .ok {
    color: var(--texto-2);
    margin: 4px;
    font-size: 13px;
  }
  .ok {
    color: var(--ok);
  }
  .cobertura {
    margin: 16px 4px 0;
    padding-top: 12px;
    border-top: 1px solid var(--borda);
    color: var(--texto-2);
    font-size: 12px;
    line-height: 1.5;
  }
  .progresso {
    display: grid;
    gap: 4px;
    margin: 0 4px 10px;
    font-size: 12px;
    color: var(--texto-2);
  }
  .trilho {
    height: 4px;
    border-radius: 2px;
    background: var(--superficie-2);
    overflow: hidden;
  }
  .enchimento {
    height: 100%;
    background: var(--acento);
    transition: width 0.15s;
  }
</style>
