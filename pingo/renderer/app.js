import { criarMascote } from './mascote.js';
import { PILULAS } from './pilulas/catalogo.js';

const cartao = document.getElementById('cartao');
const barra = document.getElementById('barra');
const painel = document.getElementById('painel');
const mascote = criarMascote(34);

let estado = { versao: 1, capturas: [], clientes: [] };
let aberto = false;

/** O que as pílulas podem pedir. Tudo o que muda dados passa por aqui. */
const api = {
  async acao(nome, carga) {
    const novo = await window.pingo.acao(nome, carga);
    if (novo) {
      estado = novo;
      desenhar();
    }
  },
  abrirLigacao: (url) => window.pingo.abrirLigacao(url),
  festejar: () => mascote.festejar?.(),
};

function desenharBarra() {
  barra.replaceChildren();

  const esquerda = document.createElement('div');
  esquerda.className = 'barra-esquerda';
  esquerda.append(mascote);

  const resumos = document.createElement('div');
  resumos.className = 'resumos';
  for (const p of PILULAS) {
    const texto = p.resumo(estado);
    if (!texto) continue;
    const r = document.createElement('span');
    r.className = 'resumo';
    r.style.setProperty('--cor', p.cor);
    r.textContent = texto;
    resumos.append(r);
  }
  if (!resumos.children.length) {
    const r = document.createElement('span');
    r.className = 'resumo vazio';
    r.textContent = 'tudo em ordem';
    resumos.append(r);
  }
  esquerda.append(resumos);

  const seta = document.createElement('span');
  seta.className = `seta ${aberto ? 'aberta' : ''}`;
  seta.textContent = '⌃';

  barra.append(esquerda, seta);
}

function desenharPainel() {
  painel.replaceChildren();
  if (!aberto) return;

  for (const p of PILULAS) {
    const secao = document.createElement('section');
    secao.className = 'secao';
    secao.dataset.pilula = p.id;

    const titulo = document.createElement('h2');
    titulo.style.setProperty('--cor', p.cor);
    titulo.textContent = p.titulo;
    secao.append(titulo, p.render(estado, api));
    painel.append(secao);
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
  atalho.textContent = 'Control+Alt+Space abre · Control+Alt+N captura · Esc fecha';
  rodape.append(dados, atalho);
  painel.append(rodape);
}

/** A janela tem exatamente a altura do cartão: o resto é transparente */
function ajustarAltura() {
  requestAnimationFrame(() => window.pingo.altura(cartao.offsetHeight + 16));
}

function desenhar() {
  desenharBarra();
  desenharPainel();
  cartao.classList.toggle('aberto', aberto);
  ajustarAltura();
}

function abrir(foco) {
  aberto = true;
  desenhar();
  if (foco === 'captura') {
    requestAnimationFrame(() => painel.querySelector('[data-foco="captura"]')?.focus());
  }
}

barra.addEventListener('click', () => {
  aberto = !aberto;
  desenhar();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.pingo.esconder();
});

window.pingo.aoFocar(async (onde) => {
  const novo = await window.pingo.ler();
  if (novo) estado = novo;
  if (onde === 'captura' || !aberto) abrir(onde);
  else desenhar();
});

window.pingo.aoFechar(() => {
  aberto = false;
  desenhar();
});

(async () => {
  const inicial = await window.pingo.ler();
  if (inicial) estado = inicial;
  desenhar();
})();
