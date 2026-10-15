import { describe, expect, it } from 'vitest';
import { nomeDe, operacoes, textoDe, type Operacao } from '../../src/analise/lexer';

const ler = (s: string): Operacao[] => [...operacoes(s)];

describe('lexer', () => {
  it('separa operadores e operandos', () => {
    expect(ler('1 0 0 1 10 20 cm 0.5 g')).toEqual([
      { op: 'cm', args: [1, 0, 0, 1, 10, 20] },
      { op: 'g', args: [0.5] },
    ]);
  });

  it('lê números com sinais e pontos soltos', () => {
    const [a] = ler('-.5 +3 4. -0.25 .75 re');
    expect(a.args).toEqual([-0.5, 3, 4, -0.25, 0.75]);
  });

  it('operadores colados a delimitadores', () => {
    expect(ler('[1 2]0 d/GS0 gs').map((o) => o.op)).toEqual(['d', 'gs']);
  });

  it('nomes com #xx', () => {
    const [o] = ler('/PANTONE#20485#20C cs');
    expect(nomeDe(o.args[0])).toBe('PANTONE 485 C');
  });

  it('strings literais com escapes, parêntesis aninhados e octais', () => {
    const [o] = ler('(a\\(b\\) (c) \\101\\n) Tj');
    expect(textoDe(o.args[0])).toBe('a(b) (c) A\n');
  });

  it('strings hexadecimais, com número ímpar de dígitos', () => {
    const [a, b] = ler('<48 65 6C> Tj <4> Tj');
    expect(textoDe(a.args[0])).toBe('Hel');
    expect(textoDe(b.args[0])).toBe('@');
  });

  it('arrays de TJ misturam strings e números', () => {
    const [o] = ler('[(A) -120 (B)] TJ');
    const arr = o.args[0] as unknown[];
    expect(arr).toHaveLength(3);
    expect(textoDe(arr[0] as never)).toBe('A');
    expect(arr[1]).toBe(-120);
  });

  it('ignora comentários', () => {
    expect(ler('1 g % isto é um comentário 0 g\n0 G')).toEqual([
      { op: 'g', args: [1] },
      { op: 'G', args: [0] },
    ]);
  });

  it('dicionários inline em BDC', () => {
    const [o] = ler('/OC /MC0 BDC');
    expect(o.op).toBe('BDC');
    expect(nomeDe(o.args[0])).toBe('OC');
    expect(nomeDe(o.args[1])).toBe('MC0');
    const [d] = ler('/Span <</MCID 3>> BDC');
    expect((d.args[1] as { dict: Record<string, unknown> }).dict.MCID).toBe(3);
  });

  it('imagem inline: salta os bytes binários, mesmo com "EI" lá dentro', () => {
    const s = 'q BI /W 2 /H 2 /CS /G /BPC 8 ID \x00\x01EI\x02 \xff\xfe\nEI Q 1 g';
    const ops = ler(s);
    expect(ops.map((o) => o.op)).toEqual(['q', 'INLINEIMAGE', 'Q', 'g']);
    const dict = (ops[1].args[0] as { dict: Record<string, unknown> }).dict;
    expect(dict.W).toBe(2);
    expect(nomeDe(dict.CS as never)).toBe('G');
  });

  it('booleanos e null', () => {
    const [o] = ler('true false null foo');
    expect(o.args).toEqual([true, false, null]);
  });
});
