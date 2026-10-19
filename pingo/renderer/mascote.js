/**
 * O Pingo: uma gota de tinta. Corpo com bico em cima e barriga redonda, olhos grandes
 * e quatro pontos nas tintas CMYK à volta. Desenhado em código, sem imagens.
 *
 * Personagem própria, de propósito: o Mochi do Coucou é material protegido
 * (ver NOTAS.md). Isto é uma gota de tinta de gráfica, não um squircle.
 */

const NS = 'http://www.w3.org/2000/svg';
const TINTAS = ['#14b8d4', '#e0218a', '#f7d511', '#1b1b1f'];

const el = (nome, atributos) => {
  const n = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(atributos)) n.setAttribute(k, String(v));
  return n;
};

export function criarMascote(tamanho = 38) {
  const svg = el('svg', { width: tamanho, height: tamanho, viewBox: '0 0 100 100', class: 'mascote' });

  // A gota: bico em cima, barriga em baixo
  const corpo = el('path', {
    d: 'M50 8 C50 8 78 44 78 63 C78 81 65 92 50 92 C35 92 22 81 22 63 C22 44 50 8 50 8 Z',
    fill: 'url(#gradCorpo)',
  });

  const grad = el('radialGradient', { id: 'gradCorpo', cx: '38%', cy: '30%', r: '75%' });
  grad.append(el('stop', { offset: '0%', 'stop-color': '#f2f5f8' }), el('stop', { offset: '100%', 'stop-color': '#b9c4ce' }));
  const defs = el('defs', {});
  defs.append(grad);

  const pontos = TINTAS.map((cor, i) =>
    el('circle', { cx: i < 2 ? 20 : 80, cy: i % 2 ? 76 : 58, r: 6.5, fill: cor, class: `tinta tinta-${i}` }),
  );

  const olhoE = el('ellipse', { cx: 39, cy: 62, rx: 6.5, ry: 8, fill: '#15171c', class: 'olho' });
  const olhoD = el('ellipse', { cx: 61, cy: 62, rx: 6.5, ry: 8, fill: '#15171c', class: 'olho' });

  svg.append(defs, pontos[0], pontos[2], corpo, olhoE, olhoD, pontos[1], pontos[3]);

  // Pestanejo a horas desencontradas, para não parecer um metrónomo
  const pestanejar = () => {
    svg.classList.add('a-pestanejar');
    setTimeout(() => svg.classList.remove('a-pestanejar'), 150);
    setTimeout(pestanejar, 3200 + Math.random() * 4000);
  };
  setTimeout(pestanejar, 1800);

  /** Um saltinho: usa-se quando se guarda algo, para dar sinal de vida */
  svg.festejar = () => {
    svg.classList.remove('a-festejar');
    void svg.getBoundingClientRect();
    svg.classList.add('a-festejar');
  };

  return svg;
}
