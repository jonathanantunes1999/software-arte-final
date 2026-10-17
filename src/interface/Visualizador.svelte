<script lang="ts">
  import { untrack } from 'svelte';
  import type { PDFDocumentProxy, PageViewport, RenderTask } from 'pdfjs-dist';
  import type { Caixa } from '../analise/caixas';
  import type { PaginaInfo } from '../analise/documento';
  import { lerToque, objetosEm, type Leitura } from '../analise/inspecao';
  import type { PaginaIR } from '../analise/ir';
  import { formatarMm } from '../comum/unidades';
  import { definicoes } from './definicoes.svelte';
  import { idLayerPdfjs } from './pdf';
  import LeitorCor from './LeitorCor.svelte';
  import { canalCinzento, compor, temTinta } from '../separacoes/compor';
  import { diferenca, pixeisNormais, pixeisSeparados, type Pixeis } from './comparar';
  import type { Placa } from '../separacoes/placas';

  /** Sítio de um alerta a desenhar por cima da página */
  interface Marca {
    caixa: Caixa;
    /** O local em foco (os outros do mesmo alerta aparecem mais discretos) */
    ativa: boolean;
    /** Alerta a que o local pertence e qual dos seus locais é (para clicar na página e selecionar) */
    alertaId?: string;
    indice?: number;
    gravidade?: 'erro' | 'aviso' | 'info';
    /** Número do alerta na lista */
    numero?: number;
  }
  /** Pedido de zoom para um local. `versao` muda a cada pedido, mesmo para o mesmo sítio. */
  interface Foco {
    pagina: number;
    caixa: Caixa;
    versao: number;
  }

  /** PDF com as placas da página (uma página por placa) para mostrar em vez da página */
  interface Separacao {
    doc: PDFDocumentProxy;
    placas: Placa[];
    /** Muda a cada separação nova */
    chave: string;
  }

  interface Props {
    doc: PDFDocumentProxy;
    pagina: number;
    total: number;
    info: PaginaInfo;
    marcas?: Marca[];
    /** Alerta sobre o qual está o rato na lista: destaca os seus locais na página */
    alertaHover?: string | null;
    /** Clicou-se num local de alerta na página */
    aoClicarMarca?(alertaId: string, indice: number): void;
    foco?: Foco | null;
    /** Página interpretada com contornos, para o leitor de cor */
    inspecao?: PaginaIR | null;
    /** Layers ligadas (true) ou desligadas (false) pelo utilizador, por etiqueta */
    sobreposicoes?: Record<string, boolean>;
    separacao?: Separacao | null;
    /** Placas escondidas pelo utilizador (id → true) */
    escondidas?: Record<string, boolean>;
    /** Diz quais as placas sem tinta, depois de desenhadas */
    aoMedirPlacas?(chave: string, vazias: string[]): void;
    /** Volta à vista normal da página (desliga as separações) */
    aoVerNormal?(): void;
    /** O que não entrou nas placas desta página, para avisar quem a está a ver por tintas */
    avisosSeparacao?: { imagens: number; degrades: number; padroes: number } | null;
    /** Mostra a cópia corrigida ao lado do original: antes, depois ou só o que mudou */
    comparar?: { doc: PDFDocumentProxy; separacao: Separacao | null } | null;
    modoComparacao?: 'antes' | 'depois' | 'diferenca';
    aoSairComparacao?(): void;
  }
  let {
    doc,
    pagina = $bindable(),
    total,
    info,
    marcas = [],
    alertaHover = null,
    aoClicarMarca,
    foco = null,
    inspecao = null,
    sobreposicoes = {},
    separacao = null,
    escondidas = {},
    aoMedirPlacas,
    aoVerNormal,
    avisosSeparacao = null,
    comparar = null,
    modoComparacao = $bindable('diferenca'),
    aoSairComparacao,
  }: Props = $props();

  type Modo = 'pagina' | 'largura' | number;
  const CSS_POR_PT = 96 / 72;
  // a doca de baixo ocupa ~76 px do palco: a página não pode ficar por baixo dela
  const MARGEM = 40;
  const MARGEM_V = 100;

  let modo = $state<Modo>('pagina');
  let escalaAtual = $state(1);
  let larguraArea = $state(0);
  let alturaArea = $state(0);
  let canvas: HTMLCanvasElement;
  let area: HTMLDivElement;
  let folha: HTMLDivElement;
  /** Incrementa para obrigar a redesenhar (mesmo zoom, mesma página) quando há um foco a aplicar */
  let redesenhar = $state(0);
  let pendente: Foco | null = null;
  let viewport = $state.raw<PageViewport | null>(null);
  let tarefa: RenderTask | null = null;
  let tarefasPlacas: RenderTask[] = [];
  let geracao = 0;
  /** Placas desenhadas (um byte por pixel), à espera de serem compostas */
  let placasPixeis = $state.raw<{ chave: string; largura: number; altura: number; dados: Uint8Array[] } | null>(null);

  const percentagem = $derived(Math.round((escalaAtual / CSS_POR_PT) * 100));

  $effect(() => {
    // dependências lidas de forma síncrona
    const d = doc;
    const p = pagina;
    const m = modo;
    const w = larguraArea;
    const h = alturaArea;
    void redesenhar;
    void JSON.stringify(sobreposicoes);
    void separacao?.chave;
    if (comparar) {
      void modoComparacao;
      void comparar.doc;
      void comparar.separacao?.chave;
      void JSON.stringify(escondidas);
    }
    if (!w || !h) return;
    desenhar(d, p, m, w, h);
  });

  async function desenhar(d: PDFDocumentProxy, p: number, m: Modo, w: number, h: number) {
    const minha = ++geracao;
    tarefa?.cancel();
    const pg = await d.getPage(p + 1);
    if (minha !== geracao) return;

    const base = pg.getViewport({ scale: 1 });
    let escala: number;
    if (m === 'pagina') escala = Math.min((w - MARGEM) / base.width, (h - MARGEM_V) / base.height);
    else if (m === 'largura') escala = (w - MARGEM) / base.width;
    else escala = m * CSS_POR_PT;
    escala = Math.min(Math.max(escala, 0.05), 10);

    const vp = pg.getViewport({ scale: escala });
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = `${vp.width}px`;
    canvas.style.height = `${vp.height}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    escalaAtual = escala;
    viewport = vp;
    if (!comparar) tamanhoMudou = false;

    if (comparar) {
      tarefa = null;
      placasPixeis = null;
      await desenharComparacao(d, p, escala, dpr, minha);
      if (minha === geracao && pendente && pendente.pagina === p) {
        rolarPara(pendente.caixa, vp);
        pendente = null;
      }
      return;
    }

    // as placas só valem para a página para que foram montadas; enquanto não chegam mostra-se a página
    const sep = separacao && separacao.chave.split(':')[0] === String(p) ? separacao : null;
    if (sep) {
      tarefa = null;
      await desenharPlacas(sep, escala, dpr, minha, vp);
      if (minha === geracao && pendente && pendente.pagina === p) {
        rolarPara(pendente.caixa, vp);
        pendente = null;
      }
      return;
    }
    placasPixeis = null;

    // layers: cada render leva uma configuração própria, com o que o utilizador ligou ou desligou
    const layers = await d.getOptionalContentConfig();
    for (const [tag, visivel] of Object.entries(sobreposicoes)) {
      const id = idLayerPdfjs(tag);
      if (layers.getGroup(id)) layers.setVisibility(id, visivel);
    }
    if (minha !== geracao) return;

    const t = pg.render({
      canvas,
      canvasContext: ctx,
      viewport: vp,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      optionalContentConfigPromise: Promise.resolve(layers),
    });
    tarefa = t;
    try {
      await t.promise;
    } catch (e) {
      if ((e as Error).name !== 'RenderingCancelledException') console.error(e);
      return;
    }
    if (minha === geracao && pendente && pendente.pagina === p) {
      rolarPara(pendente.caixa, vp);
      pendente = null;
    }
  }

  // --- comparação antes/depois: os dois renders ficam em memória e só se recompõe quando muda o modo
  let renders = $state.raw<{ chave: string; a: Pixeis; b: Pixeis } | null>(null);
  let diff = $state<{ mudados: number; total: number } | null>(null);
  /** A cópia corrigida tem outro tamanho de página (marcas de corte, sangria): não se sobrepõem */
  let tamanhoMudou = $state(false);
  /** Na cópia, com outro tamanho, as marcações do original não batem certo: só se mostram no "antes" */
  const marcasVisiveis = $derived(!(comparar && tamanhoMudou && modoComparacao !== 'antes'));

  async function desenharComparacao(d: PDFDocumentProxy, p: number, escala: number, dpr: number, minha: number) {
    const daPagina = (s: Separacao | null | undefined) => (s && s.chave.split(':')[0] === String(p) ? s : null);
    const sepA = daPagina(separacao);
    const sepB = daPagina(comparar!.separacao);
    const comPlacas = !!sepA && !!sepB;
    const chave = [p, escala, dpr, comPlacas ? `${sepA!.chave}|${sepB!.chave}` : 'normal', JSON.stringify(sobreposicoes), JSON.stringify(escondidas), comparar!.doc.fingerprints?.[0] ?? ''].join('#');
    if (!renders || renders.chave !== chave) {
      const cancelado = () => minha !== geracao;
      const a = comPlacas ? await pixeisSeparados(sepA!, escala, dpr, escondidas, cancelado) : await pixeisNormais(d, p, escala, dpr, sobreposicoes, cancelado);
      if (!a || cancelado()) return;
      const b = comPlacas ? await pixeisSeparados(sepB!, escala, dpr, escondidas, cancelado) : await pixeisNormais(comparar!.doc, p, escala, dpr, sobreposicoes, cancelado);
      if (!b || cancelado()) return;
      renders = { chave, a, b };
      tamanhoMudou = a.largura !== b.largura || a.altura !== b.altura;
      if (tamanhoMudou) diff = null;
      else {
        const r = diferenca(a, b);
        diff = { mudados: r.mudados, total: r.total };
      }
    }
    if (minha !== geracao || !renders) return;
    const { a, b } = renders;
    // com tamanhos diferentes, cada vista tem a sua página (a diferença não faz sentido)
    const saida = modoComparacao === 'antes' ? a : modoComparacao === 'depois' || tamanhoMudou ? b : diferenca(a, b).pixeis;
    canvas.width = saida.largura;
    canvas.height = saida.altura;
    canvas.style.width = `${saida.largura / dpr}px`;
    canvas.style.height = `${saida.altura / dpr}px`;
    canvas.getContext('2d')!.putImageData(new ImageData(saida.dados as Uint8ClampedArray<ArrayBuffer>, saida.largura, saida.altura), 0, 0);
  }

  /** Desenha cada placa à parte (em cinzento) e guarda os pixeis; a composição faz-se noutro sítio */
  async function desenharPlacas(sep: Separacao, escala: number, dpr: number, minha: number, vp: PageViewport) {
    for (const t of tarefasPlacas) t.cancel();
    tarefasPlacas = [];
    const largura = Math.floor(vp.width * dpr);
    const altura = Math.floor(vp.height * dpr);
    const dados: Uint8Array[] = [];
    const vazias: string[] = [];
    const tela = document.createElement('canvas');
    tela.width = largura;
    tela.height = altura;
    const c2 = tela.getContext('2d', { willReadFrequently: true })!;
    for (let k = 0; k < sep.placas.length; k++) {
      const pg = await sep.doc.getPage(k + 1);
      if (minha !== geracao) return;
      c2.fillStyle = '#ffffff';
      c2.fillRect(0, 0, largura, altura);
      const t = pg.render({
        canvas: tela,
        canvasContext: c2,
        viewport: pg.getViewport({ scale: escala }),
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        annotationMode: 0,
      });
      tarefasPlacas.push(t);
      try {
        await t.promise;
      } catch (e) {
        if ((e as Error).name !== 'RenderingCancelledException') console.error(e);
        return;
      }
      if (minha !== geracao) return;
      const cinza = canalCinzento(c2.getImageData(0, 0, largura, altura).data);
      if (!temTinta(cinza)) vazias.push(sep.placas[k].id);
      dados.push(cinza);
    }
    if (minha !== geracao) return;
    placasPixeis = { chave: sep.chave, largura, altura, dados };
    aoMedirPlacas?.(sep.chave, vazias);
  }

  // junta as placas visíveis no ecrã, sem voltar a desenhá-las
  $effect(() => {
    const px = placasPixeis;
    const sep = separacao;
    const escondidasAgora = escondidas;
    if (!px || !sep || px.chave !== sep.chave) return;
    const visiveis = sep.placas.map((p, i) => ({ p, i })).filter(({ p }) => !escondidasAgora[p.id]);
    const saida = compor(visiveis.map(({ p, i }) => ({ dados: px.dados[i], cor: p.rgb })), px.largura, px.altura);
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(new ImageData(saida as Uint8ClampedArray<ArrayBuffer>, px.largura, px.altura), 0, 0);
  });

  // --- zoom para o local de um alerta
  $effect(() => {
    const versao = foco?.versao;
    if (versao === undefined) return;
    untrack(() => void prepararFoco(foco!));
  });

  async function prepararFoco(f: Foco) {
    pendente = f;
    const pg = await doc.getPage(f.pagina + 1);
    if (pendente !== f) return;
    const base = pg.getViewport({ scale: 1 });
    const [ax, ay] = base.convertToViewportPoint(f.caixa.x0, f.caixa.y0);
    const [bx, by] = base.convertToViewportPoint(f.caixa.x1, f.caixa.y1);
    const rw = Math.abs(bx - ax);
    const rh = Math.abs(by - ay);
    // folga em redor: metade da região, no mínimo 40 pt
    const folga = Math.max(40, Math.max(rw, rh) * 0.5);
    const daRegiao = Math.min((larguraArea - MARGEM) / (rw + 2 * folga), (alturaArea - MARGEM_V) / (rh + 2 * folga));
    const daPagina = Math.min((larguraArea - MARGEM) / base.width, (alturaArea - MARGEM_V) / base.height);
    // nunca menos que a página inteira
    const escala = Math.min(Math.max(daRegiao, daPagina, 0.05), 10);
    modo = escala / CSS_POR_PT;
    redesenhar++;
  }

  function rolarPara(c: Caixa, vp: PageViewport) {
    if (!area || !folha) return;
    const r = retangulo(c, vp);
    const f = folha.getBoundingClientRect();
    const a = area.getBoundingClientRect();
    area.scrollLeft += f.left + r.x + r.largura / 2 - (a.left + a.width / 2);
    area.scrollTop += f.top + r.y + r.altura / 2 - (a.top + a.height / 2);
  }

  function retangulo(c: Caixa, vp: PageViewport) {
    const [a, b] = vp.convertToViewportPoint(c.x0, c.y0);
    const [x, y] = vp.convertToViewportPoint(c.x1, c.y1);
    return { x: Math.min(a, x), y: Math.min(b, y), largura: Math.abs(x - a), altura: Math.abs(y - b) };
  }

  const caixas = $derived(viewport ? { trim: retangulo(info.trim, viewport), bleed: retangulo(info.bleed, viewport) } : null);
  const destaques = $derived(
    viewport && definicoes.mostrarAlertas ? marcas.map((m) => ({ ...retangulo(m.caixa, viewport!), ativa: m.ativa, alertaId: m.alertaId, indice: m.indice ?? 0, gravidade: m.gravidade, numero: m.numero })) : [],
  );
  const temBleed = $derived(info.origemSangria === 'BleedBox');
  const temTrim = $derived(info.origemTrim === 'TrimBox');

  // --- ferramentas: cor (leitor), mão (arrastar) e régua (medir em mm)
  type Ferramenta = 'cor' | 'mao' | 'regua';
  let ferramenta = $state<Ferramenta>(definicoes.mostrarLeitor ? 'cor' : 'mao');
  /** Barra de espaço premida: mão temporária, como nos programas de design */
  let espaco = $state(false);
  const ferramentaAtiva = $derived<Ferramenta>(espaco ? 'mao' : ferramenta);
  $effect(() => {
    definicoes.mostrarLeitor = ferramenta === 'cor';
  });

  const MM_POR_PT = 25.4 / 72;
  /** Posição do cursor em mm, a partir do canto superior esquerdo do corte (como se vê no ecrã) */
  let cursorMm = $state<{ x: number; y: number } | null>(null);
  /** Ponto em px da página (viewport), com origem na folha */
  interface Ponto {
    x: number;
    y: number;
  }
  let regua = $state<{ a: Ponto; b: Ponto; aMedir: boolean } | null>(null);

  function pontoDaFolha(ev: { clientX: number; clientY: number }): Ponto {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  const paraMm = (px: number) => (px / escalaAtual) * MM_POR_PT;

  function atualizarCursor(ev: PointerEvent) {
    if (!caixas) return;
    const p = pontoDaFolha(ev);
    const x = paraMm(p.x - caixas.trim.x);
    const y = paraMm(p.y - caixas.trim.y);
    cursorMm = p.x >= 0 && p.y >= 0 && p.x <= (viewport?.width ?? 0) && p.y <= (viewport?.height ?? 0) ? { x, y } : null;
  }

  // mão: arrastar a página
  let arrasto = $state<{ x: number; y: number; esq: number; topo: number } | null>(null);

  function aoPremir(ev: PointerEvent) {
    if (ev.button !== 0) return;
    if (ferramentaAtiva === 'mao') {
      arrasto = { x: ev.clientX, y: ev.clientY, esq: area.scrollLeft, topo: area.scrollTop };
      (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    } else if (ferramentaAtiva === 'regua') {
      const p = pontoDaFolha(ev);
      regua = { a: p, b: p, aMedir: true };
      (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    }
  }

  function aoMoverFolha(ev: PointerEvent) {
    atualizarCursor(ev);
    if (arrasto) {
      area.scrollLeft = arrasto.esq - (ev.clientX - arrasto.x);
      area.scrollTop = arrasto.topo - (ev.clientY - arrasto.y);
    } else if (regua?.aMedir) {
      let b = pontoDaFolha(ev);
      // Shift: só na horizontal ou na vertical
      if (ev.shiftKey) {
        if (Math.abs(b.x - regua.a.x) > Math.abs(b.y - regua.a.y)) b = { x: b.x, y: regua.a.y };
        else b = { x: regua.a.x, y: b.y };
      }
      regua = { ...regua, b };
    } else {
      aoMoverRato(ev);
    }
  }

  function aoLargarFolha() {
    arrasto = null;
    if (regua?.aMedir) {
      const { a, b } = regua;
      // um clique sem arrasto não é uma medida
      regua = Math.hypot(b.x - a.x, b.y - a.y) < 3 ? null : { a, b, aMedir: false };
    }
  }

  const medida = $derived.by(() => {
    if (!regua) return null;
    const dx = paraMm(regua.b.x - regua.a.x);
    const dy = paraMm(regua.b.y - regua.a.y);
    return { dx: Math.abs(dx), dy: Math.abs(dy), d: Math.hypot(dx, dy) };
  });
  const fmt = (mm: number) => formatarMm(mm);

  // trocar de ferramenta ou de página limpa a medida
  $effect(() => {
    void pagina;
    if (ferramenta !== 'regua') regua = null;
  });

  // --- leitor de cor: o que está debaixo do cursor
  let rato = $state<{ x: number; y: number; px: number; py: number } | null>(null);
  let quadro = 0;

  function aoMoverRato(ev: PointerEvent) {
    if (!definicoes.mostrarLeitor) return;
    const { clientX, clientY } = ev;
    cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(() => {
      if (!viewport) return;
      const r = canvas.getBoundingClientRect();
      const [px, py] = viewport.convertToPdfPoint(clientX - r.left, clientY - r.top);
      rato = { x: clientX, y: clientY, px, py };
    });
  }
  function aoSairRato() {
    cancelAnimationFrame(quadro);
    rato = null;
    cursorMm = null;
  }

  const leituras = $derived.by((): { lista: Leitura[]; camada?: string } | null => {
    if (!rato || !inspecao || !definicoes.mostrarLeitor) return null;
    // 3 px de ecrã de tolerância, para apanhar linhas finas
    const toques = objetosEm(inspecao.eventos, rato.px, rato.py, 3 / escalaAtual, 4);
    return { lista: toques.map(lerToque), camada: toques[0]?.evento.camada };
  });

  function ir(delta: number) {
    pagina = Math.min(Math.max(pagina + delta, 0), total - 1);
  }

  function zoomPara(novo: number) {
    modo = Math.min(Math.max(novo, 5), 1000) / 100;
  }

  function aoRato(ev: WheelEvent) {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    zoomPara(percentagem * (ev.deltaY < 0 ? 1.1 : 1 / 1.1));
  }

  function aoTeclado(ev: KeyboardEvent) {
    const alvo = ev.target as HTMLElement;
    if (alvo.tagName === 'INPUT' || alvo.tagName === 'SELECT' || alvo.tagName === 'TEXTAREA') return;
    if (!ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      const k = ev.key.toLowerCase();
      if (k === 'v') ferramenta = 'cor';
      else if (k === 'h') ferramenta = 'mao';
      else if (k === 'm') ferramenta = 'regua';
      else if (ev.key === 'Escape') regua = null;
      else if (ev.key === ' ' && alvo.tagName !== 'BUTTON') {
        ev.preventDefault();
        espaco = true;
      }
    }
    if (ev.key === 'ArrowRight' || ev.key === 'PageDown') ir(1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') ir(-1);
    else if ((ev.ctrlKey || ev.metaKey) && (ev.key === '+' || ev.key === '=')) {
      ev.preventDefault();
      zoomPara(percentagem * 1.25);
    } else if ((ev.ctrlKey || ev.metaKey) && ev.key === '-') {
      ev.preventDefault();
      zoomPara(percentagem / 1.25);
    } else if ((ev.ctrlKey || ev.metaKey) && ev.key === '0') {
      ev.preventDefault();
      modo = 'pagina';
    }
  }

  function aoMudarPagina(ev: Event) {
    const n = parseInt((ev.currentTarget as HTMLInputElement).value, 10);
    if (Number.isFinite(n)) pagina = Math.min(Math.max(n - 1, 0), total - 1);
    (ev.currentTarget as HTMLInputElement).value = String(pagina + 1);
  }
</script>

<svelte:window onkeydown={aoTeclado} onkeyup={(ev) => ev.key === ' ' && (espaco = false)} onblur={() => (espaco = false)} />

<div class="visualizador">
  <div class="corpo">
  <div class="ferramentas" role="toolbar" aria-label="Ferramentas" aria-orientation="vertical">
    <button class:ativo={ferramentaAtiva === 'cor'} onclick={() => (ferramenta = 'cor')} title="Leitor de cor (V): mostra a cor e o overprint do que está debaixo do cursor" aria-label="Leitor de cor" aria-pressed={ferramentaAtiva === 'cor'}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l6.5 16 2.3-6.7L19.5 11z" /></svg>
    </button>
    <button class:ativo={ferramentaAtiva === 'mao'} onclick={() => (ferramenta = 'mao')} title="Mão (H, ou segura a barra de espaço): arrasta a página" aria-label="Mão" aria-pressed={ferramentaAtiva === 'mao'}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V5a1.5 1.5 0 013 0v6m0-1V3.5a1.5 1.5 0 013 0V11m0-4.5a1.5 1.5 0 013 0V14m0-3a1.5 1.5 0 013 0v4a6 6 0 01-6 6h-2a6 6 0 01-4.6-2.1L4 14.5a1.6 1.6 0 012.4-2L8 14" /></svg>
    </button>
    <button class:ativo={ferramentaAtiva === 'regua'} onclick={() => (ferramenta = 'regua')} title="Régua (M): arrasta para medir em mm. Shift fixa na horizontal ou vertical. Esc limpa." aria-label="Régua" aria-pressed={ferramentaAtiva === 'regua'}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17L17 3l4 4L7 21z" /><path d="M7 13l2 2m1-5l2 2m1-5l2 2" /></svg>
    </button>
  </div>

  <div class="area" bind:this={area} bind:clientWidth={larguraArea} bind:clientHeight={alturaArea} onwheel={aoRato}>
    <!-- o leitor de cor só faz sentido com rato; não há equivalente de teclado para "o que está debaixo do cursor" -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="folha" bind:this={folha} class:com-leitor={ferramentaAtiva === 'cor'} class:mao={ferramentaAtiva === 'mao'} class:a-arrastar={!!arrasto} class:regua={ferramentaAtiva === 'regua'} onpointerdown={aoPremir} onpointermove={aoMoverFolha} onpointerup={aoLargarFolha} onpointercancel={aoLargarFolha} onpointerleave={aoSairRato}>
      <canvas bind:this={canvas}></canvas>
      {#if destaques.length && viewport && marcasVisiveis}
        <svg class="destaques" width={viewport.width} height={viewport.height} aria-hidden="true">
          {#each destaques as d, i (i)}
            {@const clicavel = !!d.alertaId && !!aoClicarMarca}
            <!-- clicar numa marca seleciona o alerta (há o mesmo alerta na lista, acessível por teclado) -->
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <g class="grupo-marca" class:clicavel onclick={() => clicavel && aoClicarMarca!(d.alertaId!, d.indice)}>
              <rect
                class="marca g-{d.gravidade ?? 'aviso'}"
                class:ativa={d.ativa}
                class:hover={!!d.alertaId && d.alertaId === alertaHover}
                x={d.x - 3}
                y={d.y - 3}
                width={Math.max(d.largura, 4) + 6}
                height={Math.max(d.altura, 4) + 6}
                rx="3"
              />
              {#if d.numero}
                <circle class="selo g-{d.gravidade ?? 'aviso'}" cx={d.x - 3} cy={d.y - 3} r="9" />
                <text class="selo-n" x={d.x - 3} y={d.y - 3} text-anchor="middle" dominant-baseline="central">{d.numero}</text>
              {/if}
            </g>
          {/each}
        </svg>
      {/if}
      {#if regua && viewport && marcasVisiveis}
        <svg width={viewport.width} height={viewport.height} aria-hidden="true">
          <line class="medida-linha" x1={regua.a.x} y1={regua.a.y} x2={regua.b.x} y2={regua.b.y} />
          <circle class="medida-ponta" cx={regua.a.x} cy={regua.a.y} r="4" />
          <circle class="medida-ponta" cx={regua.b.x} cy={regua.b.y} r="4" />
          {#if medida}
            {@const lx = (regua.a.x + regua.b.x) / 2}
            {@const ly = (regua.a.y + regua.b.y) / 2}
            <g transform={`translate(${lx} ${ly - 14})`}>
              <rect class="medida-fundo" x="-46" y="-11" width="92" height="22" rx="5" />
              <text class="medida-texto" text-anchor="middle" dominant-baseline="central">{fmt(medida.d)} mm</text>
            </g>
          {/if}
        </svg>
      {/if}
      {#if definicoes.mostrarCaixas && caixas && viewport && marcasVisiveis}
        <svg width={viewport.width} height={viewport.height} aria-hidden="true">
          {#if temBleed}
            <rect class="bleed" x={caixas.bleed.x} y={caixas.bleed.y} width={caixas.bleed.largura} height={caixas.bleed.altura} />
          {/if}
          <rect class="trim" x={caixas.trim.x} y={caixas.trim.y} width={caixas.trim.largura} height={caixas.trim.altura} />
        </svg>
      {/if}
    </div>
  </div>

    <div class="topo-direita">
    {#if separacao && !comparar}
      {@const falta = (avisosSeparacao?.imagens ?? 0) + (avisosSeparacao?.degrades ?? 0) + (avisosSeparacao?.padroes ?? 0)}
      <div class="vista-tintas" role="status">
        <span class="pontos" aria-hidden="true"><i style="background:#00aeef"></i><i style="background:#ec008c"></i><i style="background:#ffd800"></i><i style="background:#222"></i></span>
        <span>Vista por tintas{falta ? ` · ${falta} ${falta === 1 ? 'elemento não aparece' : 'elementos não aparecem'}` : ''}</span>
        <button onclick={() => aoVerNormal?.()} title="Mostra a página como o ecrã a vê (sem separar as tintas nem simular o overprint)">Vista normal</button>
      </div>
    {/if}
    <div class="opcoes-vista" role="group" aria-label="O que mostrar na página">
      <label class="interruptor" title="Desenha na página o sítio de cada alerta">
        <input type="checkbox" bind:checked={definicoes.mostrarAlertas} />
        Alertas
      </label>
      <label class="interruptor" title="Mostra a linha de corte e a sangria">
        <input type="checkbox" bind:checked={definicoes.mostrarCaixas} />
        Corte e sangria
      </label>
      {#if definicoes.mostrarCaixas}
        <span class="chave trim" title={temTrim ? 'TrimBox' : 'Sem TrimBox: a linha de corte é a página'}>Corte</span>
        {#if temBleed}<span class="chave bleed">Sangria</span>{/if}
      {/if}
    </div>
    </div>

    <div class="doca" role="toolbar" aria-label="Página e zoom">
      <div class="grupo">
        <button class="icone" onclick={() => ir(-1)} disabled={pagina === 0} aria-label="Página anterior" title="Página anterior (←)">‹</button>
        <label class="pagina">
          <input type="text" inputmode="numeric" value={pagina + 1} onchange={aoMudarPagina} aria-label="Número da página" />
          <span>/ {total}</span>
        </label>
        <button class="icone" onclick={() => ir(1)} disabled={pagina >= total - 1} aria-label="Página seguinte" title="Página seguinte (→)">›</button>
      </div>
      <span class="sep" aria-hidden="true"></span>
      <div class="grupo">
        <button class="icone" onclick={() => zoomPara(percentagem / 1.25)} aria-label="Reduzir" title="Reduzir (Ctrl −)">−</button>
        <span class="zoom" aria-live="polite">{percentagem}%</span>
        <button class="icone" onclick={() => zoomPara(percentagem * 1.25)} aria-label="Ampliar" title="Ampliar (Ctrl +)">+</button>
      </div>
      <span class="sep" aria-hidden="true"></span>
      <div class="grupo">
        <button onclick={() => (modo = 'pagina')} class:ativo={modo === 'pagina'} title="Ajustar à página (Ctrl 0)">Página</button>
        <button onclick={() => (modo = 'largura')} class:ativo={modo === 'largura'}>Largura</button>
        <button onclick={() => zoomPara(100)}>100%</button>
      </div>
      {#if comparar}
        <span class="sep" aria-hidden="true"></span>
        <div class="grupo">
          {#each [['antes', 'Antes'], ['depois', 'Depois'], ['diferenca', 'Diferença']] as [id, nomeModo] (id)}
            <button class:ativo={modoComparacao === id} onclick={() => (modoComparacao = id as typeof modoComparacao)}>{nomeModo}</button>
          {/each}
 {#if tamanhoMudou}
            <span class="mudou" title="A cópia tem outro tamanho de página (marcas de corte ou sangria): vê-se cada uma à parte">outro tamanho de página</span>
          {:else if diff}
            <span class="mudou" title="Pixeis que mudaram entre o original e a cópia corrigida">
              {diff.mudados === 0 ? 'sem diferenças' : `${((diff.mudados / diff.total) * 100).toFixed(diff.mudados / diff.total < 0.01 ? 2 : 1).replace('.', ',')}% mudou`}
            </span>
          {/if}
          <button onclick={() => aoSairComparacao?.()}>Sair</button>
        </div>
      {/if}
    </div>

    <div class="leitura" aria-live="off">
      {#if cursorMm}<span class="coordenadas">x {fmt(cursorMm.x)} · y {fmt(cursorMm.y)} mm</span>{/if}
      {#if medida}
        <span class="medida-info">Medida: <strong>{fmt(medida.d)} mm</strong> <em>(→ {fmt(medida.dx)} · ↓ {fmt(medida.dy)})</em></span>
      {:else if ferramentaAtiva === 'regua'}
        <span class="dica">Arrasta na página para medir</span>
      {/if}
    </div>
  </div>
</div>

{#if rato && leituras}
  <LeitorCor leituras={leituras.lista} camada={leituras.camada} x={rato.x} y={rato.y} />
{/if}

<style>
  .folha.com-leitor {
    cursor: crosshair;
  }
  .folha.mao {
    cursor: grab;
  }
  .folha.mao.a-arrastar {
    cursor: grabbing;
  }
  .folha.regua {
    cursor: crosshair;
  }
  .medida-linha {
    stroke: var(--acento);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  .medida-ponta {
    fill: #fff;
    stroke: var(--acento);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  rect.medida-fundo {
    fill: var(--acento);
    stroke: none;
  }
  .medida-texto {
    fill: #fff;
    font: 700 12px system-ui, sans-serif;
  }
  .visualizador {
    height: 100%;
    min-height: 0;
    display: grid;
  }
  .corpo {
    position: relative;
    min-height: 0;
    display: grid;
  }
  .corpo > .area {
    min-height: 0;
  }
  .ferramentas {
    position: absolute;
    left: 14px;
    top: 14px;
    z-index: 5;
    display: grid;
    gap: 2px;
    padding: 5px;
    background: color-mix(in srgb, var(--superficie) 88%, transparent);
    backdrop-filter: blur(14px);
    border: 1px solid var(--borda);
    border-radius: 16px;
    box-shadow: var(--sombra-cartao);
  }
  .ferramentas button {
    width: 34px;
    height: 34px;
    padding: 0;
    display: grid;
    place-items: center;
    border-color: transparent;
    border-radius: 11px;
    background: transparent;
  }
  .ferramentas button:hover {
    background: var(--superficie-2);
  }
  .ferramentas button.ativo {
    background: var(--info-fundo);
    border-color: var(--acento);
    color: var(--acento);
  }
  .leitura {
    position: absolute;
    left: 14px;
    bottom: 78px;
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--texto-2);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .leitura > span {
    background: color-mix(in srgb, var(--superficie) 85%, transparent);
    backdrop-filter: blur(10px);
    border-radius: 999px;
    padding: 3px 10px;
  }
  .medida-info strong {
    color: var(--texto);
  }
  .medida-info em {
    font-style: normal;
  }
  .doca {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 16px;
    margin-inline: auto;
    width: max-content;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100% - 28px);
    flex-wrap: wrap;
    justify-content: center;
    padding: 6px 10px;
    background: color-mix(in srgb, var(--superficie) 90%, transparent);
    backdrop-filter: blur(16px);
    border: 1px solid var(--borda);
    border-radius: 999px;
    box-shadow: var(--sombra-cartao);
  }
  .doca button {
    border-radius: 999px;
    border-color: transparent;
    background: transparent;
  }
  .doca button:hover:not(:disabled) {
    background: var(--superficie-2);
  }
  .doca button.ativo,
  .doca button.ativo:hover:not(:disabled) {
    background: var(--primario);
    color: var(--primario-texto);
  }
  .sep {
    width: 1px;
    height: 20px;
    background: var(--borda);
  }
  .topo-direita {
    position: absolute;
    right: 14px;
    top: 14px;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    max-width: calc(100% - 92px);
  }
  .vista-tintas {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 5px 6px 5px 12px;
    font-size: 13px;
    font-weight: 600;
    background: color-mix(in srgb, var(--superficie) 88%, transparent);
    backdrop-filter: blur(14px);
    border: 1px solid var(--borda);
    border-radius: 999px;
    box-shadow: var(--sombra-cartao);
  }
  .vista-tintas .pontos {
    display: inline-flex;
    gap: 3px;
  }
  .vista-tintas i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: block;
  }
  .vista-tintas button {
    border-radius: 999px;
    padding: 3px 11px;
    font-size: 12px;
    border-color: transparent;
    background: var(--superficie-2);
  }
  .opcoes-vista {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 14px;
    font-size: 13px;
    background: color-mix(in srgb, var(--superficie) 88%, transparent);
    backdrop-filter: blur(14px);
    border: 1px solid var(--borda);
    border-radius: 999px;
    box-shadow: var(--sombra-cartao);
  }
  .grupo {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pagina {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--texto-2);
  }
  .pagina input {
    width: 44px;
    text-align: center;
  }
  .mudou {
    font-size: 12px;
    color: var(--texto-2);
    font-variant-numeric: tabular-nums;
  }
  .zoom {
    min-width: 46px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .interruptor {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
  }
  .chave {
    font-size: 12px;
    font-weight: 600;
    padding-left: 18px;
    position: relative;
  }
  .chave::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    width: 13px;
    border-top: 2px solid;
  }
  .chave.trim::before {
    border-color: var(--caixa-trim);
  }
  .chave.bleed::before {
    border-color: var(--caixa-bleed);
    border-top-style: dashed;
  }
  .area {
    overflow: auto;
    display: grid;
    min-height: 0;
    padding: 20px 20px 80px;
  }
  .folha {
    position: relative;
    margin: auto;
    line-height: 0;
    box-shadow: var(--sombra);
    background: #fff;
  }
  canvas {
    display: block;
  }
  .folha svg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
  }
  rect {
    fill: none;
    vector-effect: non-scaling-stroke;
  }
  rect.trim {
    stroke: var(--caixa-trim);
    stroke-width: 1.5;
  }
  rect.bleed {
    stroke: var(--caixa-bleed);
    stroke-width: 1.5;
    stroke-dasharray: 6 4;
  }
  rect.marca {
    --cor: var(--aviso);
    stroke: var(--cor);
    stroke-width: 2;
    fill: color-mix(in srgb, var(--cor) 10%, transparent);
    opacity: 0.7;
    transition: opacity 0.12s;
  }
  rect.marca.g-erro,
  circle.selo.g-erro {
    --cor: var(--erro);
  }
  rect.marca.g-aviso,
  circle.selo.g-aviso {
    --cor: #e08a00;
  }
  rect.marca.g-info,
  circle.selo.g-info {
    --cor: var(--info);
  }
  rect.marca.hover {
    opacity: 1;
    stroke-width: 3;
    fill: color-mix(in srgb, var(--cor) 24%, transparent);
  }
  rect.marca.ativa {
    opacity: 1;
    stroke-width: 3;
    fill: color-mix(in srgb, var(--cor) 22%, transparent);
    animation: pulsar 0.9s ease-in-out 3;
  }
  g.clicavel {
    pointer-events: all;
    cursor: pointer;
  }
  circle.selo {
    --cor: #e08a00;
    fill: var(--cor);
    stroke: #fff;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  text.selo-n {
    fill: #fff;
    font: 700 10px system-ui, sans-serif;
    pointer-events: none;
    user-select: none;
  }
  @keyframes pulsar {
    50% {
      stroke-width: 6;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    rect.marca.ativa {
      animation: none;
    }
  }
</style>
