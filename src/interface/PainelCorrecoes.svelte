<script lang="ts">
  import type { ConversaoSpot, PedidoCorrecoes, ResumoCorrecoes } from '../correcoes/aplicar';
  import type { Inventario } from '../correcoes/inventario';

  interface Contagem {
    erros: number;
    avisos: number;
    infos: number;
  }
  interface Props {
    inventario: Inventario | null;
    /** Nomes para sugerir quando se dá nome a uma spot (as técnicas das Definições) */
    sugestoes: string[];
    aCorrigir: boolean;
    resumo: ResumoCorrecoes | null;
    antes: Contagem;
    /** Alertas do ficheiro corrigido (null enquanto se analisa) */
    depois: Contagem | null;
    falhou: boolean;
    aoAplicar(pedido: PedidoCorrecoes): void;
    aoDescarregar(): void;
    aoComparar?(): void;
  }
  let { inventario, sugestoes, aCorrigir, resumo, antes, depois, falhou, aoAplicar, aoDescarregar, aoComparar }: Props = $props();

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
  /** Um ficheiro pode ter dezenas de subconjuntos da mesma fonte: aqui contam-se por nome */
  const fontes = $derived.by(() => {
    const g = new Map<string, { nome: string; ids: string[]; convertivel: boolean; motivo?: string }>();
    for (const f of inventario?.fontes ?? []) {
      const chave = `${f.nome}|${f.convertivel}|${f.motivo ?? ''}`;
      const e = g.get(chave) ?? g.set(chave, { nome: f.nome, ids: [], convertivel: f.convertivel, motivo: f.motivo }).get(chave)!;
      e.ids.push(f.id);
    }
    return [...g.values()];
  });
  const fontesConvertiveis = $derived(fontes.filter((f) => f.convertivel));
  const fontesEscolhidas = $derived(fontesConvertiveis.filter((f) => !curvasFora[f.nome]).flatMap((f) => f.ids));

  // nova conversão
  let corEscolhida = $state('');
  let nomeNovo = $state('');
  let onde = $state<ConversaoSpot['onde']>('traco');
  let comOverprint = $state(true);

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
      !(curvas && fontesEscolhidas.length > 0),
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
      textoEmCurvas: curvas && fontesEscolhidas.length ? { fontes: fontesEscolhidas } : undefined,
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
    if (t?.fontesRemovidas.length) l.push(`${t.fontesRemovidas.length} ${plural(t.fontesRemovidas.length, 'fonte retirada', 'fontes retiradas')} do ficheiro`);
    if (resumo.coresConvertidas) l.push(`${resumo.coresConvertidas} ${plural(resumo.coresConvertidas, 'cor convertida', 'cores convertidas')} em spot`);
    return l;
  });
  const total = (c: Contagem) => c.erros + c.avisos;
</script>

<div class="painel">
  <p class="nota">As correções fazem-se numa cópia. O ficheiro original nunca é alterado.</p>

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

  <h3>Texto em curvas</h3>
  {#if fontes.length === 0}
    <p class="nota">Este ficheiro não tem texto.</p>
  {:else}
    <label class:inativo={fontesConvertiveis.length === 0}>
      <input type="checkbox" bind:checked={curvas} disabled={fontesConvertiveis.length === 0} />
      <span>Converter texto em curvas <em>{fontesConvertiveis.length} de {fontes.length} {plural(fontes.length, 'fonte', 'fontes')}</em></span>
    </label>
    <ul class="fontes">
      {#each fontes as f (f.nome + f.convertivel + f.motivo)}
        <li class:fora={!f.convertivel}>
          <label>
            <input type="checkbox" disabled={!curvas || !f.convertivel} checked={f.convertivel && !curvasFora[f.nome]} onchange={(e) => (curvasFora = { ...curvasFora, [f.nome]: !e.currentTarget.checked })} />
            <span class="nome" title={f.nome}>{f.nome}</span>
            {#if f.ids.length > 1}<em>×{f.ids.length}</em>{/if}
          </label>
          {#if f.motivo}<span class="motivo">{f.motivo}</span>{/if}
        </li>
      {/each}
    </ul>
    <p class="nota">O texto deixa de ser editável e pesquisável. Fonte desenhada em curvas não depende de a gráfica a ter.</p>
  {/if}

  <button class="primario aplicar" onclick={aplicar} disabled={aCorrigir || nada}>{aCorrigir ? 'A corrigir…' : 'Aplicar e criar cópia'}</button>
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
  .lista-conv li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
  }
  .x {
    padding: 0 6px;
  }
  .aplicar {
    width: 100%;
    margin-top: 18px;
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
