<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { desktop, ficheiroDe, type FicheiroAberto } from './desktop';
  import { definicoes, guardarDefinicoes } from './definicoes.svelte';
  import Documento from './Documento.svelte';
  import Separadores from './Separadores.svelte';
  import { ativoAoFechar, estaVazio, mover, moverPorPasso, MAX_SEPARADORES, mostrarBarra, ondeAbrir, porNumero, separadorVazio, vizinho, type Separador } from './separadores';

  /**
   * A casca dos separadores: cada PDF aberto vive no seu próprio Documento (com a sua análise, o seu zoom e as suas
   * correções), todos ao mesmo tempo; só o que está à frente se vê e responde ao teclado. Aqui ficam as coisas que
   * são de todos: abrir ficheiros, largar na janela, os atalhos dos separadores, o tema e as definições.
   */
  let proximoId = 1;
  const novo = () => separadorVazio(proximoId++);
  const primeiro = novo();
  let separadores = $state<Separador[]>([primeiro]);
  let ativo = $state(primeiro.id);
  const documentos: Record<number, Documento | undefined> = {};
  let aArrastar = $state(false);
  let aviso = $state<string | null>(null);
  let entrada: HTMLInputElement;

  // Guardar definições sempre que mudam
  $effect(() => {
    guardarDefinicoes($state.snapshot(definicoes));
  });

  // Tema
  $effect(() => {
    const raiz = document.documentElement;
    if (definicoes.tema === 'auto') raiz.removeAttribute('data-tema');
    else raiz.setAttribute('data-tema', definicoes.tema);
  });

  // A animação da notch espera pela análise real: avisa a casca quando algum PDF acaba de ser analisado
  let andavaAOcupar = false;
  $effect(() => {
    const ocupado = separadores.some((s) => s.aCarregar);
    untrack(() => {
      if (andavaAOcupar && !ocupado) desktop?.analisePronta();
      andavaAOcupar = ocupado;
    });
  });

  const ids = $derived(separadores.map((s) => s.id));
  const atual = $derived(separadores.find((s) => s.id === ativo));
  const documentosPorId = $derived([...separadores].sort((a, b) => a.id - b.id));

  function mostrarAviso(texto: string) {
    aviso = texto;
    setTimeout(() => aviso === texto && (aviso = null), 4500);
  }

  function atualizar(id: number, e: Omit<Separador, 'id'>) {
    // chamado de dentro de um efeito do Documento: não pode ficar a depender da lista toda
    untrack(() => {
      const s = separadores.find((x) => x.id === id);
      if (s) Object.assign(s, e);
    });
  }

  function novoSeparador(): number | null {
    if (separadores.length >= MAX_SEPARADORES) {
      mostrarAviso(`Há ${MAX_SEPARADORES} separadores abertos: fecha algum para abrir outro.`);
      return null;
    }
    const s = novo();
    separadores.push(s);
    ativo = s.id;
    return s.id;
  }

  /** Muda a ordem dos separadores (arrastar na barra, ou com o teclado). Os Documentos não se mexem: só a barra. */
  function reordenar(ordem: number[]) {
    if (ordem === ids) return;
    const porId = new Map(separadores.map((s) => [s.id, s]));
    separadores = ordem.map((id) => porId.get(id)!).filter(Boolean);
  }
  const moverSeparador = (id: number, destino: number) => reordenar(mover(ids, id, destino));

  function fechar(id: number) {
    const r = ativoAoFechar(ids, id, ativo);
    if (r.ativo === null) {
      // o último: se já era o ecrã inicial, fecha-se a janela; senão fica um separador vazio no lugar
      if (separadores[0] && estaVazio(separadores[0])) {
        desktop?.recolher();
        return;
      }
      const s = novo();
      delete documentos[id];
      separadores = [s];
      ativo = s.id;
      return;
    }
    separadores = separadores.filter((s) => s.id !== id);
    delete documentos[id];
    ativo = r.ativo;
  }

  /** Abre um ficheiro: noutro separador se já há um à frente (ou no que já o tem aberto), ou no ecrã inicial vazio */
  async function abrirEm(f: File, caminho = '') {
    const onde = ondeAbrir(separadores, ativo, caminho || (desktop?.caminhoDe(f) ?? ''));
    if (onde.tipo === 'existente') {
      ativo = onde.id;
      return;
    }
    if (onde.tipo === 'cheio') {
      mostrarAviso(`Há ${MAX_SEPARADORES} separadores abertos: fecha algum para abrir outro.`);
      return;
    }
    const id = onde.tipo === 'novo' ? novoSeparador() : ativo;
    if (id === null) return;
    await tick();
    await documentos[id]?.abrirFicheiro(f, caminho);
  }

  const abrirDeFora = (f: FicheiroAberto) => abrirEm(ficheiroDe(f), f.caminho);

  async function abrirExemploEm() {
    const onde = ondeAbrir(separadores, ativo, '');
    if (onde.tipo === 'cheio') return mostrarAviso(`Há ${MAX_SEPARADORES} separadores abertos: fecha algum para abrir outro.`);
    const id = onde.tipo === 'novo' ? novoSeparador() : ativo;
    if (id === null || id === undefined) return;
    await tick();
    await documentos[id]?.carregarExemplo();
  }

  async function pedirAbrir() {
    if (!desktop) return entrada.click();
    const f = await desktop.abrir();
    if (f) await abrirDeFora(f);
  }

  function aoEscolher(ev: Event) {
    const el = ev.currentTarget as HTMLInputElement;
    const fs = [...(el.files ?? [])];
    el.value = '';
    void (async () => {
      for (const f of fs) await abrirEm(f);
    })();
  }

  function aoArrastar(ev: DragEvent) {
    if (ev.dataTransfer?.types.includes('Files')) {
      ev.preventDefault();
      aArrastar = true;
    }
  }
  function aoLargar(ev: DragEvent) {
    ev.preventDefault();
    aArrastar = false;
    const fs = [...(ev.dataTransfer?.files ?? [])].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    void (async () => {
      for (const f of fs) await abrirEm(f);
    })();
  }

  function aoTeclar(ev: KeyboardEvent) {
    const cmd = ev.ctrlKey || ev.metaKey;
    if (!cmd) return;
    const k = ev.key.toLowerCase();
    // nos campos de texto só valem os atalhos que não mexem em texto
    if (k === 'o' && !ev.shiftKey && !ev.altKey) {
      ev.preventDefault();
      void pedirAbrir();
    } else if (k === 't' && !ev.shiftKey && !ev.altKey) {
      ev.preventDefault();
      novoSeparador();
    } else if (k === 'w' && !ev.shiftKey && !ev.altKey && !desktop) {
      // no desktop o Cmd/Ctrl+W vem do menu (ver electron/main.mjs); no browser pertence ao browser
      ev.preventDefault();
      fechar(ativo);
    } else if (ev.shiftKey && !ev.altKey && (ev.key === 'PageDown' || ev.key === 'PageUp')) {
      // Ctrl/Cmd+Shift+PageUp/PageDown: leva o separador ativo para a esquerda/direita, como no Chrome
      ev.preventDefault();
      reordenar(moverPorPasso(ids, ativo, ev.key === 'PageUp' ? -1 : 1));
    } else if (ev.key === 'Tab' || ev.key === 'PageDown' || ev.key === 'PageUp') {
      ev.preventDefault();
      const para = ev.key === 'PageUp' || (ev.key === 'Tab' && ev.shiftKey) ? -1 : 1;
      ativo = vizinho(ids, ativo, para);
    } else if (/^[1-9]$/.test(ev.key) && !ev.shiftKey && !ev.altKey) {
      const id = porNumero(ids, Number(ev.key));
      if (id !== null) {
        ev.preventDefault();
        ativo = id;
      }
    }
  }

  onMount(() => {
    if (!desktop) return;
    desktop.ficheiroInicial().then((f) => f && abrirDeFora(f));
    const parar = [desktop.aoAbrirFicheiro(abrirDeFora), desktop.aoFecharSeparador(() => fechar(ativo))];
    return () => parar.forEach((p) => p());
  });
</script>

<svelte:window
  onkeydown={aoTeclar}
  ondragover={aoArrastar}
  ondragleave={(e) => {
    if (e.relatedTarget === null) aArrastar = false;
  }}
  ondrop={aoLargar}
/>

<input bind:this={entrada} type="file" accept="application/pdf,.pdf" multiple hidden onchange={aoEscolher} />

<div class="raiz" class:com-barra={mostrarBarra(separadores)}>
  {#if mostrarBarra(separadores)}
    <div class="faixa">
      <Separadores {separadores} {ativo} onescolher={(id) => (ativo = id)} onfechar={fechar} onnovo={novoSeparador} onmover={moverSeparador} />
    </div>
  {/if}
  <div class="documentos">
    <!-- por ordem de criação, não da barra: reordenar os separadores não mexe nos documentos (nem no que têm desenhado) -->
    {#each documentosPorId as s (s.id)}
      <Documento
        bind:this={documentos[s.id]}
        aFrente={s.id === ativo}
        aoPedirAbrir={pedirAbrir}
        aoPedirExemplo={abrirExemploEm}
        aoEstado={(e) => atualizar(s.id, e)}
      />
    {/each}
  </div>
</div>

{#if aviso}<div class="aviso" role="alert">{aviso}</div>{/if}

{#if aArrastar}
  <div class="largar" aria-hidden="true"><span>Larga o PDF para abrir</span></div>
{/if}

<style>
  .raiz {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
  }
  .raiz.com-barra {
    grid-template-rows: auto minmax(0, 1fr);
  }
  .faixa {
    padding: 10px 14px 0;
    min-width: 0;
  }
  .documentos {
    min-height: 0;
    min-width: 0;
    position: relative;
  }
  .aviso {
    position: fixed;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    z-index: 60;
    padding: 9px 16px;
    border-radius: 12px;
    background: var(--erro-fundo);
    color: var(--erro);
    font-weight: 600;
    box-shadow: var(--sombra-cartao);
  }
  .largar {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--acento) 18%, transparent);
    border: 3px dashed var(--acento);
    pointer-events: none;
    z-index: 50;
  }
  .largar span {
    background: var(--superficie);
    padding: 14px 24px;
    border-radius: 10px;
    font-size: 18px;
    font-weight: 600;
    box-shadow: var(--sombra);
  }
</style>
