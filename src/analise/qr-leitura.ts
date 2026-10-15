import jsQR from 'jsqr';
import type { Cantos } from './qr';

export interface QrLido {
  texto: string;
  /** Em pixels da imagem */
  cantos: Cantos;
}

/** Folga, em fração do lado, apagada à volta de cada QR code lido antes de procurar o seguinte */
const FOLGA_APAGAR = 0.3;

/**
 * Procura QR codes numa imagem RGBA (pixels de uma página renderizada). Depois de ler um, apaga-o
 * (pinta de branco) e volta a procurar, para apanhar vários na mesma página. Estraga `dados`.
 */
export function lerQrsDeImagem(dados: Uint8ClampedArray, largura: number, altura: number, maximo = 6): QrLido[] {
  const encontrados: QrLido[] = [];
  while (encontrados.length < maximo) {
    const r = jsQR(dados, largura, altura, { inversionAttempts: 'attemptBoth' });
    if (!r) break;
    const { topLeftCorner: a, topRightCorner: b, bottomRightCorner: c, bottomLeftCorner: d } = r.location;
    const cantos: Cantos = [a, b, c, d];
    encontrados.push({ texto: r.data, cantos });

    const xs = cantos.map((p) => p.x);
    const ys = cantos.map((p) => p.y);
    const lado = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const folga = lado * FOLGA_APAGAR;
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - folga));
    const x1 = Math.min(largura - 1, Math.ceil(Math.max(...xs) + folga));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - folga));
    const y1 = Math.min(altura - 1, Math.ceil(Math.max(...ys) + folga));
    for (let y = y0; y <= y1; y++) {
      const linha = y * largura * 4;
      for (let x = x0; x <= x1; x++) {
        const i = linha + x * 4;
        dados[i] = dados[i + 1] = dados[i + 2] = dados[i + 3] = 255;
      }
    }
  }
  return encontrados;
}

/** Região em pixels: [x0, y0, x1, y1), sem incluir x1 e y1 */
export interface Regiao {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const CELULA = 4;
const LADO_MIN_MM = 7;
const LADO_MAX_MM = 150;
const MAX_CANDIDATOS = 10;

/**
 * Procura, numa página renderizada, as zonas onde pode haver um QR code: manchas de conteúdo
 * aproximadamente quadradas e densas, de 7 a 150 mm de lado. Um QR code, com os seus módulos
 * pretos e brancos, enche uma área quadrada; texto, fotografias e fundos não costumam.
 *
 * O jsQR não lê bem quando há vários QR codes na mesma imagem, e numa página carregada de mancha
 * escura demora segundos. Por isso só se corre nos recortes destas zonas.
 */
export function encontrarCandidatos(dados: Uint8ClampedArray, largura: number, altura: number, pxPorMm: number): Regiao[] {
  const gw = Math.ceil(largura / CELULA);
  const gh = Math.ceil(altura / CELULA);
  const ocupada = new Uint8Array(gw * gh);

  // uma célula conta se tiver pelo menos 2 pixels escuros
  for (let cy = 0; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      let escuros = 0;
      const yFim = Math.min(altura, (cy + 1) * CELULA);
      const xFim = Math.min(largura, (cx + 1) * CELULA);
      for (let y = cy * CELULA; y < yFim && escuros < 2; y++) {
        for (let x = cx * CELULA; x < xFim; x++) {
          const i = (y * largura + x) * 4;
          // luminância aproximada
          if (dados[i] * 0.3 + dados[i + 1] * 0.59 + dados[i + 2] * 0.11 < 140) {
            escuros++;
            if (escuros >= 2) break;
          }
        }
      }
      if (escuros >= 2) ocupada[cy * gw + cx] = 1;
    }
  }

  // dilatar uma célula, para ligar os módulos de um mesmo QR code
  const dilatada = new Uint8Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      if (!ocupada[cy * gw + cx]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && y >= 0 && x < gw && y < gh) dilatada[y * gw + x] = 1;
        }
      }
    }
  }

  // componentes ligados (8 vizinhos)
  const visto = new Uint8Array(gw * gh);
  const pilha: number[] = [];
  const candidatos: { regiao: Regiao; quadratura: number; densidade: number }[] = [];
  const pxPorCelula = CELULA;

  for (let inicio = 0; inicio < gw * gh; inicio++) {
    if (!dilatada[inicio] || visto[inicio]) continue;
    let minX = gw,
      minY = gh,
      maxX = -1,
      maxY = -1,
      total = 0;
    pilha.push(inicio);
    visto[inicio] = 1;
    while (pilha.length) {
      const c = pilha.pop()!;
      const cx = c % gw;
      const cy = (c - cx) / gw;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      total++;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
          const v = y * gw + x;
          if (dilatada[v] && !visto[v]) {
            visto[v] = 1;
            pilha.push(v);
          }
        }
      }
    }

    // a dilatação acrescentou uma célula à volta: tira-se
    const bx0 = minX + 1;
    const by0 = minY + 1;
    const bx1 = maxX; // exclusivo, já sem a célula de folga
    const by1 = maxY;
    const cw = bx1 - bx0;
    const ch = by1 - by0;
    if (cw < 2 || ch < 2) continue;

    const ladoX = (cw * pxPorCelula) / pxPorMm;
    const ladoY = (ch * pxPorCelula) / pxPorMm;
    if (ladoX < LADO_MIN_MM || ladoY < LADO_MIN_MM || ladoX > LADO_MAX_MM || ladoY > LADO_MAX_MM) continue;
    const proporcao = ladoX / ladoY;
    if (proporcao < 0.7 || proporcao > 1.43) continue;
    // Depois de dilatar, um QR code enche quase toda a sua caixa, seja qual for o tamanho dos módulos
    // (com módulos do tamanho de uma célula, só metade das células tem tinta antes de dilatar).
    // Uma moldura ou um conjunto de linhas soltas deixam buracos e ficam abaixo.
    const densidade = total / ((maxX - minX + 1) * (maxY - minY + 1));
    if (densidade < 0.7) continue;

    candidatos.push({
      regiao: { x0: bx0 * CELULA, y0: by0 * CELULA, x1: Math.min(largura, bx1 * CELULA), y1: Math.min(altura, by1 * CELULA) },
      quadratura: Math.abs(Math.log(proporcao)),
      densidade,
    });
  }

  return candidatos
    .sort((a, b) => a.quadratura - b.quadratura || b.densidade - a.densidade)
    .slice(0, MAX_CANDIDATOS)
    .map((c) => c.regiao);
}

/** Lê os QR codes de uma página renderizada: encontra as zonas candidatas e lê cada uma em separado. */
export function lerQrsDaPagina(dados: Uint8ClampedArray, largura: number, altura: number, pxPorMm: number): QrLido[] {
  const lidos: QrLido[] = [];
  for (const r of encontrarCandidatos(dados, largura, altura, pxPorMm)) {
    // alarga a zona: o QR code precisa da sua zona de silêncio
    const folga = Math.round(Math.max(r.x1 - r.x0, r.y1 - r.y0) * 0.2) + 8;
    const x0 = Math.max(0, r.x0 - folga);
    const y0 = Math.max(0, r.y0 - folga);
    const x1 = Math.min(largura, r.x1 + folga);
    const y1 = Math.min(altura, r.y1 + folga);
    const cw = x1 - x0;
    const ch = y1 - y0;
    const recorte = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++) {
      const de = ((y0 + y) * largura + x0) * 4;
      recorte.set(dados.subarray(de, de + cw * 4), y * cw * 4);
    }
    for (const q of lerQrsDeImagem(recorte, cw, ch, 3)) {
      const cantos = q.cantos.map((p) => ({ x: p.x + x0, y: p.y + y0 })) as QrLido['cantos'];
      // o mesmo QR code pode aparecer em dois candidatos que se sobrepõem
      const igual = lidos.some((l) => l.texto === q.texto && Math.hypot(l.cantos[0].x - cantos[0].x, l.cantos[0].y - cantos[0].y) < 20);
      if (!igual) lidos.push({ texto: q.texto, cantos });
    }
  }
  return lidos;
}
