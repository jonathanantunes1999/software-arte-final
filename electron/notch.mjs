/**
 * Geometria do "modo notch": uma pílula preta fixa no topo do ecrã (na notch dos Macs que a têm,
 * flutuante nos outros) e a janela principal a crescer a partir dela. Só funções puras, para se
 * poderem testar sem Electron.
 */

/** Tamanhos da janela da pílula por estado. `notch`: funde-se com a notch física; `flutuante`: pílula solta. */
/**
 * Tamanhos da janelinha (a janela só existe à vista enquanto se arrasta um ficheiro, ou nos primeiros arranques):
 * - estado: pílula pequena ("A abrir…");
 * - dica: pílula com uma linha de texto, mostrada nos primeiros arranques;
 * - aberto: a zona onde se larga o PDF.
 * `notch`: funde-se com a notch física; `flutuante`: pílula solta.
 */
export const TAMANHOS = {
  // a zona de largar cobre toda a zona de aproximação: onde quer que o cursor esteja quando ela abre, está por cima dela
  // minimalista: o ícone e uma linha. Na notch física os primeiros 38 pt são a própria notch, por isso o texto fica por baixo.
  notch: { estado: { w: 284, h: 38 }, dica: { w: 340, h: 66 }, aberto: { w: 360, h: 100 } },
  flutuante: { estado: { w: 210, h: 34 }, dica: { w: 300, h: 40 }, aberto: { w: 360, h: 100 } },
};

export const ESTADOS_NOTCH = Object.keys(TAMANHOS.notch);

/** Margem ao topo: junto à notch física é 0; a pílula flutuante respira um pouco */
const MARGEM_FLUTUANTE = 8;

/**
 * Macs com notch têm uma barra de menus mais alta (37 pt contra 24). A API não diz se há notch,
 * por isso deduz-se da diferença entre o topo do ecrã e o topo da área de trabalho.
 */
export function temNotchNoMac(plataforma, bounds, workArea) {
  return plataforma === 'darwin' && workArea.y - bounds.y >= 32;
}

/** Retângulo da janela da pílula: centrada no topo do ecrã */
export function boundsNotch(bounds, temNotch, estado) {
  const t = TAMANHOS[temNotch ? 'notch' : 'flutuante'][estado] ?? TAMANHOS.flutuante.aberto;
  return {
    x: Math.round(bounds.x + (bounds.width - t.w) / 2),
    // a zona de largar encosta ao topo (cobre a zona de aproximação toda); só as pílulas pequenas flutuam sem notch
    y: bounds.y + (temNotch || estado === 'aberto' ? 0 : MARGEM_FLUTUANTE),
    width: t.w,
    height: t.h,
  };
}

/**
 * A sequência de entrada ("a mascote come o PDF, pensa e rebenta em partículas"): a janelinha cresce para um palco
 * transparente, com o "palco escuro" (o que se vê como a pílula a crescer) no topo ao centro e folga à volta para
 * as partículas. A janela principal nasce do palco escuro.
 */
export const PALCO = { janela: { w: 760, h: 340 }, escuro: { w: 500, h: 220 } };

/** A janelinha em modo palco, centrada no topo do ecrã */
export function boundsPalco(bounds) {
  const { w, h } = PALCO.janela;
  return { x: Math.round(bounds.x + (bounds.width - w) / 2), y: bounds.y, width: w, height: h };
}

/** O palco escuro em coordenadas do ecrã: de onde cresce a janela principal */
export function boundsPalcoEscuro(bounds) {
  const { w, h } = PALCO.escuro;
  return { x: Math.round(bounds.x + (bounds.width - w) / 2), y: bounds.y, width: w, height: h };
}

/** Tamanho final da janela principal: 86% da área de trabalho, até 1440 × 920, centrada */
export function boundsFinal(workArea) {
  const width = Math.min(1440, Math.round(workArea.width * 0.86));
  const height = Math.min(920, Math.round(workArea.height * 0.86));
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  };
}

/** Ponto entre dois retângulos (t de 0 a 1) */
export function interpolar(a, b, t) {
  const m = (x, y) => Math.round(x + (y - x) * t);
  return { x: m(a.x, b.x), y: m(a.y, b.y), width: m(a.width, b.width), height: m(a.height, b.height) };
}

/** Abranda no fim (cúbica): a janela "assenta" em vez de parar de repente */
export const suave = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * Opacidade ao longo da animação: invisível enquanto a janela é muito pequena (a interface a
 * reorganizar-se em tamanho minúsculo não se vê), cheia a meio do caminho.
 */
export const opacidadeDaAnimacao = (t) => Math.min(1, Math.max(0, (t - 0.12) / 0.4));

/**
 * A zona onde, com um ficheiro a ser arrastado, a janelinha sai ao encontro (340 × 96 px, a janelinha cobre-a),
 * centrada no topo do ecrã. Fica à volta da notch e de uma boa parte do que está por baixo.
 */
export function zonaDeAproximacao(bounds) {
  const width = 340;
  return { x: Math.round(bounds.x + (bounds.width - width) / 2), y: bounds.y, width, height: 96 };
}

/** Estados da janelinha */
export const ehEstadoNotch = (e) => typeof e === 'string' && ESTADOS_NOTCH.includes(e);

/** Preferências guardadas: só se aceita o que se conhece */
export const MAX_DICAS = 3;

export function sanearPrefs(bruto) {
  const p = bruto && typeof bruto === 'object' ? bruto : {};
  const d = Number(p.dicasVistas);
  return {
    modoNotch: typeof p.modoNotch === 'boolean' ? p.modoNotch : true,
    /** Quantas vezes já se mostrou a dica de arranque (só nos primeiros arranques) */
    dicasVistas: Number.isFinite(d) ? Math.min(99, Math.max(0, Math.floor(d))) : 0,
    /** Fechar a janela deixa a app a correr no ícone da barra (ligado por omissão) */
    manterNaBandeja: typeof p.manterNaBandeja === 'boolean' ? p.manterNaBandeja : true,
    /** A animação ao largar um PDF na notch (come, pensa, partículas): ligada por omissão, desliga-se no menu Ver */
    animacaoNotch: typeof p.animacaoNotch === 'boolean' ? p.animacaoNotch : true,
  };
}
