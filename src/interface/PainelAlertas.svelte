<script lang="ts">
  import type { Alerta } from '../alertas/tipos';
  import { VERIFICACOES } from '../alertas/registo';
  import type { DocumentoInfo } from '../analise/documento';

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
  }
  let { info, alertas, emAnalise, progresso, qr, avisos, ativo, onselecionar }: Props = $props();

  const simbolo = { erro: '✕', aviso: '!', info: 'i' } as const;
  const rotulo = { erro: 'Erro', aviso: 'Aviso', info: 'Informação' } as const;

  const contagem = $derived({
    erro: alertas.filter((a) => a.gravidade === 'erro').length,
    aviso: alertas.filter((a) => a.gravidade === 'aviso').length,
  });
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
      {#each alertas as a (a.id)}
        {@const n = a.locais?.length ?? 0}
        {@const selecionado = ativo?.id === a.id}
        <li>
          <button class="alerta {a.gravidade}" class:selecionado onclick={() => onselecionar(a)} aria-pressed={selecionado}>
            <span class="icone" title={rotulo[a.gravidade]} aria-label={rotulo[a.gravidade]}>{simbolo[a.gravidade]}</span>
            <span class="texto">
              <strong>{a.titulo}</strong>
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
        </li>
      {/each}
    </ul>

    {#if !emAnalise && alertas.length === 0}
      <p class="ok">Sem alertas nas verificações ativas.</p>
    {/if}

    <p class="cobertura">
      <strong>Verificações ativas:</strong> {VERIFICACOES.ativas.join(', ')}.<br />
      <strong>Ainda por fazer:</strong> {VERIFICACOES.porFazer.join(', ')}.
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
  .alerta {
    display: flex;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 9px 10px;
    align-items: flex-start;
  }
  .alerta.selecionado {
    border-color: var(--acento);
    background: var(--info-fundo);
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
