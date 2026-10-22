import { criarMascote } from './mascote.js';
import { PILULAS } from './pilulas/catalogo.js';

const ilha = document.getElementById('ilha');
const cabeca = document.getElementById('cabeca');
const gota = document.getElementById('gota');
const resumos = document.getElementById('resumos');
const painel = document.getElementById('painel');

const mascote = criarMascote(28);
gota.append(mascote);

// Os olhos seguem o cursor enquanto a ilha está à vista
document.addEventListener('mousemove', (e) => {
  if (fase === 'fechada') return;
  const c = gota.getBoundingClientRect();
  if (!c.width) return;
  const cx = c.left + c.width / 2;
  const cy = c.top + c.height / 2;
  mascote.olhar?.((e.clientX - cx) / 160, (e.clientY - cy) / 120);
});

/** Medidas da notch deste Mac; chegam do processo principal ao arrancar */
let notch = { largura: 184, altura: 32, temNotch: false };
let estado = { versao: 1, capturas: [], clientes: [] };
/** 'fechada' | 'espreita' | 'aberta' */
let fase = 'fechada';
let aFechar = null;

const ALTURA_CABECA = 34;
const LARGURA_ABERTA = 520;
/** Margem transparente à volta da ilha quando está aberta, para a sombra caber */
const MARGEM_ABERTA = 22;

const api = {
  async acao(nome, carga) {
    const novo = await window.pingo.acao(nome, carga);
    if (novo) {
      estado = novo;
      desenhar();
      medir();
    }
  },
  abrirLigacao: (url) => window.pingo.abrirLigacao(url),
  festejar: () => mascote.festejar?.(),
};

// --- desenho ---------------------------------------------------------------

function desenharResumos() {
  resumos.replaceChildren();
  const linhas = PILULAS.map((p) => [p, p.resumo(estado)]).filter(([, t]) => t);
  if (!linhas.length) {
    const r = document.createElement('span');
    r.className = 'resumo calado';
    r.textContent = 'tudo em ordem';
    resumos.append(r);
    return;
  }
  for (const [p, texto] of linhas) {
    const r = document.createElement('span');
    r.className = 'resumo';
    r.style.setProperty('--cor', p.cor);
    r.textContent = texto;
    resumos.append(r);
  }
}

function desenharPainel() {
  painel.replaceChildren();
  for (const p of PILULAS) {
    const seccao = document.createElement('section');
    seccao.className = 'seccao';
    seccao.dataset.pilula = p.id;
    const titulo = document.createElement('h2');
    titulo.style.setProperty('--cor', p.cor);
    titulo.textContent = p.titulo;
    seccao.append(titulo, p.render(estado, api));
    painel.append(seccao);
  }

  const rodape = document.createElement('div');
  rodape.className = 'rodape-app';
  const dados = document.createElement('button');
  dados.type = 'button';
  dados.className = 'ligacao';
  dados.textContent = 'Dados';
  dados.title = 'Abrir o ficheiro JSON onde isto tudo vive';
  dados.addEventListener('click', () => window.pingo.abrirDados());
  const atalho = document.createElement('span');
  atalho.textContent = '⌃⌥Space abre · ⌃⌥N captura · Esc fecha';
  rodape.append(dados, atalho);
  painel.append(rodape);
}

function desenhar() {
  desenharResumos();
  desenharPainel();
}

// --- medidas e estados -----------------------------------------------------

/** O tamanho da ilha em cada fase. A janela vai sempre atrás deste número. */
function medidas(qual) {
  if (qual === 'fechada') return { largura: notch.largura, altura: notch.altura, margem: 0 };
  if (qual === 'espreita') {
    return { largura: Math.max(notch.largura + 130, 320), altura: notch.altura + ALTURA_CABECA, margem: 0 };
  }
  const conteudo = painel.scrollHeight;
  return {
    largura: LARGURA_ABERTA,
    altura: Math.min(560, notch.altura + ALTURA_CABECA + conteudo),
    margem: MARGEM_ABERTA,
  };
}

function aplicar({ largura, altura, margem }) {
  ilha.style.width = `${largura}px`;
  ilha.style.height = `${altura}px`;
  document.body.style.paddingLeft = `${margem}px`;
  document.body.style.paddingRight = `${margem}px`;
}

/**
 * A janela não sabe animar, o CSS sim. Por isso: a crescer, primeiro dá-se espaço
 * à janela e só depois se estica a ilha; a encolher, estica-se primeiro e só se
 * aperta a janela quando a animação acabar. Assim nunca se vê nada cortado.
 */
function ir(novaFase) {
  if (fase === novaFase) return;
  const antes = medidas(fase);
  const depois = medidas(novaFase);
  fase = novaFase;
  ilha.className = novaFase;
  window.pingo.faseAtual(novaFase);

  const janelaDe = (m) => [m.largura + m.margem * 2, m.altura + m.margem];
  const cresce = depois.largura * depois.altura >= antes.largura * antes.altura;

  if (cresce) {
    window.pingo.caixa(...janelaDe(depois));
    requestAnimationFrame(() => aplicar(depois));
  } else {
    aplicar(depois);
    // Só se aperta a janela quando a animação de fecho acabar (ver --fecha nos estilos)
    setTimeout(() => {
      if (fase === novaFase) window.pingo.caixa(...janelaDe(depois));
    }, 360);
  }
}

/** O conteúdo mudou de tamanho e a ilha está aberta: acompanha sem saltos */
function medir() {
  if (fase !== 'aberta') return;
  const m = medidas('aberta');
  window.pingo.caixa(m.largura + m.margem * 2, m.altura + m.margem);
  aplicar(m);
}

function abrir(foco) {
  clearTimeout(aFechar);
  ir('aberta');
  if (foco === 'captura') {
    setTimeout(() => painel.querySelector('[data-foco="captura"]')?.focus(), 60);
  }
}

function fechar() {
  clearTimeout(aFechar);
  if (fase === 'aberta') window.pingo.largarFoco();
  ir('fechada');
}

// --- interação -------------------------------------------------------------

ilha.addEventListener('mouseenter', () => {
  clearTimeout(aFechar);
  if (fase === 'fechada') ir('espreita');
});

ilha.addEventListener('mouseleave', () => {
  if (fase === 'espreita') return ir('fechada');
  if (fase === 'aberta') {
    // Um instante de tolerância: passar o rato por fora sem querer não fecha tudo
    clearTimeout(aFechar);
    aFechar = setTimeout(() => {
      if (!painel.contains(document.activeElement)) fechar();
    }, 600);
  }
});

// O sistema diz-nos onde está o cursor: é isto que faz a ilha sair da notch,
// porque a janela não tem foco e não recebe os eventos dela própria
window.pingo.aoRato((dentro) => {
  if (dentro) {
    clearTimeout(aFechar);
    if (fase === 'fechada') ir('espreita');
  } else if (fase === 'espreita') {
    ir('fechada');
  }
});

cabeca.addEventListener('click', () => (fase === 'aberta' ? fechar() : abrir()));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fechar();
});

window.pingo.aoMedirNotch((n) => {
  notch = n;
  document.documentElement.style.setProperty('--notch-altura', `${n.altura}px`);
  document.documentElement.style.setProperty('--notch-largura', `${n.largura}px`);
  aplicar(medidas(fase));
});

window.pingo.aoAbrir(async (onde) => {
  const novo = await window.pingo.ler();
  if (novo) estado = novo;
  desenhar();
  abrir(onde);
});

window.pingo.aoPerderFoco(() => {
  if (fase === 'aberta' && !painel.contains(document.activeElement)) fechar();
});

(async () => {
  const inicial = await window.pingo.ler();
  if (inicial) estado = inicial;
  desenhar();
  aplicar(medidas('fechada'));
})();
