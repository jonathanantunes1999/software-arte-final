import { describe, expect, it } from 'vitest';
import { nomeDe, operacoes, textoDe, type Operacao } from '../../src/analise/lexer';

const ler = (s: string): Operacao[] => [...operacoes(s)];

describe('lexer', () => {
  it('separa operadores e operandos', () => {
    expect(ler('1 0 0 1 10 20 cm 0.5 g')).toEqual([
      { op: 'cm', args: [1, 0, 0, 1, 10, 20], inicio: 0, fim: 16 },
      { op: 'g', args: [0.5], inicio: 17, fim: 22 },
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
    expect(ler('1 g % isto é um comentário 0 g\n0 G')).toMatchObject([
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

  describe('posições no texto original', () => {
    const corta = (src: string) => ler(src).map((o) => src.slice(o.inicio, o.fim));

    it('cada operação vai do primeiro operando ao fim do operador', () => {
      expect(corta('q 0.1 0.2 0.3 0.4 k 10 10 50 50 re f Q')).toEqual(['q', '0.1 0.2 0.3 0.4 k', '10 10 50 50 re', 'f', 'Q']);
    });

    it('comentários e espaços entre operações não entram', () => {
      expect(corta('  1 g % comentário\n   0 G  ')).toEqual(['1 g', '0 G']);
    });

    it('strings, arrays e dicionários fazem parte da operação', () => {
      expect(corta('BT /F1 12 Tf [(A) -20 (B)] TJ ET')).toEqual(['BT', '/F1 12 Tf', '[(A) -20 (B)] TJ', 'ET']);
      expect(corta('/Span <</MCID 3>> BDC')).toEqual(['/Span <</MCID 3>> BDC']);
    });

    it('imagem inline: de BI até depois de EI', () => {
      const src = 'q BI /W 1 /H 1 /BPC 8 /CS /G ID \x00 EI Q 0 g';
      expect(corta(src)).toEqual(['q', 'BI /W 1 /H 1 /BPC 8 /CS /G ID \x00 EI', 'Q', '0 g']);
    });

    it('nomes com delimitadores colados', () => {
      expect(corta('[1 2]0 d/GS0 gs')).toEqual(['[1 2]0 d', '/GS0 gs']);
    });
  });
});
