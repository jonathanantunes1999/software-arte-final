import { describe, expect, it } from 'vitest';
import { combina, contemExpressao, distancia, normalizar, numeroNoTexto, palavras, tem, temExata } from '../../src/assistente/texto';

describe('assistente: ler o texto', () => {
  it('normaliza acentos, maiúsculas e pontuação', () => {
    expect(normalizar('  Põe tudo em CURVAS, por favor!  ')).toBe('poe tudo em curvas por favor');
    expect(normalizar('Qual é a diferença entre RGB e CMYK?')).toBe('qual e a diferenca entre rgb e cmyk');
    expect(normalizar('300 ppi... 3mm')).toBe('300 ppi 3mm');
    expect(palavras('')).toEqual([]);
  });

  it('distância de edição, com transposição e corte', () => {
    expect(distancia('sangria', 'sangria')).toBe(0);
    expect(distancia('sangira', 'sangria')).toBe(1); // letras trocadas
    expect(distancia('cmik', 'cmyk')).toBe(1);
    expect(distancia('abc', 'xyz', 1)).toBe(2); // acima do corte
    expect(distancia('a', 'abcdefgh', 2)).toBe(3);
  });

  it('combina por início de palavra e com uma gralha em radicais compridos', () => {
    expect(combina('corrigir', 'corrig')).toBe(true);
    expect(combina('corrige', 'corrig')).toBe(true);
    expect(combina('corrija', 'corrig')).toBe(true); // o g→j do conjuntivo cabe na gralha tolerada
    expect(combina('coisa', 'corrig')).toBe(false);
    expect(combina('sangira', 'sangri')).toBe(true);
    expect(combina('overprnt', 'overprint')).toBe(true);
    expect(combina('cor', 'corrig')).toBe(false);
    expect(combina('casa', 'corrig')).toBe(false);
  });

  it('tem / temExata', () => {
    const ps = palavras('quero converter para cmyk');
    expect(tem(ps, ['convert', 'passa'])).toBe(true);
    expect(tem(ps, ['sangri'])).toBe(false);
    expect(temExata(ps, ['cmyk'])).toBe(true);
    expect(temExata(palavras('cmykzinho'), ['cmyk'])).toBe(false);
  });

  it('expressões só valem por palavras inteiras', () => {
    expect(contemExpressao('o que e sangria', 'o que e')).toBe(true);
    expect(contemExpressao('toque e sangria', 'o que e')).toBe(false);
  });

  it('números e ordinais', () => {
    expect(numeroNoTexto(palavras('vai para a pagina 12'))).toBe(12);
    expect(numeroNoTexto(palavras('explica o primeiro erro'))).toBe(1);
    expect(numeroNoTexto(palavras('mostra o terceiro alerta'))).toBe(3);
    expect(numeroNoTexto(palavras('pagina dois'))).toBe(2);
    expect(numeroNoTexto(palavras('nenhum numero aqui'))).toBeNull();
    // "non" (nono) não se confunde com "nono"... nem com "nao"
    expect(numeroNoTexto(palavras('nao quero'))).toBeNull();
  });
});
