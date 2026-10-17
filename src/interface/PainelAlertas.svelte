<script lang="ts">
  import type { Alerta } from '../alertas/tipos';
  import { VERIFICACOES } from '../alertas/registo';
  import { definicoes } from './definicoes.svelte';
  import type { DocumentoInfo } from '../analise/documento';
  import { correcaoDoAlerta, type TipoCorrecao } from '../alertas/correcao-sugerida';
  import Mascote from './Mascote.svelte';
  import type { EstadoMascote } from '../mascote/expressoes';
  import { topicoDoAlerta } from '../ajuda/conhecimento';
  import { formatar } from '../ajuda/formatar';

  interface Props {
    info: DocumentoInfo | null;
    alertas: Alerta[];
    emAnalise: boolean;
    progresso: { feitas: number; total: number };
    /** Procura de QR codes, que corre depois da análise */
    qr: { emCurso: boolean; feitas: number; total: number; limitado: boolean; limite: number };
    /** A aplicar correções (a mascote põe-se a trabalhar) */
    aCorrigir?: boolean;
    /** Limitações encontradas ao analisar (ex.: padrões não lidos por dentro) */
    avisos: string[];
    ativo: { id: string; indice: number } | null;
    onselecionar: (a: Alerta) => void;
    /** "Corrigir" num alerta com correção automática */
    oncorrigir?: (tipo: TipoCorrecao | 'tudo') => void;
    /** O botão só aparece se a correção tiver mesmo algo para fazer neste ficheiro */
    podeCorrigir?: (tipo: TipoCorrecao) => boolean;
    /** O rato entrou (id) ou saiu (null) de um alerta: a página destaca os seus locais */
    onpassar?: (id: string | null) => void;
    /** Abre a Ajuda no tópico do glossário */
    onajuda?: (topico: string) => void;
  }
  let { info, alertas, emAnalise, progresso, qr, aCorrigir = false, avisos, ativo, onselecionar, oncorrigir, podeCorrigir = () => true, onpassar, onajuda }: Props = $props();

  // o alerta selecionado a partir da página (clique numa marca) aparece na lista
  $effect(() => {
    const id = ativo?.id;
    if (!id) return;
    requestAnimationFrame(() => document.getElementById(`alerta-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  });

  /** Os alertas cuja explicação ("O que é isto?") está aberta */
  let explicados = $state<Record<string, boolean>>({});
  /** Há mais de um tipo de correção possível? Então vale a pena o "Corrigir tudo" */
  const tiposCorrigiveis = $derived(new Set(alertas.map((a) => correcaoDoAlerta(a.id)).filter((c) => c && podeCorrigir(c.tipo)).map((c) => c!.tipo)));
  /** O "Corrigir tudo" não inclui as marcas de corte nem o texto em curvas: mudam o tamanho da página e a edição do texto */
  const podeTudo = $derived([...tiposCorrigiveis].filter((t) => t !== 'marcas' && t !== 'curvas' && t !== 'faca-em-spot').length >= 2);

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
  const estadoMascote = $derived<EstadoMascote>(aCorrigir ? 'trabalha' : emAnalise ? 'analisa' : qr.emCurso ? 'procura' : (estado.classe as EstadoMascote));
  const percentagem = $derived(progresso.total ? Math.round((progresso.feitas / progresso.total) * 100) : 0);
  const percentagemQr = $derived(qr.total ? Math.round((qr.feitas / qr.total) * 100) : 0);
</script>

<div class="painel">
  {#if !info}
    <p class="vazio">Abre um PDF para ver os alertas.</p>
  {:else}
    <div class="estado {estado.classe}" role="status">
      {#if definicoes.mascote.visivel && definicoes.mascote.alertas}
        <span class="estado-icone"><Mascote tamanho={56} estado={estadoMascote} titulo={estado.titulo} /></span>
      {:else}
        <span class="estado-simbolo" aria-hidden="true">{estado.classe === 'erro' ? '✕' : estado.classe === 'aviso' ? '!' : estado.classe === 'ok' ? '✓' : '…'}</span>
      {/if}
      <div>
        <strong>{estado.titulo}</strong>
        {#if estado.detalhe}<span>{estado.detalhe}</span>{/if}
      </div>
    </div>

    {#if alertas.length > 1}
      <div class="filtros" role="group" aria-label="Filtrar alertas">
        {#each [['erro', 'Erros', contagem.erro], ['aviso', 'Avisos', contagem.aviso], ['info', 'Notas', contagem.info]] as [g, nomeG, n] (g)}
          {#if n}
            <button class="tile {g}" class:ativo={filtroAtual === g} aria-pressed={filtroAtual === g} onclick={() => (filtro = filtroAtual === g ? 'todos' : (g as typeof filtro))}>
              <span class="n">{n}</span>
              <span class="rot">{nomeG}</span>
            </button>
          {/if}
        {/each}
      </div>
    {/if}

    {#if podeTudo && oncorrigir && !emAnalise}
      <button type="button" class="tudo" onclick={() => oncorrigir('tudo')} title="Abre as Correções com tudo o que é seguro já marcado: só aplicas depois de veres">Corrigir tudo o que é seguro</button>
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
        <li id="alerta-{a.id}" class="cartao {a.gravidade}" class:selecionado onmouseenter={() => onpassar?.(a.id)} onmouseleave={() => onpassar?.(null)} onfocusin={() => onpassar?.(a.id)} onfocusout={() => onpassar?.(null)}>
          <button class="alerta {a.gravidade}" class:selecionado onclick={() => onselecionar(a)} aria-pressed={selecionado}>
            <span class="icone" title={rotulo[a.gravidade]} aria-label={rotulo[a.gravidade]}>{alertas.indexOf(a) + 1}</span>
            <span class="texto">
              <strong>{a.titulo}</strong>
              {#if a.detalhe}<span class="detalhe" class:aberto={selecionado}>{a.detalhe}</span>{/if}
              {#if n > 0}
                <span class="locais">
                  {#if selecionado && n > 1}Local {ativo!.indice + 1} de {n} · clica para o seguinte
                  {:else if selecionado}A mostrar o local
                  {:else}{n === 1 ? 'Ver o local' : `Ver os ${n} locais`}{/if}
                </span>
              {/if}
            </span>
          </button>
          {#if (correcao && oncorrigir && podeCorrigir(correcao.tipo)) || (selecionado && topicoDoAlerta(a.id))}
            {@const topico = topicoDoAlerta(a.id)}
            <div class="acao">
              {#if correcao && oncorrigir && podeCorrigir(correcao.tipo)}
                <button class="corrigir" onclick={() => oncorrigir(correcao.tipo)}>{correcao.rotulo}</button>
              {/if}
              {#if selecionado && topico}
                <button class="explicar" aria-expanded={!!explicados[a.id]} onclick={() => (explicados[a.id] = !explicados[a.id])}>O que é isto?</button>
              {/if}
            </div>
            {#if selecionado && topico && explicados[a.id]}
              <div class="explicacao">
                {#each formatar(topico.texto) as par, i (i)}
                  <p>{#each par as linha, j (j)}{#if j > 0}<br />{/if}{#each linha as pe, k (k)}{#if pe.negrito}<b>{pe.texto}</b>{:else}{pe.texto}{/if}{/each}{/each}</p>
                {/each}
                {#if onajuda}<button class="mais" onclick={() => onajuda(topico.id)}>Ver no glossário</button>{/if}
              </div>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>

    {#if !emAnalise && alertas.length === 0}
      <p class="ok">Sem alertas nas verificações ativas.</p>
    {/if}

    <details class="sobre">
      <summary>Sobre esta análise</summary>
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
    </details>
  {/if}
</div>

<style>
  .painel {
    padding: 4px 8px 18px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .cartao {
    border: 1.5px solid transparent;
    border-radius: var(--raio-2);
    background: var(--superficie-2);
    overflow: hidden;
    transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  }
  .cartao:hover {
    border-color: var(--borda);
  }
  .cartao.selecionado {
    border-color: var(--acento);
    background: var(--superficie);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--acento) 18%, transparent);
  }
  .alerta {
    display: flex;
    gap: 12px;
    width: 100%;
    text-align: left;
    padding: 12px 12px 10px;
    align-items: flex-start;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .alerta:hover:not(:disabled),
  .alerta.selecionado:hover:not(:disabled) {
    background: transparent;
  }
  .acao {
    padding: 0 12px 12px 52px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .explicar,
  .explicar:hover:not(:disabled) {
    font-size: 12px;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 999px;
    border-color: var(--borda);
    background: transparent;
    color: var(--texto-2);
  }
  .explicar[aria-expanded='true'] {
    color: var(--texto);
    background: var(--superficie-2);
  }
  .explicacao {
    margin: -2px 12px 12px 52px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--superficie-2);
    font-size: 12.5px;
    line-height: 1.5;
  }
  .explicacao p {
    margin: 0 0 6px;
  }
  .mais,
  .mais:hover:not(:disabled) {
    border: 0;
    background: none;
    padding: 0;
    font-size: 12px;
    font-weight: 700;
    color: var(--acento);
  }
  .tudo,
  .tudo:hover:not(:disabled) {
    width: 100%;
    margin: 0 0 12px;
    padding: 9px 14px;
    border-radius: 999px;
    border-color: transparent;
    background: var(--primario);
    color: var(--primario-texto);
    font-weight: 700;
    font-size: 13px;
  }
  .corrigir {
    font-size: 12px;
    font-weight: 700;
    padding: 5px 12px;
    border-radius: 999px;
    border-color: transparent;
    background: var(--primario);
    color: var(--primario-texto);
  }
  .corrigir:hover:not(:disabled) {
    background: var(--primario);
    filter: brightness(1.12);
    box-shadow: var(--primario-sombra);
  }
  .estado {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: var(--raio-2);
    margin: 0 0 12px;
    background: var(--fundo-estado);
    color: var(--cor-t);
  }
  .estado div {
    display: grid;
    gap: 1px;
  }
  .estado strong {
    font-size: 15px;
  }
  .estado span:not(.estado-icone):not(.estado-simbolo) {
    font-size: 12.5px;
    opacity: 0.85;
  }
  .estado-simbolo {
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-weight: 800;
    background: var(--cor-estado);
    color: #fff;
  }
  .estado-icone {
    flex: none;
    width: 56px;
    height: 56px;
    margin: -6px -4px -6px -6px;
    display: grid;
    place-items: center;
  }
  .estado.erro {
    --fundo-estado: var(--pastel-erro);
    --cor-t: var(--pastel-erro-t);
    --cor-estado: var(--erro);
  }
  .estado.aviso {
    --fundo-estado: var(--pastel-aviso);
    --cor-t: var(--pastel-aviso-t);
    --cor-estado: var(--aviso);
  }
  .estado.ok {
    --fundo-estado: var(--pastel-ok);
    --cor-t: var(--pastel-ok-t);
    --cor-estado: var(--ok);
  }
  .estado.a-analisar {
    --fundo-estado: var(--superficie-2);
    --cor-t: var(--texto);
    --cor-estado: var(--texto-2);
  }
  /* os números grandes são os filtros: um clique mostra só esses */
  .filtros {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 8px;
    margin: 0 0 14px;
  }
  .tile {
    display: grid;
    gap: 0;
    justify-items: start;
    text-align: left;
    padding: 10px 12px 9px;
    border-radius: var(--raio-2);
    border: 2px solid transparent;
    background: var(--fundo-tile);
    color: var(--cor-tile);
  }
  .tile:hover:not(:disabled) {
    background: var(--fundo-tile);
    filter: brightness(0.97);
  }
  .tile.ativo,
  .tile.ativo:hover:not(:disabled) {
    border-color: var(--cor-tile);
  }
  .tile .n {
    font-size: 26px;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }
  .tile .rot {
    font-size: 12px;
    font-weight: 600;
    opacity: 0.85;
  }
  .tile.erro {
    --fundo-tile: var(--pastel-erro);
    --cor-tile: var(--pastel-erro-t);
  }
  .tile.aviso {
    --fundo-tile: var(--pastel-aviso);
    --cor-tile: var(--pastel-aviso-t);
  }
  .tile.info {
    --fundo-tile: var(--pastel-info);
    --cor-tile: var(--pastel-info-t);
  }
  .icone {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .alerta.erro .icone {
    background: var(--pastel-erro);
    color: var(--pastel-erro-t);
  }
  .alerta.aviso .icone {
    background: var(--pastel-aviso);
    color: var(--pastel-aviso-t);
  }
  .alerta.info .icone {
    background: var(--pastel-info);
    color: var(--pastel-info-t);
  }
  .texto {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .texto strong {
    font-size: 14px;
    line-height: 1.3;
  }
  .detalhe {
    color: var(--texto-2);
    font-size: 12.5px;
    white-space: pre-line;
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  /* só o alerta escolhido mostra o texto todo */
  .detalhe.aberto {
    display: block;
    overflow: visible;
  }
  .locais {
    font-size: 12px;
    color: var(--acento);
    font-weight: 700;
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
  .sobre {
    margin: 18px 4px 0;
    font-size: 12px;
    color: var(--texto-2);
  }
  .sobre summary {
    cursor: pointer;
    font-weight: 600;
    list-style: none;
  }
  .sobre summary::before {
    content: '+ ';
  }
  .sobre[open] summary::before {
    content: '– ';
  }
  .cobertura {
    margin: 10px 0 0;
    line-height: 1.5;
  }
  .progresso {
    display: grid;
    gap: 4px;
    margin: 0 4px 12px;
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
