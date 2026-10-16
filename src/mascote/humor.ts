import type { EstadoMascote } from './expressoes';

/**
 * O humor da mascote quando ninguém mexe: cumprimenta ao chegar, boceja ao fim de um tempo sem atividade,
 * adormece, e quando alguém volta acorda e cumprimenta. Só trata do tempo; quem a mostra decide se o usa.
 */
export interface TemposHumor {
  /** Quanto tempo cumprimenta (ao chegar e ao acordar) */
  cumprimentoMs: number;
  /** Sem atividade durante este tempo, começa a bocejar */
  ateBocejarMs: number;
  /** Quanto tempo boceja antes de adormecer */
  bocejoMs: number;
}

export const TEMPOS_OMISSAO: TemposHumor = { cumprimentoMs: 3200, ateBocejarMs: 45_000, bocejoMs: 5000 };

// Funções de seta de propósito: `setTimeout` solto, chamado como método de outro objeto, dá "Illegal invocation" no browser
const RELOGIO = { set: (f: () => void, ms: number) => setTimeout(f, ms), clear: (t: ReturnType<typeof setTimeout>) => clearTimeout(t) };

export interface Humor {
  /** Chamar a cada gesto do utilizador (rato, teclas…) */
  atividade(): void;
  parar(): void;
}

/**
 * `aoMudar` recebe o estado em que a mascote deve estar (sempre um dos quatro: cumprimenta, repouso, boceja, dorme).
 * Começa a cumprimentar logo.
 */
export function criarHumor(aoMudar: (e: EstadoMascote) => void, t: TemposHumor = TEMPOS_OMISSAO, relogio: { set: (f: () => void, ms: number) => ReturnType<typeof setTimeout>; clear: (t: ReturnType<typeof setTimeout>) => void } = RELOGIO): Humor {
  let atual: EstadoMascote = 'cumprimenta';
  let tempo: ReturnType<typeof setTimeout> | undefined;
  const mudar = (e: EstadoMascote) => {
    if (e !== atual) {
      atual = e;
      aoMudar(e);
    }
  };
  const agendar = (ms: number, fn: () => void) => {
    if (tempo !== undefined) relogio.clear(tempo);
    tempo = relogio.set(fn, ms);
  };
  const esperarPelaPreguica = () =>
    agendar(t.ateBocejarMs, () => {
      mudar('boceja');
      agendar(t.bocejoMs, () => mudar('dorme'));
    });
  const depoisDoCumprimento = () =>
    agendar(t.cumprimentoMs, () => {
      mudar('repouso');
      esperarPelaPreguica();
    });

  aoMudar('cumprimenta');
  depoisDoCumprimento();

  return {
    atividade() {
      if (atual === 'dorme' || atual === 'boceja') {
        // acordou: cumprimenta e volta ao repouso
        mudar('cumprimenta');
        depoisDoCumprimento();
      } else if (atual === 'repouso') {
        // mexeu-se: recomeça a contagem da preguiça
        esperarPelaPreguica();
      }
      // a cumprimentar: deixa acabar
    },
    parar() {
      if (tempo !== undefined) relogio.clear(tempo);
      tempo = undefined;
    },
  };
}
