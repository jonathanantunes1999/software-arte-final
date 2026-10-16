import { describe, expect, it } from 'vitest';
import { lerAcb, lerAse, lerBiblioteca, sugerirCores } from '../../src/cores/bibliotecas';
import { cmykParaLab, deltaE2000, rgbParaLab } from '../../src/cores/cie';

// --- construtores de ficheiros (o formato está descrito em docs/ARQUITETURA.md)
class Escritor {
  partes: number[] = [];
  u8(...v: number[]) { this.partes.push(...v); return this; }
  u16(v: number) { return this.u8(v >> 8, v & 255); }
  u32(v: number) { return this.u16(v >>> 16).u16(v & 0xffff); }
  f32(v: number) { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, v); return this.u8(...new Uint8Array(b.buffer)); }
  ascii(s: string) { return this.u8(...[...s].map((c) => c.charCodeAt(0))); }
  utf16(s: string) { for (const c of s) this.u16(c.charCodeAt(0)); return this; }
  texto32(s: string) { return this.u32(s.length).utf16(s); }
  bytes() { return Uint8Array.from(this.partes); }
}

function acb(espaco: 0 | 2 | 7, cores: [string, number[]][], titulo = 'Livro de teste'): Uint8Array {
  const w = new Escritor().ascii('8BCB').u16(1).u16(1234).texto32(titulo).texto32('').texto32('').texto32('desc');
  w.u16(cores.length).u16(7).u16(0).u16(espaco);
  for (const [nome, v] of cores) w.texto32(nome).ascii('ABCDEF').u8(...v);
  return w.bytes();
}

function ase(blocos: ('grupo' | [string, string, number[]])[]): Uint8Array {
  const w = new Escritor().ascii('ASEF').u16(1).u16(0).u32(blocos.length);
  for (const b of blocos) {
    if (b === 'grupo') {
      const t = 'Grupo';
      w.u16(0xc001).u32(2 + 2 * (t.length + 1)).u16(t.length + 1).utf16(t).u16(0);
    } else {
      const [nome, modelo, v] = b;
      w.u16(0x0001).u32(2 + 2 * (nome.length + 1) + 4 + 4 * v.length + 2).u16(nome.length + 1).utf16(nome).u16(0).ascii(modelo);
      v.forEach((x) => w.f32(x));
      w.u16(1);
    }
  }
  return w.bytes();
}

describe('.acb', () => {
  it('lê cores CMYK (guardadas invertidas)', () => {
    const b = lerAcb(acb(2, [['Vermelho 1', [255 - 0, 255 - 255, 255 - 255, 255 - 0]], ['Ciano 2', [255 - 255, 255, 255, 255]]]));
    expect(b.nome).toBe('Livro de teste');
    expect(b.cores.map((c) => c.nome)).toEqual(['Vermelho 1', 'Ciano 2']);
    const esperado = cmykParaLab(0, 1, 1, 0);
    b.cores[0].lab.forEach((v, i) => expect(v).toBeCloseTo(esperado[i], 1));
  });

  it('lê cores Lab', () => {
    const b = lerAcb(acb(7, [['Meio', [128, 128 + 20, 128 - 30]]]));
    expect(b.cores[0].lab[0]).toBeCloseTo(50.2, 1);
    expect(b.cores[0].lab[1]).toBe(20);
    expect(b.cores[0].lab[2]).toBe(-30);
  });

  it('lê cores RGB', () => {
    const b = lerAcb(acb(0, [['Branco', [255, 255, 255]]]));
    expect(b.cores[0].lab[0]).toBeCloseTo(100, 0);
  });

  it('nomes localizados "$$$/Chave=Nome" ficam só com o nome', () => {
    const b = lerAcb(acb(0, [['$$$/Book/Item=Verde 12', [0, 255, 0]]]));
    expect(b.cores[0].nome).toBe('Verde 12');
  });

  it('rejeita o que não é .acb', () => {
    expect(() => lerAcb(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow(/acb/);
  });
});

describe('.ase', () => {
  it('lê CMYK, RGB, Lab e Gray, ignorando grupos', () => {
    const b = lerAse(ase(['grupo', ['Rosa', 'CMYK', [0, 1, 0, 0]], ['Azul', 'RGB ', [0, 0, 1]], ['Lab', 'LAB ', [0.5, 10, 10]], ['Cinza', 'Gray', [0.5]]]));
    expect(b.nome).toBe('Grupo');
    expect(b.cores.map((c) => c.nome)).toEqual(['Rosa', 'Azul', 'Lab', 'Cinza']);
    expect(b.cores[2].lab).toEqual([50, 10, 10]);
    const azul = rgbParaLab(0, 0, 1);
    b.cores[1].lab.forEach((v, i) => expect(v).toBeCloseTo(azul[i], 3));
  });

  it('rejeita o que não é .ase', () => {
    expect(() => lerAse(new Uint8Array(20))).toThrow(/ase/);
  });
});

describe('lerBiblioteca', () => {
  it('escolhe o leitor pela extensão e dá nome pelo ficheiro quando o livro não tem título', () => {
    expect(lerBiblioteca(acb(0, [['X', [1, 2, 3]]], ''), 'meu-livro.acb').nome).toBe('meu-livro');
    expect(lerBiblioteca(ase([['X', 'RGB ', [1, 1, 1]]]), 'paleta.ase').nome).toBe('paleta');
  });
  it('biblioteca vazia dá erro', () => {
    expect(() => lerBiblioteca(acb(0, []), 'v.acb')).toThrow(/não tem cores/);
  });
});

describe('sugerirCores', () => {
  const cores = [
    ['Rosa 1', 'CMYK', [0, 0.9, 0, 0]],
    ['Azul 2', 'CMYK', [0.9, 0.6, 0, 0]],
    ['Verde 3', 'CMYK', [0.8, 0, 0.9, 0]],
    ['Preto 4', 'CMYK', [0, 0, 0, 1]],
  ] as const;
  const lib = lerAse(ase(cores.map((c) => [c[0], c[1], [...c[2]]] as [string, string, number[]])));

  it('a mais próxima de um magenta 100% é o rosa, e vem ordenada por ΔE', () => {
    const s = sugerirCores(cmykParaLab(0, 1, 0, 0), [lib], 3);
    expect(s[0].nome).toBe('Rosa 1');
    expect(s).toHaveLength(3);
    expect(s[0].deltaE).toBeLessThanOrEqual(s[1].deltaE);
    expect(s[1].deltaE).toBeLessThanOrEqual(s[2].deltaE);
    expect(s[0].deltaE).toBeCloseTo(deltaE2000(cmykParaLab(0, 1, 0, 0), lib.cores[0].lab), 6);
  });

  it('procura em todas as bibliotecas e diz de qual vem', () => {
    const outra = { nome: 'Outra', cores: [{ nome: 'Magenta exato', lab: cmykParaLab(0, 1, 0, 0) }] };
    const s = sugerirCores(cmykParaLab(0, 1, 0, 0), [lib, outra], 1);
    expect(s[0]).toMatchObject({ nome: 'Magenta exato', biblioteca: 'Outra', deltaE: 0 });
  });

  it('sem bibliotecas não há sugestões', () => {
    expect(sugerirCores([50, 0, 0], [], 5)).toEqual([]);
  });
});
