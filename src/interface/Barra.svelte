<script lang="ts">
  import { definicoes, type Tema } from './definicoes.svelte';
  import { GRUPOS, SECCOES, type Seccao } from './seccoes';
  import { CATEGORIAS, type Categoria } from '../correcoes/categorias';

  interface Props {
    /** Sem ficheiro aberto só há o que não depende dele */
    temFicheiro: boolean;
    seccao: Seccao;
    /** O painel está aberto? Clicar na secção ativa fecha-o */
    painelAberto: boolean;
    erros: number;
    avisos: number;
    numeroLayers: number;
    onescolher: (s: Seccao) => void;
    onrelatorio: () => void;
    ondefinicoes: () => void;
    onajuda: () => void;
    /** As categorias de correções, por baixo de "Correções", com o que há para corrigir em cada uma */
    categoria?: Categoria;
    contagensCategorias?: Record<Categoria, number>;
    oncategoria?: (c: Categoria) => void;
  }
  let { temFicheiro, seccao, painelAberto, erros, avisos, numeroLayers, onescolher, onrelatorio, ondefinicoes, onajuda, categoria = 'tudo', contagensCategorias, oncategoria }: Props = $props();

  const proximoTema: Record<Tema, Tema> = { auto: 'claro', claro: 'escuro', escuro: 'auto' };
  const rotuloTema: Record<Tema, string> = { auto: 'Tema: automático', claro: 'Tema: claro', escuro: 'Tema: escuro' };
  const simboloTema: Record<Tema, string> = { auto: '◐', claro: '☀', escuro: '☾' };

  const porId = Object.fromEntries(SECCOES.map((s) => [s.id, s])) as Record<Seccao, (typeof SECCOES)[number]>;

  function contagem(id: Seccao): { n: number; classe: string } | null {
    if (id === 'alertas') return erros ? { n: erros, classe: 'erro' } : avisos ? { n: avisos, classe: 'aviso' } : null;
    if (id === 'layers' && numeroLayers) return { n: numeroLayers, classe: 'neutro' };
    return null;
  }
</script>

<nav class="barra" aria-label="Principal">
  <div class="marca">
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
      <defs><linearGradient id="g-logo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ee0ff" /><stop offset="1" stop-color="#8b7bff" /></linearGradient></defs>
      <rect width="24" height="24" rx="7" fill="url(#g-logo)" />
      <!-- marcas de corte: o sinal do ofício -->
      <path d="M8 5.5v10.5h10.5M5.5 8h2.5M16 18.5v-2.5" fill="none" stroke="#04121a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span class="nome">Arte Final</span>
  </div>

  {#if temFicheiro}
    {#each GRUPOS as g (g.titulo)}
      <div class="grupo" role="group" aria-label={g.titulo}>
        <span class="titulo-grupo">{g.titulo}</span>
        {#each g.ids as id (id)}
          {@const c = contagem(id)}
          <button class="item" class:ativo={seccao === id && painelAberto} aria-pressed={seccao === id && painelAberto} title={porId[id].dica} onclick={() => onescolher(id)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              {#if id === 'alertas'}<path d="M12 3.5l9 15.5H3z" /><path d="M12 10v4.2" /><circle cx="12" cy="16.9" r="0.6" fill="currentColor" />
              {:else if id === 'correcoes'}<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3.5 17.5a1.4 1.4 0 000 2l1 1a1.4 1.4 0 002 0l5.8-5.8a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />
              {:else if id === 'separacoes'}<circle cx="9" cy="9.5" r="5.2" /><circle cx="15" cy="9.5" r="5.2" /><circle cx="12" cy="14.5" r="5.2" />
              {:else if id === 'layers'}<path d="M12 3.5l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" />
              {:else}<path d="M7 3v14h14" /><path d="M3 7h4M17 21v-4" />{/if}
            </svg>
            <span class="rotulo">{porId[id].nome}</span>
            {#if c}<span class="contagem {c.classe}">{c.n}</span>{/if}
          </button>
          {#if id === 'correcoes' && seccao === 'correcoes' && painelAberto && oncategoria}
            <div class="sub" role="group" aria-label="Categorias de correções">
              {#each CATEGORIAS as cat (cat.id)}
                {@const n = contagensCategorias?.[cat.id] ?? 0}
                <button type="button" class="sub-item" class:ativa={categoria === cat.id} class:vazia={n === 0 && cat.id !== 'tudo'} aria-pressed={categoria === cat.id} title={cat.dica} onclick={() => oncategoria(cat.id)}>
                  <span class="sub-nome">{cat.nome}</span>
                  {#if n}<span class="sub-n">{n}</span>{/if}
                </button>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    {/each}
  {/if}

  <div class="fundo">
    {#if temFicheiro}
      <button class="item" onclick={onrelatorio} title="Abre um relatório para o cliente, pronto a imprimir ou guardar em PDF">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></svg>
        <span class="rotulo">Relatório</span>
      </button>
    {/if}
    <button class="item" onclick={ondefinicoes} title="Definições e mascote">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h9M19 7h1M4 17h1M11 17h9" /><circle cx="16" cy="7" r="2.4" /><circle cx="8" cy="17" r="2.4" /></svg>
      <span class="rotulo">Definições</span>
    </button>
    <div class="mini">
      <button class="icone" onclick={() => (definicoes.tema = proximoTema[definicoes.tema])} title={rotuloTema[definicoes.tema]} aria-label={rotuloTema[definicoes.tema]}>{simboloTema[definicoes.tema]}</button>
      <button class="icone" onclick={onajuda} title="Ajuda e atalhos (?)" aria-label="Ajuda e atalhos">?</button>
    </div>
  </div>
</nav>

<style>
  .barra {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 18px 12px 14px;
    background: var(--superficie);
    border: 1px solid var(--borda);
    border-radius: var(--raio);
    box-shadow: var(--sombra-cartao);
    min-height: 0;
    overflow: auto;
  }
  .marca {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px 2px;
    filter: drop-shadow(0 0 12px rgb(94 224 255 / 0.25));
  }
  .nome {
    font-weight: 800;
    font-size: 16px;
    letter-spacing: -0.02em;
  }
  .grupo {
    display: grid;
    gap: 2px;
  }
  .titulo-grupo {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--texto-2);
    opacity: 0.8;
    padding: 0 10px 6px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    border: 0;
    border-radius: 14px;
    background: transparent;
    color: var(--texto-2);
    font-weight: 600;
    font-size: 14px;
    position: relative;
  }
  .item:hover:not(:disabled) {
    background: var(--superficie-2);
    color: var(--texto);
  }
  .item.ativo,
  .item.ativo:hover:not(:disabled) {
    background: var(--primario);
    color: var(--primario-texto);
    box-shadow: var(--primario-sombra);
  }
  .item svg {
    flex: none;
  }
  .rotulo {
    flex: 1;
    min-width: 0;
  }
  .contagem {
    min-width: 20px;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    text-align: center;
  }
  .contagem.erro {
    background: var(--erro);
    color: #fff;
  }
  .contagem.aviso {
    background: var(--pastel-aviso);
    color: var(--pastel-aviso-t);
  }
  .contagem.neutro {
    background: var(--superficie-2);
    color: var(--texto-2);
  }
  .item.ativo .contagem.neutro {
    background: rgb(255 255 255 / 0.2);
    color: inherit;
  }
  /* as categorias por baixo de "Correções": uma linha à esquerda liga-as ao item */
  .sub {
    display: grid;
    gap: 1px;
    margin: 2px 0 6px 25px;
    padding-left: 12px;
    border-left: 2px solid var(--borda);
  }
  .sub-item,
  .sub-item:hover:not(:disabled) {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 6px 10px;
    border: 0;
    border-radius: 10px;
    background: none;
    font-size: 13px;
    font-weight: 600;
    color: var(--texto-2);
  }
  .sub-item:hover:not(:disabled) {
    background: var(--superficie-2);
    color: var(--texto);
  }
  .sub-item.ativa,
  .sub-item.ativa:hover:not(:disabled) {
    background: var(--superficie-2);
    color: var(--texto);
    box-shadow: inset 3px 0 0 var(--acento);
  }
  .sub-item.vazia {
    opacity: 0.55;
  }
  .sub-nome {
    flex: 1;
  }
  .sub-n {
    min-width: 18px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--pastel-info);
    color: var(--pastel-info-t);
    font-size: 11px;
    font-weight: 700;
    text-align: center;
  }
  .fundo {
    margin-top: auto;
    display: grid;
    gap: 2px;
    padding-top: 10px;
    border-top: 1px solid var(--borda);
  }
  .mini {
    display: flex;
    gap: 6px;
    padding: 8px 8px 0;
  }
  .mini .icone {
    flex: 1;
    border-radius: 12px;
    background: var(--superficie-2);
    border-color: transparent;
  }

  @media (max-width: 1260px) {
    .nome,
    .rotulo,
    .titulo-grupo,
    .sub {
      display: none;
    }
    .barra {
      align-items: center;
      padding-inline: 8px;
    }
    .marca {
      padding: 0;
    }
    .item {
      width: 46px;
      justify-content: center;
      padding: 12px 0;
    }
    .contagem {
      position: absolute;
      top: 2px;
      right: 0;
      min-width: 16px;
      padding: 0 4px;
      font-size: 10px;
    }
    .mini {
      flex-direction: column;
      padding: 8px 0 0;
    }
  }
</style>
