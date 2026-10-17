/**
 * O trajeto de voo da mascote entre o palco e o canto: uma curva suave (Bézier) com a velocidade a subir e a
 * descer, inclinação para onde vai (como uma ave a virar), um esticão consoante a velocidade, um leve balanço
 * no ar e uma aterragem com uns saltinhos a assentar. Só números: quem anima (Web Animations) está na interface.
 */

export interface PontoDeVoo {
  /** 0 a 1 ao longo da animação */
  offset: number;
  transform: string;
  opacity: number;
}

export interface Voo {
  frames: PontoDeVoo[];
  /** +1 vai para a direita, −1 para a esquerda: as bolas e o vento ficam do lado contrário */
  sentido: 1 | -1;
}

interface Ponto {
  x: number;
  y: number;
}

const suave = (u: number) => u * u * (3 - 2 * u);
/** Arranca devagar, acelera, abranda ao chegar */
const aceleracao = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
const mistura = (a: number, b: number, k: number) => a + (b - a) * k;

function bezier(p0: Ponto, p1: Ponto, p2: Ponto, p3: Ponto, t: number): Ponto {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

const f = (n: number) => Math.round(n * 100) / 100;

/**
 * `dx`,`dy`: onde está o palco em relação à posição final da miniatura (o destino da ida). `escala`: quanto maior
 * é a mascote no palco. `ida`: palco → canto; senão canto → palco.
 */
export function calcularVoo(dx: number, dy: number, escala: number, ida: boolean, passos = 56): Voo {
  const S: Ponto = { x: dx, y: dy };
  const O: Ponto = { x: 0, y: 0 };
  const p0 = ida ? S : O;
  const p3 = ida ? O : S;
  const d: Ponto = { x: p3.x - p0.x, y: p3.y - p0.y };
  const distancia = Math.hypot(d.x, d.y);
  const sentido: 1 | -1 = d.x >= 0 ? 1 : -1;
  // o arco: sobe primeiro e desce para o destino, como um voo de verdade
  const alto = Math.min(120, 36 + distancia * 0.2);
  const p1: Ponto = { x: p0.x + d.x * 0.3, y: p0.y + d.y * 0.04 - alto };
  const p2: Ponto = { x: p0.x + d.x * 0.8, y: p0.y + d.y * 0.72 - alto * 0.3 };

  const amostra = (u: number) => {
    const w = aceleracao(u);
    const c = bezier(p0, p1, p2, p3, w);
    // balanço no ar (some ao chegar para assentar bem)
    const balanco = Math.sin(u * Math.PI * 5) * 4 * (1 - suave(u));
    return { c: { x: c.x, y: c.y + balanco }, w };
  };

  const pontos = Array.from({ length: passos }, (_, i) => amostra(i / (passos - 1)));
  const velocidade = pontos.map((p, i) => {
    const a = pontos[Math.max(0, i - 1)].c;
    const b = pontos[Math.min(passos - 1, i + 1)].c;
    return { x: b.x - a.x, y: b.y - a.y };
  });
  const maxV = Math.max(1e-6, ...velocidade.map((v) => Math.hypot(v.x, v.y)));
  const caminho = 0.84;

  const frames: PontoDeVoo[] = pontos.map((p, i) => {
    const u = i / (passos - 1);
    const v = velocidade[i];
    // inclina-se para onde vai: nariz para baixo ao descer, para cima ao subir
    const subida = Math.atan2(v.y, Math.abs(v.x) + 1e-6) * (180 / Math.PI);
    const ang = Math.max(-24, Math.min(24, sentido * subida * 0.55));
    const rapidez = Math.hypot(v.x, v.y) / maxV;
    const tamanho = ida ? mistura(escala, 1, suave(u)) : mistura(1, escala, suave(u));
    const sx = tamanho * (1 + 0.1 * rapidez);
    const sy = tamanho * (1 - 0.07 * rapidez);
    // aparece e desaparece sem estalo
    const opacity = ida ? Math.min(1, 0.2 + u * 7) : Math.min(1, 0.3 + (1 - u) * 7);
    return { offset: f(u * caminho), transform: `translate(${f(p.c.x)}px, ${f(p.c.y)}px) rotate(${f(ang)}deg) scale(${f(sx)}, ${f(sy)})`, opacity: f(opacity) };
  });

  if (ida) {
    // aterra e assenta: passa um bocadinho do sítio e volta, cada vez menos
    const sobra = 7;
    for (let i = 1; i <= 10; i++) {
      const k = i / 10;
      const amortecido = Math.exp(-3.2 * k) * Math.cos(k * Math.PI * 3.2);
      frames.push({
        offset: f(caminho + (1 - caminho) * k),
        transform: `translate(${f(sentido * sobra * amortecido)}px, ${f(-sobra * 0.6 * amortecido * (1 - k))}px) rotate(${f(-sentido * 5 * amortecido)}deg) scale(1, ${f(1 - 0.05 * amortecido)})`,
        opacity: 1,
      });
    }
    frames[frames.length - 1].transform = 'translate(0px, 0px) rotate(0deg) scale(1, 1)';
  } else {
    frames.push({ offset: 1, transform: frames[frames.length - 1].transform, opacity: 0 });
  }
  // o último ponto da ida é a posição final exata; o da volta fica em cima do palco
  frames[0].offset = 0;
  return { frames, sentido };
}
