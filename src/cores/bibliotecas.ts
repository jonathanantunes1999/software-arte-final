import { cmykParaLab, rgbParaLab, deltaE2000, type Lab } from './cie';

/**
 * Bibliotecas de cores do próprio utilizador (.acb e .ase). A app não traz nenhuma: lê as que ele
 * já tem, instaladas com o Illustrator, o Photoshop ou o InDesign.
 */

export interface CorDeBiblioteca {
  nome: string;
  lab: Lab;
}

export interface Biblioteca {
  /** Nome do ficheiro (ou o título guardado nele) */
  nome: string;
  cores: CorDeBiblioteca[];
}

export interface Sugestao {
  biblioteca: string;
  nome: string;
  lab: Lab;
  /** CIEDE2000: abaixo de 2 não se distingue a olho; acima de 10 já é outra cor */
  deltaE: number;
}

function utf16be(v: DataView, pos: number, chars: number): string {
  let s = '';
  for (let i = 0; i < chars; i++) s += String.fromCharCode(v.getUint16(pos + 2 * i));
  return s;
}

/** Os nomes de livros da Adobe vêm por vezes como "$$$/Chave=Nome" */
function limparNome(n: string): string {
  const i = n.lastIndexOf('=');
  return (n.startsWith('$$$') && i >= 0 ? n.slice(i + 1) : n).replace(/\0/g, '').trim();
}

/** Adobe Color Book (.acb) */
export function lerAcb(bytes: Uint8Array, nomeFicheiro = 'biblioteca'): Biblioteca {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 8 || String.fromCharCode(...bytes.subarray(0, 4)) !== '8BCB') throw new Error('Não é um ficheiro .acb');
  let p = 8; // assinatura + versão + id
  const texto = () => {
    const n = v.getUint32(p);
    const s = utf16be(v, p + 4, n);
    p += 4 + 2 * n;
    return s;
  };
  const titulo = limparNome(texto());
  const prefixo = limparNome(texto());
  const sufixo = limparNome(texto());
  texto(); // descrição
  const total = v.getUint16(p);
  p += 6; // contagem, tamanho de página, seletor
  const espaco = v.getUint16(p);
  p += 2;
  const n = espaco === 0 ? 3 : espaco === 2 || espaco === 3 ? 4 : espaco === 7 ? 3 : -1;
  if (n < 0) throw new Error('Espaço de cor do .acb não suportado');

  const cores: CorDeBiblioteca[] = [];
  for (let i = 0; i < total; i++) {
    const nome = `${prefixo}${limparNome(texto())}${sufixo}`.trim();
    p += 6; // código da cor
    const b = [0, 1, 2, 3].slice(0, n).map((k) => v.getUint8(p + k));
    p += n;
    let lab: Lab;
    if (espaco === 7) lab = [(b[0] * 100) / 255, b[1] - 128, b[2] - 128];
    else if (espaco === 0) lab = rgbParaLab(b[0] / 255, b[1] / 255, b[2] / 255);
    else lab = cmykParaLab(1 - b[0] / 255, 1 - b[1] / 255, 1 - b[2] / 255, 1 - b[3] / 255);
    if (nome) cores.push({ nome, lab });
  }
  return { nome: titulo || nomeFicheiro, cores };
}

/** Adobe Swatch Exchange (.ase) */
export function lerAse(bytes: Uint8Array, nomeFicheiro = 'biblioteca'): Biblioteca {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'ASEF') throw new Error('Não é um ficheiro .ase');
  const blocos = v.getUint32(8);
  let p = 12;
  const cores: CorDeBiblioteca[] = [];
  let titulo = '';
  for (let i = 0; i < blocos && p + 6 <= bytes.byteLength; i++) {
    const tipo = v.getUint16(p);
    const tam = v.getUint32(p + 2);
    const ini = p + 6;
    p = ini + tam;
    if (tipo === 0xc001 && !titulo) {
      titulo = limparNome(utf16be(v, ini + 2, v.getUint16(ini)));
    } else if (tipo === 0x0001) {
      const nc = v.getUint16(ini);
      const nome = limparNome(utf16be(v, ini + 2, nc));
      let q = ini + 2 + 2 * nc;
      const modelo = String.fromCharCode(...bytes.subarray(q, q + 4));
      q += 4;
      const f = (k: number) => v.getFloat32(q + 4 * k);
      let lab: Lab | null = null;
      if (modelo === 'CMYK') lab = cmykParaLab(f(0), f(1), f(2), f(3));
      else if (modelo === 'RGB ') lab = rgbParaLab(f(0), f(1), f(2));
      else if (modelo === 'LAB ') lab = [f(0) * 100, f(1), f(2)];
      else if (modelo === 'Gray') lab = rgbParaLab(f(0), f(0), f(0));
      if (lab && nome) cores.push({ nome, lab });
    }
  }
  return { nome: titulo || nomeFicheiro, cores };
}

export function lerBiblioteca(bytes: Uint8Array, nomeFicheiro: string): Biblioteca {
  const sem = nomeFicheiro.replace(/\.[^.]+$/, '');
  const ext = nomeFicheiro.toLowerCase().split('.').pop();
  const b = ext === 'ase' ? lerAse(bytes, sem) : lerAcb(bytes, sem);
  if (b.cores.length === 0) throw new Error('A biblioteca não tem cores que eu consiga ler');
  return b;
}

/** As cores mais próximas (menor ΔE 2000) de todas as bibliotecas juntas */
export function sugerirCores(alvo: Lab, bibliotecas: Biblioteca[], quantas = 5): Sugestao[] {
  const r: Sugestao[] = [];
  for (const b of bibliotecas) {
    for (const c of b.cores) {
      const d = deltaE2000(alvo, c.lab);
      if (r.length < quantas || d < r[r.length - 1].deltaE) {
        r.push({ biblioteca: b.nome, nome: c.nome, lab: c.lab, deltaE: d });
        r.sort((x, y) => x.deltaE - y.deltaE);
        if (r.length > quantas) r.pop();
      }
    }
  }
  return r;
}
