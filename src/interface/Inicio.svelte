<script lang="ts">
  import Mascote from './Mascote.svelte';

  interface Props {
    aCarregar: boolean;
    erro: string | null;
    onabrir: () => void;
    onexemplo: () => void;
  }
  let { aCarregar, erro, onabrir, onexemplo }: Props = $props();
</script>

<div class="inicio">
  <div class="aurora" aria-hidden="true"></div>

  <div class="conteudo">
    <!-- Ilustração própria: uma página a ser verificada. O feixe desce e os marcadores aparecem onde passa. -->
    <div class="ilustracao">
      <div class="lupi-canto"><Mascote tamanho={140} estado={aCarregar ? 'analisa' : erro ? 'erro' : 'repouso'} /></div>
      <svg viewBox="0 0 240 320" width="100%" aria-hidden="true">
        <defs>
          <linearGradient id="feixe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#5ee0ff" stop-opacity="0" />
            <stop offset="1" stop-color="#5ee0ff" stop-opacity="0.55" />
          </linearGradient>
          <linearGradient id="barra" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#5ee0ff" />
            <stop offset="1" stop-color="#8b7bff" />
          </linearGradient>
          <clipPath id="recorte"><rect x="30" y="30" width="180" height="260" rx="4" /></clipPath>
        </defs>

        <!-- sangria e corte, a desenhar-se -->
        <rect class="sangria" x="24" y="24" width="192" height="272" rx="6" />
        <rect class="folha" x="30" y="30" width="180" height="260" rx="4" />
        <rect class="corte" x="30" y="30" width="180" height="260" rx="4" />

        <g clip-path="url(#recorte)">
          <rect class="bloco" x="44" y="46" width="90" height="12" rx="3" />
          <rect class="linha" x="44" y="68" width="140" height="6" rx="3" />
          <rect class="linha" x="44" y="82" width="120" height="6" rx="3" />
          <rect class="imagem" x="44" y="108" width="152" height="84" rx="5" />
          <circle class="sol" cx="150" cy="138" r="16" />
          <rect class="linha" x="44" y="208" width="132" height="6" rx="3" />
          <rect class="linha" x="44" y="222" width="104" height="6" rx="3" />
          <rect class="linha" x="44" y="236" width="118" height="6" rx="3" />
          <!-- o feixe -->
          <g class="feixe"><rect x="30" y="-60" width="180" height="60" fill="url(#feixe)" /><rect x="30" y="-1.5" width="180" height="3" fill="url(#barra)" /></g>
        </g>

        <!-- marcadores -->
        <g class="marca m1"><circle cx="196" cy="108" r="10" /><text x="196" y="108" text-anchor="middle" dominant-baseline="central">1</text></g>
        <g class="marca m2"><circle cx="30" cy="226" r="10" /><text x="30" y="226" text-anchor="middle" dominant-baseline="central">2</text></g>
        <g class="marca m3"><circle cx="210" cy="288" r="10" /><text x="210" y="288" text-anchor="middle" dominant-baseline="central">3</text></g>
      </svg>
    </div>

    <div class="texto">
      <p class="etiqueta">Verificador de arte final</p>
      <h1>Arte final<br />sem surpresas.</h1>
      <p class="sub">
        Larga um PDF e vê o que a gráfica vai ver: sangria, cores, fontes, overprint e muito mais. Corrige o que der
        numa cópia e entrega ao cliente um relatório limpo.
      </p>

      <div class="botoes">
        <button class="primario grande" onclick={onabrir} disabled={aCarregar}>{aCarregar ? 'A abrir…' : 'Abrir PDF'}</button>
        <button class="fantasma grande" onclick={onexemplo} disabled={aCarregar}>
          <span class="faisca" aria-hidden="true">✦</span> Experimentar com um exemplo
        </button>
      </div>
      <p class="dica">ou arrasta o ficheiro para qualquer sítio da janela</p>
      {#if erro}<p class="erro" role="alert">{erro}</p>{/if}

      <ul class="garantias">
        <li><b>Mais de 25</b> verificações</li>
        <li><b>Original intacto</b> · corrige numa cópia</li>
        <li><b>No teu computador</b> · o ficheiro não sai daqui</li>
      </ul>
    </div>
  </div>
</div>

<style>
  .inicio {
    position: relative;
    height: 100%;
    display: grid;
    place-items: center;
    padding: 24px;
    overflow: auto;
  }
  /* luz de fundo: duas manchas que se movem devagar */
  .aurora {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(40% 50% at 22% 30%, rgb(94 224 255 / 0.16), transparent 70%),
      radial-gradient(36% 46% at 78% 70%, rgb(139 123 255 / 0.18), transparent 70%);
    animation: deriva 18s ease-in-out infinite alternate;
  }
  @keyframes deriva {
    to {
      transform: translate3d(2.5%, -2%, 0) scale(1.08);
    }
  }
  :global(:root[data-tema='claro']) .aurora {
    opacity: 0.5;
  }
  .conteudo {
    position: relative;
    display: grid;
    grid-template-columns: minmax(200px, 300px) minmax(0, 460px);
    gap: clamp(24px, 5vw, 64px);
    align-items: center;
    max-width: 880px;
    animation: entra 0.6s ease both;
  }
  .ilustracao {
    position: relative;
  }
  .lupi-canto {
    position: absolute;
    right: -52px;
    bottom: -24px;
    z-index: 2;
    filter: drop-shadow(0 10px 24px rgb(94 224 255 / 0.25));
  }
  .ilustracao {
    filter: drop-shadow(0 20px 50px rgb(94 224 255 / 0.12));
  }
  .etiqueta {
    margin: 0 0 10px;
    font: 600 12px ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--acento);
  }
  h1 {
    margin: 0 0 14px;
    font-size: clamp(32px, 5vw, 50px);
    line-height: 1.05;
    letter-spacing: -0.03em;
    font-weight: 700;
    background: var(--brilho);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .sub {
    margin: 0 0 22px;
    color: var(--texto-2);
    font-size: 15px;
    line-height: 1.55;
    max-width: 44ch;
  }
  .botoes {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  button.grande {
    padding: 11px 20px;
    font-size: 15px;
    border-radius: 12px;
  }
  button.fantasma {
    background: transparent;
    border-color: var(--borda);
    color: var(--texto);
  }
  button.fantasma:hover:not(:disabled) {
    border-color: var(--acento);
    box-shadow: var(--brilho-sombra);
    background: transparent;
  }
  .faisca {
    color: var(--acento);
  }
  .dica {
    margin: 10px 2px 0;
    font-size: 12px;
    color: var(--texto-2);
  }
  .erro {
    margin: 12px 0 0;
    color: var(--erro);
  }
  .garantias {
    list-style: none;
    margin: 26px 0 0;
    padding: 0;
    display: grid;
    gap: 6px;
    font-size: 13px;
    color: var(--texto-2);
  }
  .garantias li::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 10px;
    border-radius: 50%;
    background: var(--brilho);
    vertical-align: middle;
  }
  .garantias b {
    color: var(--texto);
    font-weight: 600;
  }

  /* ilustração */
  .folha {
    fill: var(--superficie-2);
  }
  .corte {
    fill: none;
    stroke: var(--caixa-trim);
    stroke-width: 1.2;
    stroke-dasharray: 760;
    stroke-dashoffset: 760;
    animation: desenha 1.6s 0.3s ease forwards;
  }
  .sangria {
    fill: none;
    stroke: var(--caixa-bleed);
    stroke-width: 1;
    stroke-dasharray: 5 4;
    opacity: 0;
    animation: aparece 0.8s 1.4s ease forwards;
  }
  @keyframes desenha {
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes aparece {
    to {
      opacity: 0.8;
    }
  }
  .bloco {
    fill: var(--texto);
    opacity: 0.85;
  }
  .linha {
    fill: var(--texto-2);
    opacity: 0.35;
  }
  .imagem {
    fill: color-mix(in srgb, var(--acento) 28%, var(--superficie-2));
  }
  .sol {
    fill: #ff5d73;
    opacity: 0.9;
  }
  .feixe {
    animation: varrer 7s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }
  @keyframes varrer {
    0% {
      transform: translateY(30px);
      opacity: 0;
    }
    6% {
      opacity: 1;
    }
    62% {
      transform: translateY(300px);
      opacity: 1;
    }
    70%,
    100% {
      transform: translateY(300px);
      opacity: 0;
    }
  }
  .marca {
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
  }
  .marca circle {
    stroke: var(--superficie);
    stroke-width: 2;
  }
  .marca text {
    fill: #06121a;
    font: 700 11px ui-monospace, Menlo, Consolas, monospace;
  }
  .m1 circle {
    fill: #ff5d73;
  }
  .m2 circle {
    fill: #ffb547;
  }
  .m3 circle {
    fill: #5ee0ff;
  }
  .m1 {
    animation: marca1 7s infinite;
  }
  .m2 {
    animation: marca2 7s infinite;
  }
  .m3 {
    animation: marca3 7s infinite;
  }
  /* o marcador aparece quando o feixe lá chega (o feixe vai de 6% a 62% do ciclo) */
  @keyframes marca1 {
    0%,
    20% {
      opacity: 0;
      transform: scale(0.3);
    }
    26% {
      opacity: 1;
      transform: scale(1.25);
    }
    30%,
    90% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes marca2 {
    0%,
    42% {
      opacity: 0;
      transform: scale(0.3);
    }
    48% {
      opacity: 1;
      transform: scale(1.25);
    }
    52%,
    90% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes marca3 {
    0%,
    58% {
      opacity: 0;
      transform: scale(0.3);
    }
    64% {
      opacity: 1;
      transform: scale(1.25);
    }
    68%,
    90% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0;
    }
  }

  @media (max-width: 760px) {
    .conteudo {
      grid-template-columns: 1fr;
      justify-items: center;
      text-align: center;
    }
    .ilustracao {
      width: 170px;
    }
    .sub {
      margin-inline: auto;
    }
    .botoes {
      justify-content: center;
    }
  }
</style>
