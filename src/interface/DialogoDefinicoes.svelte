<script lang="ts">
  import { onMount } from 'svelte';
  import { SPOTS_TECNICAS_OMISSAO } from '../alertas/tipos';
  import { FORMATOS_PREDEFINIDOS } from '../comum/formatos';
  import { definicoes } from './definicoes.svelte';
  import Mascote from './Mascote.svelte';
  import { ACESSORIOS, CORES, PERFIL_OMISSAO, normalizarCor } from '../mascote/personalizacao';
  import { adicionarBiblioteca, bibliotecas, removerBiblioteca } from './bibliotecas.svelte';

  interface Props {
    onfechar: () => void;
  }
  let { onfechar }: Props = $props();

  let dialogo: HTMLDialogElement;

  // O texto é guardado à parte: se o campo fosse reescrito a cada tecla, o Enter desaparecia
  let textoSpots = $state(definicoes.spotsTecnicas.join('\n'));

  function aoEditarSpots(valor: string) {
    textoSpots = valor;
    definicoes.spotsTecnicas = valor.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  function reporSpots() {
    definicoes.spotsTecnicas = [...SPOTS_TECNICAS_OMISSAO];
    textoSpots = definicoes.spotsTecnicas.join('\n');
  }

  let erroBiblioteca = $state('');
  async function aoEscolherBibliotecas(e: Event & { currentTarget: HTMLInputElement }) {
    erroBiblioteca = '';
    const campo = e.currentTarget; // depois de um await, currentTarget já é null
    const ficheiros = Array.from(campo.files ?? []);
    campo.value = '';
    for (const f of ficheiros) {
      try {
        await adicionarBiblioteca(f);
      } catch (err) {
        erroBiblioteca = `${f.name}: ${(err as Error).message}`;
      }
    }
  }

  onMount(() => dialogo.showModal());

  function adicionar() {
    definicoes.formatos.push({ nome: 'Novo formato', larguraMm: 100, alturaMm: 100 });
  }

  function remover(i: number) {
    definicoes.formatos.splice(i, 1);
  }

  function restaurar() {
    if (confirm('Repor a lista de formatos original? Perdes os formatos que juntaste.')) {
      definicoes.formatos = FORMATOS_PREDEFINIDOS.map((f) => ({ ...f }));
    }
  }

  const invalido = (v: unknown) => !(typeof v === 'number' && v > 0);
</script>

<dialog bind:this={dialogo} onclose={onfechar} onclick={(e) => e.target === dialogo && dialogo.close()}>
  <form method="dialog">
    <header>
      <h2>Definições</h2>
      <button class="icone" aria-label="Fechar">✕</button>
    </header>

    <section>
      <h3>Mascote</h3>
      <label class="campo">
        <span>Mostrar a mascote</span>
        <input type="checkbox" bind:checked={definicoes.mascote.visivel} />
      </label>
      {#if definicoes.mascote.visivel}
        <div class="mascote-editor">
          <div class="previa"><Mascote tamanho={140} cauda={false} estado="repouso" /></div>
          <div class="opcoes">
            <div class="grupo">
              <span class="rotulo">Cor</span>
              <div class="cores">
                {#each CORES as c (c.cor)}
                  <button type="button" class="cor" class:ativa={definicoes.mascote.cor === c.cor} style:background={c.cor} title={c.nome} aria-label={c.nome} onclick={() => (definicoes.mascote.cor = c.cor)}></button>
                {/each}
                <input
                  type="color"
                  class="cor-livre"
                  title="Outra cor"
                  aria-label="Outra cor"
                  value={definicoes.mascote.cor}
                  oninput={(e) => {
                    const c = normalizarCor(e.currentTarget.value);
                    if (c) definicoes.mascote.cor = c;
                  }}
                />
              </div>
            </div>
            <div class="grupo">
              <span class="rotulo">Bolas CMYK</span>
              <div class="pilulas">
                <button type="button" class:ativa={definicoes.mascote.bolas} onclick={() => (definicoes.mascote.bolas = true)}>Com bolas</button>
                <button type="button" class:ativa={!definicoes.mascote.bolas} onclick={() => (definicoes.mascote.bolas = false)}>Sem bolas</button>
              </div>
            </div>
            <div class="grupo">
              <span class="rotulo">Acessório</span>
              <div class="pilulas">
                {#each ACESSORIOS as a (a.valor)}
                  <button type="button" class:ativa={definicoes.mascote.acessorio === a.valor} onclick={() => (definicoes.mascote.acessorio = a.valor)}>{a.nome}</button>
                {/each}
              </div>
            </div>
            <button type="button" class="repor" onclick={() => (definicoes.mascote = { ...PERFIL_OMISSAO })}>Repor mascote</button>
          </div>
        </div>
        <p class="ajuda">Clica nela para ver uma festa. Quando o ficheiro está a ser analisado, voa com as quatro bolas atrás.</p>
      {/if}
    </section>

    <section>
      <h3>Sangria e tolerâncias</h3>
      <label class="campo">
        <span>Sangria de referência (mm)</span>
        <input type="number" min="0" step="0.5" bind:value={definicoes.sangriaReferenciaMm} />
      </label>
      <label class="campo">
        <span>Tolerância na deteção de formatos (± mm)</span>
        <input type="number" min="0" step="0.1" bind:value={definicoes.toleranciaFormatoMm} />
      </label>
    </section>

    <section>
      <h3>Resolução das imagens</h3>
      <p class="ajuda">Resolução efetiva: pixels da imagem a dividir pelo tamanho a que está colocada.</p>
      <label class="campo">
        <span>Aviso abaixo de (ppi)</span>
        <input type="number" min="0" step="10" bind:value={definicoes.resolucaoAvisoPpi} />
      </label>
      <label class="campo">
        <span>Erro abaixo de (ppi)</span>
        <input type="number" min="0" step="10" bind:value={definicoes.resolucaoErroPpi} />
      </label>
    </section>

    <section>
      <h3>QR codes</h3>
      <label class="campo">
        <span>Procurar QR codes</span>
        <input type="checkbox" bind:checked={definicoes.verificarQrCodes} />
      </label>
      <label class="campo">
        <span>Tamanho mínimo (mm de lado)</span>
        <input type="number" min="0" step="1" bind:value={definicoes.qrTamanhoMinimoMm} />
      </label>
      <p class="ajuda">Lê os QR codes das páginas e diz para onde levam. Procura nas primeiras 60 páginas com gráficos ou imagens.</p>
    </section>

    <section>
      <h3>Marcas de corte</h3>
      <label class="campo">
        <span>Verificar marcas de corte</span>
        <input type="checkbox" bind:checked={definicoes.verificarMarcasCorte} />
      </label>
      <label class="campo">
        <span>Cor das marcas</span>
        <select bind:value={definicoes.marcasCorteCor}>
          <option value="registo">Registo (offset)</option>
          <option value="preto">Só preto K (digital)</option>
        </select>
      </label>
      <p class="ajuda">Em offset esperam-se em cor de registo; em impressão digital, só a preto, para não gastarem as quatro tintas. Ficam sempre fora da sangria.</p>
    </section>

    <section>
      <h3>Revisão do texto</h3>
      <label class="campo">
        <span>Rever o texto (português de Portugal)</span>
        <input type="checkbox" bind:checked={definicoes.revisarTexto} />
      </label>
      <p class="ajuda">Apanha vocabulário e formatos do Brasil, «estou fazendo», grafias misturadas e deslizes de pontuação. Não é um corretor ortográfico: não encontra gralhas dentro das palavras, por isso revê sempre o texto.</p>
    </section>

    <section>
      <h3>Relatório</h3>
      <label class="campo">
        <span>Nome que assina o relatório</span>
        <input type="text" maxlength="80" placeholder="ex.: Blank Studios" bind:value={definicoes.autorRelatorio} />
      </label>
    </section>

    <section>
      <h3>Tinta e cadernos</h3>
      <label class="campo">
        <span>Tinta total máxima (C+M+Y+K, em %)</span>
        <input type="number" min="0" step="10" bind:value={definicoes.tintaTotalMaxPercent} />
      </label>
      <label class="campo">
        <span>Nº de páginas múltiplo de</span>
        <input type="number" min="0" step="1" bind:value={definicoes.multiploPaginas} />
      </label>
      <p class="ajuda">0 desliga a verificação. 300% é o habitual em papel couché; em jornal ou papel não revestido, 240%–260%. Os cadernos pedem múltiplos de 4 (só se avisa com mais de 4 páginas).</p>
    </section>

    <section>
      <h3>Zona de segurança</h3>
      <p class="ajuda">Distância mínima do texto e da arte ao corte. O habitual é entre 3 e 5 mm.</p>
      <label class="campo">
        <span>Distância ao corte (mm)</span>
        <input type="number" min="0" step="0.5" bind:value={definicoes.zonaSegurancaMm} />
      </label>
    </section>

    <section>
      <h3>Overprint</h3>
      <label class="campo">
        <span>Linhas a K 100% com overprint, até (pt)</span>
        <input type="number" min="0" step="0.25" bind:value={definicoes.overprintLinhaMaxPt} />
      </label>
      <p class="ajuda">O texto a K 100% sobre cor deve levar sempre overprint. As spots técnicas (faca, vincos, verniz) também.</p>
    </section>

    <section>
      <h3>Linhas e preto</h3>
      <label class="campo">
        <span>Linha mínima (pt)</span>
        <input type="number" min="0" step="0.05" bind:value={definicoes.linhaMinimaPt} />
      </label>
      <label class="campo">
        <span>Texto abaixo de (pt) não deve ter preto de 4 cores</span>
        <input type="number" min="0" step="1" bind:value={definicoes.textoPretoMaxPt} />
      </label>
      <label class="campo">
        <span>Fundo só em K 100%, a partir de (% da página)</span>
        <input type="number" min="0" max="100" step="5" bind:value={definicoes.fundoPretoMinimoPercent} />
      </label>
    </section>

    <section>
      <h3>Spots técnicas</h3>
      <p class="ajuda">
        Tintas que não são de impressão (faca, vincos, verniz, branco). Uma por linha, sem distinguir maiúsculas.
        Não pedem sangria nem são tratadas como cor de arte.
      </p>
      <textarea rows="5" value={textoSpots} oninput={(e) => aoEditarSpots(e.currentTarget.value)} aria-label="Nomes das spots técnicas"></textarea>
      <div class="acoes">
        <button type="button" onclick={reporSpots}>Repor lista</button>
      </div>
    </section>

    <section>
      <h3>Bibliotecas de cores</h3>
      <p class="ajuda">
        Carrega as bibliotecas de spots que já tens (ficheiros .acb ou .ase do Illustrator, Photoshop ou InDesign).
        Ao converter uma cor em spot, a app sugere as mais parecidas. Os ficheiros ficam só neste computador.
      </p>
      {#if bibliotecas.lista.length}
        <ul class="bibliotecas">
          {#each bibliotecas.lista as b (b.nome)}
            <li>
              <span>{b.nome} <em>{b.cores.length} cores</em></span>
              <button type="button" class="icone" onclick={() => removerBiblioteca(b.nome)} aria-label="Remover {b.nome}">🗑</button>
            </li>
          {/each}
        </ul>
      {/if}
      <label class="botao-ficheiro">
        <input type="file" accept=".acb,.ase" multiple onchange={aoEscolherBibliotecas} />
        <span>Adicionar biblioteca…</span>
      </label>
      {#if erroBiblioteca}<p class="ajuda erro">{erroBiblioteca}</p>{/if}
      {#if !bibliotecas.guardado}<p class="ajuda erro">Não consegui guardar as bibliotecas: valem só até fechares a página.</p>{/if}
      <p class="ajuda">A comparação é feita em Lab com ΔE 2000. As cores CMYK do ficheiro são convertidas sem perfil, por isso a sugestão é "parecida", não "igual": confirma sempre no catálogo.</p>
    </section>

    <section>
      <h3>Formatos conhecidos</h3>
      <p class="ajuda">Larguras e alturas ao alto (vertical). A app reconhece-os também deitados.</p>
      <div class="formatos">
        <span class="cab">Nome</span><span class="cab">Largura</span><span class="cab">Altura</span><span></span>
        {#each definicoes.formatos as f, i (i)}
          <input type="text" bind:value={f.nome} aria-label="Nome do formato" />
          <input type="number" min="0" step="0.1" bind:value={f.larguraMm} aria-invalid={invalido(f.larguraMm)} aria-label="Largura em mm" />
          <input type="number" min="0" step="0.1" bind:value={f.alturaMm} aria-invalid={invalido(f.alturaMm)} aria-label="Altura em mm" />
          <button type="button" class="icone" onclick={() => remover(i)} aria-label="Remover {f.nome}">🗑</button>
        {/each}
      </div>
      <div class="acoes">
        <button type="button" onclick={adicionar}>+ Juntar formato</button>
        <button type="button" onclick={restaurar}>Repor originais</button>
      </div>
    </section>

    <footer>
      <button class="primario">Fechar</button>
    </footer>
  </form>
</dialog>

<style>
  dialog {
    border: 1px solid var(--borda);
    border-radius: 12px;
    background: var(--superficie);
    color: var(--texto);
    padding: 0;
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    box-shadow: var(--sombra);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }
  form {
    display: grid;
    gap: 4px;
  }
  header,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
  }
  footer {
    justify-content: flex-end;
    border-top: 1px solid var(--borda);
    margin-top: 8px;
  }
  h2 {
    margin: 0;
    font-size: 17px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--texto-2);
  }
  .mascote-editor {
    display: flex;
    gap: 18px;
    align-items: center;
    flex-wrap: wrap;
    margin: 8px 0;
  }
  .previa {
    flex: none;
    width: 160px;
    height: 160px;
    display: grid;
    place-items: center;
    border-radius: 16px;
    background: var(--superficie-2);
  }
  .opcoes {
    flex: 1;
    min-width: 220px;
    display: grid;
    gap: 10px;
  }
  .grupo {
    display: grid;
    gap: 5px;
  }
  .rotulo {
    font-size: 12px;
    color: var(--texto-2);
  }
  .cores,
  .pilulas {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .cor {
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid transparent;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.25);
    cursor: pointer;
  }
  .cor.ativa {
    border-color: var(--acento);
  }
  .cor-livre {
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }
  .pilulas button,
  .repor {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    cursor: pointer;
  }
  .pilulas button.ativa {
    background: var(--acento);
    color: var(--acento-texto);
    border-color: var(--acento);
  }
  .repor {
    justify-self: start;
  }
  section {
    padding: 8px 18px;
  }
  .campo {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .campo input {
    width: 90px;
  }
  .ajuda {
    margin: 0 0 8px;
    color: var(--texto-2);
    font-size: 12px;
  }
  .bibliotecas {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .bibliotecas li {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .bibliotecas em {
    font-style: normal;
    color: var(--texto-2);
    font-size: 12px;
  }
  .botao-ficheiro {
    display: inline-block;
    cursor: pointer;
    padding: 6px 12px;
    border: 1px solid var(--borda);
    border-radius: 6px;
  }
  .botao-ficheiro input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  .erro {
    color: var(--erro);
  }
  .formatos {
    display: grid;
    grid-template-columns: 1fr 80px 80px 36px;
    gap: 6px;
    max-height: 260px;
    overflow: auto;
    padding-right: 4px;
  }
  .cab {
    font-size: 12px;
    color: var(--texto-2);
  }
  textarea {
    width: 100%;
    resize: vertical;
    background: var(--superficie);
    border: 1px solid var(--borda);
    border-radius: 6px;
    padding: 6px 8px;
    font: inherit;
    color: inherit;
  }
  input[aria-invalid='true'] {
    border-color: var(--erro);
  }
  .acoes {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
</style>
