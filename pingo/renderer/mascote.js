/**
 * A mascote, portada do Arte Final (`src/interface/Mascote.svelte` e `src/mascote/`):
 * o mesmo corpo em superelipse com luz, sombra e brilho, os mesmos olhos grandes e
 * lisos, sem boca nem sobrancelhas. Sem as bolas CMYK, que ali eram as tintas e aqui
 * não vinham a propósito.
 *
 * É código próprio do Jonathan, trazido de um projeto dele para o outro.
 * Desenhado em SVG, sem imagens nem bibliotecas.
 */

const NS = 'http://www.w3.org/2000/svg';

/** Um id por instância, senão os gradientes de uma mascote pintam a outra */
let contador = 0;

const el = (nome, atributos = {}) => {
  const n = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) n.setAttribute(k, String(v));
  return n;
};

// --- cor ------------------------------------------------------------------

const PEROLA = '#f1eee8';

const canal = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
const doisDigitos = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

/** Mistura duas cores (t = 0 → a, t = 1 → b) */
function misturar(a, b, t) {
  return `#${[0, 1, 2].map((i) => doisDigitos(canal(a, i) + (canal(b, i) - canal(a, i)) * t)).join('')}`;
}

const luminancia = (hex) => 0.2126 * canal(hex, 0) + 0.7152 * canal(hex, 1) + 0.0722 * canal(hex, 2);

/** Os tons que dão volume ao corpo. Cores claras escurecem mais, senão a sombra não se vê. */
function tons(cor) {
  const clara = luminancia(cor) > 200;
  const escura = luminancia(cor) < 120;
  return {
    luz: misturar(cor, '#ffffff', escura ? 0.35 : 0.7),
    base: cor,
    sombra: escura ? misturar(cor, '#0b0a12', 0.4) : misturar(cor, '#5a4a6a', clara ? 0.34 : 0.26),
    /** Olhos escuros, ou claros se o corpo for escuro */
    tinta: escura ? '#f6f3ff' : '#2a2230',
  };
}

// --- forma ----------------------------------------------------------------

/**
 * Superelipse |x/rx|ⁿ + |y/ry|ⁿ = 1 como caminho SVG. n = 2 é uma elipse;
 * n ≈ 2,55 dá o corpo macio e achatado, entre o redondo e o quadrado.
 */
function superelipse(cx, cy, rx, ry, n = 2.55, passos = 96) {
  const p = [];
  for (let i = 0; i < passos; i++) {
    const t = (i / passos) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = cx + rx * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = cy + ry * Math.sign(s) * Math.abs(s) ** (2 / n);
    p.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${p.join(' ')} Z`;
}

// --- desenho --------------------------------------------------------------

/**
 * Devolve o <svg> da mascote, com dois métodos pendurados:
 *   festejar() — um saltinho, para dar sinal de vida quando se guarda algo
 *   olhar(dx, dy) — os olhos seguem um ponto, ambos entre −1 e 1
 */
export function criarMascote(tamanho = 38, cor = PEROLA) {
  const id = `m${++contador}`;
  const t = tons(cor);

  const svg = el('svg', {
    width: tamanho,
    height: tamanho,
    viewBox: '0 0 240 240',
    class: 'mascote',
    'aria-hidden': 'true',
  });

  // Gradientes e desfocados
  const defs = el('defs');

  const corpoGrad = el('radialGradient', { id: `${id}-corpo`, cx: '0.34', cy: '0.26', r: '0.95' });
  corpoGrad.append(
    el('stop', { offset: '0', 'stop-color': t.luz }),
    el('stop', { offset: '0.5', 'stop-color': t.base }),
    el('stop', { offset: '1', 'stop-color': t.sombra }),
  );

  const baixoGrad = el('linearGradient', { id: `${id}-baixo`, x1: '0', y1: '0', x2: '0', y2: '1' });
  baixoGrad.append(
    el('stop', { offset: '0.55', 'stop-color': t.sombra, 'stop-opacity': '0' }),
    el('stop', { offset: '1', 'stop-color': t.sombra, 'stop-opacity': '0.55' }),
  );

  const desfoque = el('filter', { id: `${id}-b4`, x: '-50%', y: '-50%', width: '200%', height: '200%' });
  desfoque.append(el('feGaussianBlur', { stdDeviation: '4' }));

  defs.append(corpoGrad, baixoGrad, desfoque);

  // Sombra no chão: é ela que assenta a mascote em vez de a deixar a flutuar
  const chao = el('ellipse', {
    class: 'chao',
    cx: 120, cy: 226, rx: 74, ry: 9,
    fill: '#000', opacity: '0.18',
    filter: `url(#${id}-b4)`,
  });

  const corpo = el('g', { class: 'corpo' });
  const d = superelipse(120, 140, 88, 70);
  corpo.append(
    el('path', { d, fill: `url(#${id}-corpo)` }),
    el('path', { d, fill: `url(#${id}-baixo)` }),
    // Brilho em cima à esquerda, e um reflexo fraco em baixo à direita
    el('ellipse', {
      class: 'brilho', cx: 84, cy: 100, rx: 30, ry: 13,
      transform: 'rotate(-20 84 100)', fill: '#fff', opacity: '0.6',
      filter: `url(#${id}-b4)`,
    }),
    el('ellipse', {
      cx: 170, cy: 190, rx: 22, ry: 7,
      transform: 'rotate(-25 170 190)', fill: '#fff', opacity: '0.1',
    }),
  );

  // A cara está 8px mais abaixo do centro: fica mais fofa
  const cara = el('g', { class: 'cara', transform: 'translate(0 8)' });
  const olhos = el('g', { class: 'olhos' });
  const olhoE = el('ellipse', { class: 'olho', cx: 92, cy: 134, rx: 10.5, ry: 13, fill: t.tinta });
  const olhoD = el('ellipse', { class: 'olho', cx: 148, cy: 134, rx: 10.5, ry: 13, fill: t.tinta });
  olhos.append(olhoE, olhoD);
  cara.append(olhos);
  corpo.append(cara);

  svg.append(defs, chao, corpo);

  // Pestanejo a horas desencontradas, para não parecer um metrónomo
  const pestanejar = () => {
    svg.classList.add('a-pestanejar');
    setTimeout(() => svg.classList.remove('a-pestanejar'), 140);
    setTimeout(pestanejar, 3200 + Math.random() * 4200);
  };
  setTimeout(pestanejar, 1800);

  // Em repouso dá um saltinho de 7 em 7 segundos, como no Arte Final
  setInterval(() => {
    if (!svg.classList.contains('a-festejar')) {
      svg.classList.add('a-saltar');
      setTimeout(() => svg.classList.remove('a-saltar'), 620);
    }
  }, 7000);

  svg.festejar = () => {
    svg.classList.remove('a-festejar');
    void svg.getBoundingClientRect();
    svg.classList.add('a-festejar');
    setTimeout(() => svg.classList.remove('a-festejar'), 520);
  };

  /** Os olhos seguem um ponto; a cara vai atrás com metade do desvio */
  svg.olhar = (dx, dy) => {
    const x = Math.max(-1, Math.min(1, dx));
    const y = Math.max(-1, Math.min(1, dy));
    olhos.setAttribute('transform', `translate(${(x * 5).toFixed(1)} ${(y * 4).toFixed(1)})`);
    cara.setAttribute('transform', `translate(${(x * 2.5).toFixed(1)} ${8 + y * 2})`);
  };

  return svg;
}
