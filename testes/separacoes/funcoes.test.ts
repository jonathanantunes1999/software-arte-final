import { PDFContext } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { lerFuncao } from '../../src/analise/funcoes';
import { Leitor } from '../../src/analise/leitor';

function criar() {
  const ctx = PDFContext.create();
  const l = new Leitor(ctx);
  return {
    ctx,
    fn: (obj: unknown) => lerFuncao(l, ctx.obj(obj as never)),
    stream: (conteudo: Uint8Array | string, dict: unknown) =>
      ctx.register(ctx.stream(typeof conteudo === 'string' ? new TextEncoder().encode(conteudo) : conteudo, dict as never)),
    lerRef: (ref: unknown) => lerFuncao(l, ref as never),
  };
}
const perto = (a: number[], b: number[], tol = 1e-6) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(tol));
};

describe('funções PDF', () => {
  it('tipo 2: interpolação linear e expoente', () => {
    const { fn } = criar();
    const f = fn({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [1, 0.5, 0, 0.2], N: 1 })!;
    perto(f([0]), [0, 0, 0, 0]);
    perto(f([0.5]), [0.5, 0.25, 0, 0.1]);
    perto(f([1]), [1, 0.5, 0, 0.2]);
    const g = fn({ FunctionType: 2, Domain: [0, 1], C0: [0], C1: [1], N: 2 })!;
    perto(g([0.5]), [0.25]);
  });

  it('tipo 2: C0 e C1 por omissão; entrada fora do domínio é cortada', () => {
    const { fn } = criar();
    const f = fn({ FunctionType: 2, Domain: [0, 1], N: 1 })!;
    perto(f([0.3]), [0.3]);
    perto(f([5]), [1]);
    perto(f([-5]), [0]);
  });

  it('tipo 2: C0 e C1 com tamanhos diferentes não é suportada', () => {
    const { fn } = criar();
    expect(fn({ FunctionType: 2, Domain: [0, 1], C0: [0, 0], C1: [1], N: 1 })).toBeNull();
  });

  it('tipo 3: costura de duas funções com Bounds e Encode', () => {
    const { fn } = criar();
    const f = fn({
      FunctionType: 3,
      Domain: [0, 1],
      Bounds: [0.5],
      Encode: [0, 1, 1, 0],
      Functions: [
        { FunctionType: 2, Domain: [0, 1], C0: [0], C1: [1], N: 1 },
        { FunctionType: 2, Domain: [0, 1], C0: [0], C1: [1], N: 1 },
      ],
    })!;
    perto(f([0]), [0]);
    perto(f([0.25]), [0.5]);
    perto(f([0.5]), [1]); // início do segundo troço, com Encode invertido
    perto(f([0.75]), [0.5]);
    perto(f([1]), [0]);
  });

  it('tipo 3: no limite entre troços vale o segundo', () => {
    const { fn } = criar();
    const f = fn({
      FunctionType: 3,
      Domain: [0, 1],
      Bounds: [0.5],
      Encode: [0, 1, 0, 1],
      Functions: [
        { FunctionType: 2, Domain: [0, 1], C0: [0], C1: [0], N: 1 },
        { FunctionType: 2, Domain: [0, 1], C0: [1], C1: [1], N: 1 },
      ],
    })!;
    perto(f([0.49]), [0]);
    perto(f([0.5]), [1]);
  });

  it('tipo 0: amostras de 8 bits com interpolação', () => {
    const { stream, lerRef } = criar();
    const ref = stream(new Uint8Array([0, 255, 255, 0]), { FunctionType: 0, Domain: [0, 1], Range: [0, 1, 0, 1], Size: [2], BitsPerSample: 8 });
    const f = lerRef(ref)!;
    perto(f([0]), [0, 1]);
    perto(f([1]), [1, 0]);
    perto(f([0.5]), [0.5, 0.5]);
  });

  it('tipo 0: 4 bits e Decode', () => {
    const { stream, lerRef } = criar();
    // duas amostras de 4 bits: 0 e 15 (0x0F)
    const ref = stream(new Uint8Array([0x0f]), { FunctionType: 0, Domain: [0, 1], Range: [0, 1], Size: [2], BitsPerSample: 4, Decode: [1, 0] });
    const f = lerRef(ref)!;
    perto(f([0]), [1]);
    perto(f([1]), [0]);
  });

  it('tipo 4: aritmética e pilha', () => {
    const { stream, lerRef } = criar();
    // t -> [t, 1-t, t*0.5, 0]
    const ref = stream('{ dup 1 exch sub exch dup 0.5 mul 0 }', { FunctionType: 4, Domain: [0, 1], Range: [0, 1, 0, 1, 0, 1, 0, 1] });
    const f = lerRef(ref)!;
    // dup 1 exch sub -> t, 1-t ; exch -> 1-t, t ; dup 0.5 mul -> 1-t, t, t/2 ; 0
    perto(f([0.4]), [0.6, 0.4, 0.2, 0]);
  });

  it('tipo 4: if e ifelse', () => {
    const { stream, lerRef } = criar();
    const f = lerRef(stream('{ dup 0.5 gt { pop 1 } { pop 0 } ifelse }', { FunctionType: 4, Domain: [0, 1], Range: [0, 1] }))!;
    perto(f([0.9]), [1]);
    perto(f([0.1]), [0]);
    const g = lerRef(stream('{ dup 0.5 lt { 2 mul } if }', { FunctionType: 4, Domain: [0, 1], Range: [0, 1] }))!;
    perto(g([0.2]), [0.4]);
    perto(g([0.8]), [0.8]);
  });

  it('tipo 4: roll, index, copy', () => {
    const { stream, lerRef } = criar();
    const f = lerRef(stream('{ 0.1 0.2 3 -1 roll }', { FunctionType: 4, Domain: [0, 1], Range: [0, 1, 0, 1, 0, 1] }))!;
    // pilha: t 0.1 0.2 -> roll 3 -1 -> 0.1 0.2 t
    perto(f([0.9]), [0.1, 0.2, 0.9]);
    const g = lerRef(stream('{ 0.3 1 index }', { FunctionType: 4, Domain: [0, 1], Range: [0, 1, 0, 1, 0, 1] }))!;
    perto(g([0.7]), [0.7, 0.3, 0.7]);
    const h = lerRef(stream('{ 2 copy }', { FunctionType: 4, Domain: [0, 1, 0, 1], Range: [0, 1, 0, 1, 0, 1, 0, 1] }))!;
    perto(h([0.2, 0.4]), [0.2, 0.4, 0.2, 0.4]);
  });

  it('tipo 4: operador desconhecido ou programa partido não rebenta', () => {
    const { stream, lerRef } = criar();
    expect(lerRef(stream('{ abracadabra }', { FunctionType: 4, Domain: [0, 1], Range: [0, 1] }))!([0.5])).toEqual([0]);
    expect(lerRef(stream('{ 1 2 add', { FunctionType: 4, Domain: [0, 1], Range: [0, 1] }))).toBeNull();
  });

  it('tipo desconhecido: null', () => {
    const { fn } = criar();
    expect(fn({ FunctionType: 9 })).toBeNull();
    expect(fn({})).toBeNull();
  });
});
