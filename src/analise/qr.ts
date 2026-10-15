import type { Caixa } from './caixas';

/** Um QR code lido num PDF. */
export interface QrEncontrado {
  /** 0-based */
  pagina: number;
  /** O que está dentro do QR code */
  texto: string;
  /** Onde está, em pontos, no espaço de utilizador da página */
  caixa: Caixa;
  /** Tamanho do símbolo (sem a zona de silêncio) em mm, medido nos lados do QR code */
  larguraMm: number;
  alturaMm: number;
}

export interface Ponto {
  x: number;
  y: number;
}

/** Cantos do QR code por ordem: topo-esquerdo, topo-direito, baixo-direito, baixo-esquerdo. */
export type Cantos = [Ponto, Ponto, Ponto, Ponto];

const distancia = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y);

/** Lados do QR code em mm, a partir dos cantos em pixels e da escala da imagem. Funciona com o QR rodado. */
export function medirLados(cantos: Cantos, pxPorMm: number): { larguraMm: number; alturaMm: number } {
  const [tl, tr, br, bl] = cantos;
  const largura = (distancia(tl, tr) + distancia(bl, br)) / 2;
  const altura = (distancia(tl, bl) + distancia(tr, br)) / 2;
  return { larguraMm: largura / pxPorMm, alturaMm: altura / pxPorMm };
}

const LIMITE_TEXTO = 80;

function cortar(s: string): string {
  return s.length > LIMITE_TEXTO ? `${s.slice(0, LIMITE_TEXTO - 1)}…` : s;
}

/** Diz, em português simples, para onde leva ou o que contém um QR code. */
export function descreverConteudoQr(texto: string): string {
  const t = texto.trim();
  if (/^https?:\/\//i.test(t)) return `Liga a ${cortar(t)}`;
  if (/^mailto:/i.test(t)) return `Email para ${cortar(t.replace(/^mailto:/i, '').split('?')[0])}`;
  if (/^tel:/i.test(t)) return `Telefone ${cortar(t.replace(/^tel:/i, ''))}`;
  if (/^smsto?:/i.test(t)) return `SMS para ${cortar(t.replace(/^smsto?:/i, '').split(':')[0])}`;
  if (/^WIFI:/i.test(t)) {
    const nome = t.match(/S:((?:\\.|[^;\\])*)/i)?.[1];
    return nome ? `Rede Wi-Fi "${cortar(nome)}"` : 'Rede Wi-Fi';
  }
  if (/^BEGIN:VCARD/i.test(t)) return 'Cartão de contacto';
  if (/^geo:/i.test(t)) return `Localização ${cortar(t.replace(/^geo:/i, ''))}`;
  // um endereço sem http (www.exemplo.pt) também é uma ligação
  if (/^www\.[^\s]+\.[a-z]{2,}/i.test(t)) return `Liga a ${cortar(t)}`;
  if (t === '') return 'QR code vazio';
  return `Texto: "${cortar(t)}"`;
}
