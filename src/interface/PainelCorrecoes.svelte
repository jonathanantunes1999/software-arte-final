<script lang="ts">
  import type { ConversaoSpot, PedidoCorrecoes, ResumoCorrecoes } from '../correcoes/aplicar';
  import type { Inventario } from '../correcoes/inventario';
  import { cmykParaLab, labParaRgb } from '../cores/cie';
  import { sugerirCores } from '../cores/bibliotecas';
  import { untrack } from 'svelte';
  import type { TipoCorrecao } from '../alertas/correcao-sugerida';
  import { bibliotecas } from './bibliotecas.svelte';
  import { desktop, type FonteInstalada } from './desktop';
  import type { FonteNaoIncorporada } from '../texto/fonte-pdf';

  interface Contagem {
    erros: number;
    avisos: number;
    infos: number;
  }
  interface Props {
    inventario: Inventario | null;
    /** Nomes para sugerir quando se dá nome a uma spot (as técnicas das Definições) */
    sugestoes: string[];
    /** Páginas onde falta sangria, segundo os alertas */
    paginasSemSangria: number;
    /** Sangria de referência das Definições */
    sangriaMm: number;
    aCorrigir: boolean;
    resumo: ResumoCorrecoes | null;
    antes: Contagem;
    /** Alertas do ficheiro corrigido (null enquanto se analisa) */
    depois: Contagem | null;
    falhou: boolean;
    aoAplicar(pedido: PedidoCorrecoes): void;
    aoDescarregar(): void;
    aoComparar?(): void;
    /** Pedido vindo de um alerta (botão "Corrigir"): prepara o painel. `n` muda a cada pedido. */
    pedido?: { tipo: TipoCorrecao; n: number } | null;
  }
  let { inventario, sugestoes, paginasSemSangria, sangriaMm, aCorrigir, resumo, antes, depois, falhou, aoAplicar, aoDescarregar, aoComparar, pedido = null }: Props = $props();

  // RGB → CMYK
  let rgbVetores = $state(true);
  let rgbImagens = $state(true);

  let branco = $state(true);
  let preto = $state(true);
  let spotsTecnicas = $state(true);
  /** nome atual → nome novo (vazio = não mexer) */
  let renomear = $state<Record<string, string>>({});
  let conversoes = $state<ConversaoSpot[]>([]);
  // texto em curvas
  let curvas = $state(false);
  /** fontes desmarcadas pelo utilizador (nome → true) */
  let curvasFora = $state<Record<string, boolean>>({});
  /** substitutas que só se parecem com a original: ficam desligadas até o utilizador as ligar (nome → true) */
  let arriscadasLigadas = $state<Record<string, boolean>>({});
  const chaveProcura = (n: FonteNaoIncorporada) => `${n.nomeBase}|${n.negrito}|${n.italico}|${n.serifa}|${n.mono}`;
  /**
   * Fontes não incorporadas procuradas no computador (só na versão desktop): chave → fonte encontrada ou null.
   * `undefined` na chave = ainda a procurar.
   */
  let instaladas = $state.raw<Record<string, FonteInstalada | null>>({});
  let procurou = 0;
  $effect(() => {
    const pedidos = new Map<string, FonteNaoIncorporada>();
    for (const f of inventario?.fontes ?? []) if (f.substituivel) pedidos.set(chaveProcura(f.substituivel), f.substituivel);
    instaladas = {};
    if (!desktop || pedidos.size === 0) return;
    const minha = ++procurou;
    const chaves = [...pedidos.keys()];
    desktop
      .fontesDoSistema([...pedidos.values()])
      .then((r) => {
        if (minha !== procurou) return;
        instaladas = Object.fromEntries(chaves.map((c, i) => [c, r[i] ?? null]));
      })
      .catch(() => {
        if (minha === procurou) instaladas = Object.fromEntries(chaves.map((c) => [c, null]));
      });
  });

  type EstadoFonte = 'incorporada' | 'instalada' | 'procura' | 'em-falta' | 'so-desktop' | 'nao';
  interface GrupoFonte {
    nome: string;
    ids: string[];
    convertivel: boolean;
    motivo?: string;
    estado: EstadoFonte;
    /** Nota para o utilizador sobre de onde vem o desenho */
    nota?: string;
    instalada?: FonteInstalada;
    /** A fonte usada tem outro desenho (parecida ou só do mesmo género): tem de ser o utilizador a querer */
    arriscada?: boolean;
  }
  const escolhida = (f: GrupoFonte) => (f.arriscada ? !!arriscadasLigadas[f.nome] : !curvasFora[f.nome]);
  /** Um ficheiro pode ter dezenas de subconjuntos da mesma fonte: aqui contam-se por nome */
  const fontes = $derived.by(() => {
    const g = new Map<string, GrupoFonte>();
    for (const f of inventario?.fontes ?? []) {
      const chave = `${f.nome}|${f.convertivel}|${f.motivo ?? ''}|${f.substituivel ? chaveProcura(f.substituivel) : ''}`;
      let e = g.get(chave);
      if (!e) {
        e = { nome: f.nome, ids: [], convertivel: f.convertivel, motivo: f.motivo, estado: f.convertivel ? 'incorporada' : 'nao' };
        if (f.substituivel) {
          if (!desktop) {
            e.estado = 'so-desktop';
            e.nota = 'Na app desktop o texto desta fonte desenha-se com a fonte instalada no computador.';
          } else if (!(chaveProcura(f.substituivel) in instaladas)) {
            e.estado = 'procura';
            e.nota = 'a procurar nas fontes deste computador…';
          } else {
            const i = instaladas[chaveProcura(f.substituivel)];
            if (i) {
              e.estado = 'instalada';
              e.convertivel = true;
              e.instalada = i;
              e.arriscada = i.grau === 'parecida' || i.grau === 'generica';
              e.nota =
                i.grau === 'exata'
                  ? `Não incorporada. Usa «${i.nome}», instalada neste computador.`
                  : i.grau === 'metricas'
                    ? `Não incorporada. Usa «${i.nome}» deste computador (equivalente, não a original).`
                    : i.grau === 'parecida'
                      ? `Não incorporada e não instalada. Posso usar «${i.nome}», parecida mas com outro desenho. Desligada até a ligares.`
                      : `Não incorporada e não instalada. Posso usar «${i.nome}», só do mesmo género: as letras ficam com outro aspeto. Desligada até a ligares.`;
            } else {
              e.estado = 'em-falta';
              e.nota = 'Não incorporada e não está instalada neste computador.';
            }
          }
        }
        g.set(chave, e);
      }
      e.ids.push(f.id);
    }
    return [...g.values()];
  });
  const fontesConvertiveis = $derived(fontes.filter((f) => f.convertivel));
  const fontesEscolhidas = $derived(fontesConvertiveis.filter(escolhida).flatMap((f) => f.ids));
  const haSubstitutas = $derived(fontesConvertiveis.some((f) => f.estado === 'instalada' && escolhida(f)));
  /** As fontes instaladas a usar, por id de fonte do PDF */
  function externasEscolhidas() {
    const r: Record<string, { nome: string; bytes: Uint8Array }> = {};
    for (const f of fontesConvertiveis) if (f.instalada && escolhida(f)) for (const id of f.ids) r[id] = { nome: f.instalada.nome, bytes: f.instalada.bytes };
    return r;
  }

  // sangria
  let sangria = $state(false);
  let sangriaEscolhida = $state<number | null>(null);
  const sangriaValor = $derived(sangriaEscolhida ?? sangriaMm);

  /** Secção a destacar durante um instante, depois de um pedido de fora */
  let destaque = $state('');
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const p = pedido;
    if (!p) return;
    void p.n;
    untrack(() => {
      let secao = '';
      switch (p.tipo) {
        case 'rgb-cmyk':
          rgbVetores = true;
          rgbImagens = true;
          secao = 'rgb';
          break;
        case 'sangria':
          sangria = true;
          secao = 'sangria';
          break;
        case 'overprint-branco':
          branco = true;
          secao = 'overprint';
          break;
        case 'overprint-preto':
          preto = true;
          secao = 'overprint';
          break;
        case 'overprint-spots':
          spotsTecnicas = true;
          secao = 'overprint';
          break;
        case 'juntar-spots':
          juntarDuplicadas();
          secao = 'spots';
          break;
        case 'faca-em-spot': {
          const c = inventario?.coresDeTraco[0];
          if (c) corEscolhida = c.valores.join(',');
          if (!nomeNovo.trim()) nomeNovo = 'CutContour';
          secao = 'converter';
          break;
        }
        case 'curvas':
          curvas = true;
          secao = 'curvas';
          break;
      }
      destaque = secao;
      clearTimeout(temporizador);
      temporizador = setTimeout(() => (destaque = ''), 2200);
      requestAnimationFrame(() => document.getElementById(`corr-${secao}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    });
  });

  // nova conversão
  let corEscolhida = $state('');
  let nomeNovo = $state('');
  let onde = $state<ConversaoSpot['onde']>('traco');
  let comOverprint = $state(true);

  /** Spots parecidas com a cor escolhida, das bibliotecas do utilizador */
  const sugestoesCor = $derived.by(() => {
    if (!corEscolhida || bibliotecas.lista.length === 0) return [];
    const v = corEscolhida.split(',').map(Number);
    if (v.length !== 4 || v.some((x) => !Number.isFinite(x))) return [];
    return sugerirCores(cmykParaLab(v[0], v[1], v[2], v[3]), $state.snapshot(bibliotecas.lista), 5);
  });
  const css = (lab: [number, number, number]) => `rgb(${labParaRgb(lab).map((x) => Math.round(x * 255)).join(' ')})`;
  const rotuloDeltaE = (d: number) => (d < 2 ? 'quase igual' : d < 5 ? 'muito parecida' : d < 10 ? 'parecida' : 'diferente');

  const rgbN = $derived(inventario?.rgb ?? { vetores: 0, imagens: 0 });
  const ov = $derived(inventario?.overprint ?? { branco: 0, pretoTexto: 0, pretoLinha: 0, spotsTecnicas: 0 });
  const nPreto = $derived(ov.pretoTexto + ov.pretoLinha);
  const pct = (v: number) => Math.round(v * 100);
  const rotuloCor = (v: number[]) => `C${pct(v[0])} M${pct(v[1])} Y${pct(v[2])} K${pct(v[3])}`;
  const plural = (n: number, a: string, b: string) => (n === 1 ? a : b);

  function juntarDuplicadas() {
    const r = { ...renomear };
    for (const j of inventario?.juncoesSugeridas ?? []) r[j.de] = j.para;
    renomear = r;
  }

  function adicionarConversao() {
    const c = inventario?.coresDeTraco.find((x) => x.valores.join(',') === corEscolhida);
    if (!c || !nomeNovo.trim()) return;
    conversoes = [...conversoes, { de: c.valores, onde, nome: nomeNovo.trim(), alternativa: c.valores, overprint: comOverprint }];
    nomeNovo = '';
  }

  const nada = $derived(
    !(branco && ov.branco) &&
      !(preto && nPreto) &&
      !(spotsTecnicas && ov.spotsTecnicas) &&
      !Object.entries(renomear).some(([de, para]) => para.trim() && para.trim() !== de) &&
      conversoes.length === 0 &&
      !(curvas && fontesEscolhidas.length > 0) &&
      !(sangria && paginasSemSangria > 0 && sangriaValor > 0) &&
      !(rgbVetores && rgbN.vetores > 0) &&
      !(rgbImagens && rgbN.imagens > 0),
  );

  function aplicar() {
    aoAplicar({
      overprintBranco: branco,
      overprintPreto: preto,
      overprintSpots: spotsTecnicas,
      renomear: Object.entries(renomear)
        .filter(([de, para]) => para.trim() && para.trim() !== de)
        .map(([de, para]) => ({ de, para: para.trim() })),
      converter: $state.snapshot(conversoes),
      textoEmCurvas: curvas && fontesEscolhidas.length ? { fontes: fontesEscolhidas, externas: haSubstitutas ? externasEscolhidas() : undefined } : undefined,
      rgbParaCmyk:
        (rgbVetores && rgbN.vetores > 0) || (rgbImagens && rgbN.imagens > 0)
          ? { vetores: rgbVetores && rgbN.vetores > 0, imagens: rgbImagens && rgbN.imagens > 0 }
          : undefined,
      sangria: sangria && paginasSemSangria > 0 && sangriaValor > 0 ? { mm: sangriaValor } : undefined,
    });
  }

  const resumoTexto = $derived.by(() => {
    if (!resumo) return [];
    const l: string[] = [];
    if (resumo.overprintBranco) l.push(`${resumo.overprintBranco} ${plural(resumo.overprintBranco, 'branco deixou', 'brancos deixaram')} de estar em overprint`);
    if (resumo.overprintPreto) l.push(`${resumo.overprintPreto} ${plural(resumo.overprintPreto, 'preto passou', 'pretos passaram')} a overprint`);
    if (resumo.overprintSpots) l.push(`${resumo.overprintSpots} ${plural(resumo.overprintSpots, 'spot técnica passou', 'spots técnicas passaram')} a overprint`);
    if (resumo.spotsRenomeradas) l.push(`${resumo.spotsRenomeradas} ${plural(resumo.spotsRenomeradas, 'espaço de cor mudou', 'espaços de cor mudaram')} de nome`);
    const t = resumo.texto;
    if (t?.operadores) l.push(`${t.operadores} ${plural(t.operadores, 'texto convertido', 'textos convertidos')} em curvas (${t.glifos} glifos)`);
    if (t?.substituidas.length) l.push(`desenhado com fontes instaladas no computador: ${t.substituidas.map((x) => `${x.fonte} → ${x.por}`).join(', ')}`);
    if (t?.fontesRemovidas.length) l.push(`${t.fontesRemovidas.length} ${plural(t.fontesRemovidas.length, 'fonte retirada', 'fontes retiradas')} do ficheiro`);
    const rgb = resumo.rgb;
    if (rgb?.vetores) l.push(`${rgb.vetores} ${plural(rgb.vetores, 'cor RGB passou', 'cores RGB passaram')} a CMYK`);
    if (rgb?.imagens?.convertidas) l.push(`${rgb.imagens.convertidas} ${plural(rgb.imagens.convertidas, 'imagem passou', 'imagens passaram')} a CMYK${rgb.imagens.indexadas ? ` (${rgb.imagens.indexadas} só na paleta)` : ''}`);
    for (const s of rgb?.imagens?.saltadas ?? []) l.push(`${s.n} ${plural(s.n, 'imagem ficou', 'imagens ficaram')} em RGB: ${s.motivo}`);
    if (resumo.sangria?.geradas.length) l.push(`sangria de ${resumo.sangria.mm} mm gerada em ${resumo.sangria.geradas.length} ${plural(resumo.sangria.geradas.length, 'página', 'páginas')}`);
    if (resumo.coresConvertidas) l.push(`${resumo.coresConvertidas} ${plural(resumo.coresConvertidas, 'cor convertida', 'cores convertidas')} em spot`);
    return l;
  });
  const total = (c: Contagem) => c.erros + c.avisos;
</script>

<div class="painel">
  <p class="nota">As correções fazem-se numa cópia. O ficheiro original nunca é alterado.</p>

 <div id="corr-rgb" class="secao" class:destaque={destaque === 'rgb'}>
  <h3>RGB → CMYK</h3>
  <label class:inativo={!rgbN.vetores}>
    <input type="checkbox" bind:checked={rgbVetores} disabled={!rgbN.vetores} />
    <span>Cores de vetores e texto <em>{rgbN.vetores}</em></span>
  </label>
  <label class:inativo={!rgbN.imagens}>
    <input type="checkbox" bind:checked={rgbImagens} disabled={!rgbN.imagens} />
    <span>Imagens <em>{rgbN.imagens}</em></span>
  </label>
  {#if rgbN.vetores || rgbN.imagens}
    <p class="nota">
      Conversão simples, sem perfil de cor: o preto RGB passa a K 100% e os cinzentos ficam só em K. As cores vivas
      mudam um pouco. Para trabalho crítico, converte no Illustrator ou no Photoshop com o perfil da gráfica.
      Uma imagem JPEG passa a CMYK sem compressão com perdas, por isso o ficheiro cresce. Degradés e imagens
      pequenas dentro de padrões não são convertidos.
    </p>
  {:else}
    <p class="nota">Este ficheiro não tem objetos em RGB.</p>
  {/if}
  </div>

  <div id="corr-overprint" class="secao" class:destaque={destaque === 'overprint'}>
  <h3>Overprint</h3>
  <label class:inativo={!ov.branco}>
    <input type="checkbox" bind:checked={branco} disabled={!ov.branco} />
    <span>Desligar em brancos <em>{ov.branco}</em></span>
  </label>
  <label class:inativo={!nPreto}>
    <input type="checkbox" bind:checked={preto} disabled={!nPreto} />
    <span>Ligar em texto e linhas finas a K 100% <em>{nPreto}</em></span>
  </label>
  <label class:inativo={!ov.spotsTecnicas}>
    <input type="checkbox" bind:checked={spotsTecnicas} disabled={!ov.spotsTecnicas} />
    <span>Ligar em spots técnicas (faca, vincos, verniz…) <em>{ov.spotsTecnicas}</em></span>
  </label>
  </div>

  <div id="corr-sangria" class="secao" class:destaque={destaque === 'sangria'}>
  <h3>Sangria</h3>
  <label class:inativo={paginasSemSangria === 0}>
    <input type="checkbox" bind:checked={sangria} disabled={paginasSemSangria === 0} />
    <span>Gerar sangria espelhando a arte <em>{paginasSemSangria} {plural(paginasSemSangria, 'página', 'páginas')}</em></span>
  </label>
  {#if sangria && paginasSemSangria > 0}
    <label class="pequeno sangria-mm">
      <input type="number" min="0.5" max="10" step="0.5" value={sangriaValor} oninput={(e) => (sangriaEscolhida = e.currentTarget.valueAsNumber)} aria-label="Sangria em mm" /> mm de sangria
    </label>
    <p class="nota">Cada lado é espelhado em torno do corte. Serve para fundos, cores lisas e fotografias que acabam no corte; confirma no resultado. Se tiveres a arte original, estende-a lá: dá sempre melhor.</p>
  {/if}
  </div>

  <div id="corr-spots" class="secao" class:destaque={destaque === 'spots'}>
  <h3>Spots</h3>
  {#if !inventario || inventario.spots.length === 0}
    <p class="nota">Este ficheiro não usa spots.</p>
  {:else}
    {#if inventario.juncoesSugeridas.length}
      <button class="sugestao" onclick={juntarDuplicadas}>Juntar duplicadas ({inventario.juncoesSugeridas.length})</button>
    {/if}
    <ul class="spots">
      {#each inventario.spots as s (s.nome)}
        <li>
          <span class="nome" title={s.nome}>{s.nome}</span>
          <span class="n">{s.objetos}</span>
          <input type="text" list="nomes-spot" placeholder="novo nome" bind:value={renomear[s.nome]} aria-label={`Novo nome para ${s.nome}`} />
        </li>
      {/each}
    </ul>
    <datalist id="nomes-spot">
      {#each sugestoes as n (n)}<option value={n}></option>{/each}
    </datalist>
    <p class="nota">Dois nomes iguais passam a ser uma só chapa. Também serve para dar a uma spot o nome que a gráfica espera (CutContour, Branco…).</p>
  {/if}

  </div>

  <div id="corr-converter" class="secao" class:destaque={destaque === 'converter'}>
  <h3>Cor de processo → spot</h3>
  {#if !inventario || inventario.coresDeTraco.length === 0}
    <p class="nota">Não há traços em cores de processo.</p>
  {:else}
    <div class="conv">
      <select bind:value={corEscolhida} aria-label="Cor de processo">
        <option value="">Cor de um traço…</option>
        {#each inventario.coresDeTraco as c (c.valores.join(','))}
          <option value={c.valores.join(',')}>{rotuloCor(c.valores)} · {c.objetos} {plural(c.objetos, 'traço', 'traços')} · {c.espessuraMediaPt} pt</option>
        {/each}
      </select>
      <input type="text" list="nomes-spot" placeholder="nome da spot (ex.: CutContour)" bind:value={nomeNovo} aria-label="Nome da spot nova" />
      <div class="linha">
        <select bind:value={onde} aria-label="Onde">
          <option value="traco">só traços</option>
          <option value="preenchimento">só preenchimentos</option>
          <option value="ambos">traços e preenchimentos</option>
        </select>
        <label class="pequeno"><input type="checkbox" bind:checked={comOverprint} /> overprint</label>
      </div>
      <button onclick={adicionarConversao} disabled={!corEscolhida || !nomeNovo.trim()}>Adicionar</button>
    </div>
    {#if corEscolhida && bibliotecas.lista.length === 0}
      <p class="nota">Carrega bibliotecas de cores nas Definições (.acb ou .ase) e a app sugere a spot mais parecida.</p>
    {/if}
    {#if sugestoesCor.length}
      <div class="sugestoes">
        <span class="nota">Mais parecidas nas tuas bibliotecas:</span>
        <ul>
          {#each sugestoesCor as s (s.biblioteca + s.nome)}
            <li>
              <i class="amostra" style:background={css(s.lab)}></i>
              <button class="ligacao" title={`${s.biblioteca} · ΔE ${s.deltaE.toFixed(1)}`} onclick={() => (nomeNovo = s.nome)}>{s.nome}</button>
              <em>{rotuloDeltaE(s.deltaE)} · ΔE {s.deltaE.toFixed(1).replace('.', ',')}</em>
            </li>
          {/each}
        </ul>
        <span class="nota">Estimativa sem perfil de cor: confirma no catálogo impresso.</span>
      </div>
    {/if}
    {#if conversoes.length}
      <ul class="lista-conv">
        {#each conversoes as c, i (i)}
          <li>
            <span>{rotuloCor(c.de)} → <strong>{c.nome}</strong></span>
            <button class="x" onclick={() => (conversoes = conversoes.filter((_, j) => j !== i))} aria-label="Retirar">×</button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  </div>

  <div id="corr-curvas" class="secao" class:destaque={destaque === 'curvas'}>
  <h3>Texto em curvas</h3>
  {#if fontes.length === 0}
    <p class="nota">Este ficheiro não tem texto.</p>
  {:else}
    <label class:inativo={fontesConvertiveis.length === 0}>
      <input type="checkbox" bind:checked={curvas} disabled={fontesConvertiveis.length === 0} />
      <span>Converter texto em curvas <em>{fontesConvertiveis.length} de {fontes.length} {plural(fontes.length, 'fonte', 'fontes')}</em></span>
    </label>
    <ul class="fontes">
      {#each fontes as f (f.nome + f.estado + f.motivo + (f.instalada?.nome ?? ''))}
        <li class:fora={!f.convertivel}>
          <label>
            <input type="checkbox" disabled={!curvas || !f.convertivel} checked={f.convertivel && escolhida(f)} onchange={(e) => (f.arriscada ? (arriscadasLigadas = { ...arriscadasLigadas, [f.nome]: e.currentTarget.checked }) : (curvasFora = { ...curvasFora, [f.nome]: !e.currentTarget.checked }))} />
            <span class="nome" title={f.nome}>{f.nome}</span>
            {#if f.ids.length > 1}<em>×{f.ids.length}</em>{/if}
          </label>
          {#if f.nota}<span class="motivo" class:boa={f.estado === 'instalada' && !f.arriscada} class:cuidado={f.arriscada}>{f.nota}</span>{:else if f.motivo}<span class="motivo">{f.motivo}</span>{/if}
        </li>
      {/each}
    </ul>
    {#if curvas && haSubstitutas}
      <p class="nota aviso-subst">Há fontes que não vêm no PDF: o desenho sai das fontes instaladas neste computador, com as posições do PDF. Confirma no «Comparar» que o aspeto é o esperado.</p>
    {/if}
    <p class="nota">O texto deixa de ser editável e pesquisável. Fonte desenhada em curvas não depende de a gráfica a ter.</p>
  {/if}

  </div>

  <div class="barra-aplicar">
  <button class="primario aplicar" onclick={aplicar} disabled={aCorrigir || nada}>{aCorrigir ? 'A corrigir…' : 'Aplicar e criar cópia'}</button>
  </div>
  {#if falhou}<p class="erro">Não consegui aplicar as correções.</p>{/if}

  {#if resumo}
    <div class="resultado">
      <strong>Cópia corrigida criada</strong>
      {#if resumoTexto.length}
        <ul>{#each resumoTexto as t (t)}<li>{t}</li>{/each}</ul>
      {:else}
        <p class="nota">Não havia nada a corrigir com estas opções.</p>
      {/if}
      {#if resumo.texto?.naoConvertido.length}
        <div class="nao">
          <strong>Texto que ficou como estava</strong>
          <ul>{#each resumo.texto.naoConvertido as n (n.fonte + n.motivo)}<li>{n.fonte}: {n.motivo} ({n.operadores})</li>{/each}</ul>
        </div>
      {/if}
      <p class="alertas">
        Alertas: <b>{total(antes)}</b> antes →
        {#if depois}<b class:melhor={total(depois) < total(antes)}>{total(depois)}</b> depois{:else}a analisar…{/if}
      </p>
      <div class="acoes">
        <button class="primario" onclick={aoDescarregar}>Descarregar PDF</button>
        {#if aoComparar}<button onclick={aoComparar}>Comparar</button>{/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .painel {
    padding: 8px 12px 16px;
  }
  h3 {
    margin: 16px 0 6px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--texto-2);
  }
  label {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 3px 0;
    cursor: pointer;
  }
  label.inativo {
    color: var(--texto-2);
    cursor: default;
  }
  em {
    font-style: normal;
    color: var(--texto-2);
    font-size: 12px;
  }
  .fontes {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .fontes li {
    display: grid;
  }
  .fontes label {
    padding: 2px 0;
  }
  .fontes .nome {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fontes li.fora {
    color: var(--texto-2);
  }
  .motivo {
    margin-left: 24px;
    font-size: 11px;
    color: var(--texto-2);
  }
  .motivo.cuidado {
    color: var(--aviso);
  }
  .motivo.boa {
    color: var(--ok);
  }
  .nota.aviso-subst {
    color: var(--aviso);
  }
  .nota {
    color: var(--texto-2);
    font-size: 12px;
    margin: 6px 0 0;
  }
  .sugestao {
    margin-bottom: 6px;
  }
  .spots,
  .lista-conv {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .spots li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 8px;
    align-items: center;
  }
  .spots .nome {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .spots .n {
    color: var(--texto-2);
    font-size: 12px;
  }
  .spots input {
    grid-column: 1 / -1;
  }
  .conv {
    display: grid;
    gap: 6px;
  }
  .linha {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .pequeno {
    padding: 0;
    font-size: 12px;
  }
  .sangria-mm {
    align-items: center;
    margin: 4px 0 0 24px;
  }
  .sangria-mm input {
    width: 64px;
  }
  .sugestoes {
    margin-top: 6px;
    display: grid;
    gap: 4px;
  }
  .sugestoes ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 3px;
  }
  .sugestoes li {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    font-size: 12px;
  }
  .amostra {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: 1px solid var(--borda);
  }
  .ligacao {
    all: unset;
    cursor: pointer;
    color: var(--acento, #2456d6);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lista-conv li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
  }
  .x {
    padding: 0 6px;
  }
  .secao {
    margin: 0 -8px;
    padding: 0 8px;
    border-radius: 8px;
    transition: background 0.4s;
  }
  .secao.destaque {
    background: var(--info-fundo);
    box-shadow: 0 0 0 2px var(--acento);
  }
  /* o botão acompanha o scroll: não obriga a descer o painel todo para aplicar */
  .barra-aplicar {
    position: sticky;
    bottom: 0;
    margin: 18px -12px -16px;
    padding: 10px 12px;
    background: var(--superficie);
    border-top: 1px solid var(--borda);
  }
  .aplicar {
    width: 100%;
  }
  .erro {
    color: var(--erro);
  }
  .resultado {
    margin-top: 14px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--ok-fundo);
    color: var(--texto);
    font-size: 13px;
  }
  .resultado ul {
    margin: 4px 0 0;
    padding-left: 16px;
  }
  .alertas {
    margin: 8px 0;
  }
  .nao {
    margin-top: 8px;
    font-size: 12px;
    color: var(--aviso);
  }
  .melhor {
    color: var(--ok);
  }
  .acoes {
    display: flex;
    gap: 6px;
  }
</style>
