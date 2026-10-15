import { describe, expect, it } from 'vitest';
import { chaveSpot, descreverCor, eNomeDeSpot, ehBranco, ehRegisto, ehSpotTecnica, normalizarNomeSpot, semTinta } from '../../src/analise/cores';
import type { Cor } from '../../src/analise/ir';

const cmyk = (...v: number[]): Cor => ({ familia: 'CMYK', valores: v });
const spot = (nome: string, t = 1): Cor => ({ familia: 'Separation', valores: [t], nomes: [nome] });

describe('cores', () => {
  it('descreverCor', () => {
    expect(descreverCor(cmyk(0, 1, 0, 0))).toBe('CMYK 0/100/0/0');
    expect(descreverCor(cmyk(0.1, 0, 0.2, 0))).toBe('CMYK 10/0/20/0');
    expect(descreverCor({ familia: 'RGB', valores: [1, 0, 0.5] })).toBe('RGB 255/0/128');
    expect(descreverCor({ familia: 'Gray', valores: [0] })).toBe('preto');
    expect(descreverCor({ familia: 'Gray', valores: [0.5] })).toBe('cinzento 50%');
    expect(descreverCor(spot('PANTONE 485 C', 0.6))).toBe('PANTONE 485 C 60%');
  });

  it('branco: CMYK 0/0/0/0, cinzento 100%, RGB branco, spot a 0%', () => {
    expect(ehBranco(cmyk(0, 0, 0, 0))).toBe(true);
    expect(ehBranco({ familia: 'Gray', valores: [1] })).toBe(true);
    expect(ehBranco({ familia: 'RGB', valores: [1, 1, 1] })).toBe(true);
    expect(ehBranco(spot('X', 0))).toBe(true);
  });

  it('não é branco: qualquer tinta, preto, cinzento', () => {
    expect(ehBranco(cmyk(0, 0, 0, 0.05))).toBe(false);
    expect(ehBranco(cmyk(0, 0, 0, 1))).toBe(false);
    expect(ehBranco({ familia: 'Gray', valores: [0.9] })).toBe(false);
    expect(ehBranco(spot('X', 1))).toBe(false);
    expect(ehBranco(undefined)).toBe(false);
  });

  it('sem tinta só para CMYK/spots', () => {
    expect(semTinta(cmyk(0, 0, 0, 0))).toBe(true);
    expect(semTinta({ familia: 'Gray', valores: [1] })).toBe(false);
  });

  it('registo é a tinta "All", sem distinguir maiúsculas', () => {
    expect(ehRegisto(spot('All'))).toBe(true);
    expect(ehRegisto(spot('all'))).toBe(true);
    expect(ehRegisto(spot('Cortante'))).toBe(false);
  });

  it('spots técnicas: ignora maiúsculas, espaços e pontuação', () => {
    const lista = ['CutContour', 'Cortante', 'Cut', 'Verniz Localizado'];
    expect(ehSpotTecnica(spot('CUTCONTOUR'), lista)).toBe(true);
    expect(ehSpotTecnica(spot('Cut Contour'), lista)).toBe(true);
    expect(ehSpotTecnica(spot('cortante'), lista)).toBe(true);
    expect(ehSpotTecnica(spot('verniz-localizado'), lista)).toBe(true);
  });

  it('aceita sufixo numérico em nomes longos, mas não prefixos soltos', () => {
    const lista = ['Cortante', 'Cut'];
    expect(ehSpotTecnica(spot('Cortante 2'), lista)).toBe(true);
    expect(ehSpotTecnica(spot('Cortante_final'), lista)).toBe(false);
    // "Cut" tem só 3 letras: não apanha "Cutlery Gold"
    expect(ehSpotTecnica(spot('Cutlery Gold'), lista)).toBe(false);
  });

  it('cores de processo e Pantones nunca são técnicas', () => {
    expect(ehSpotTecnica(cmyk(0, 1, 0, 0), ['Cortante'])).toBe(false);
    expect(ehSpotTecnica(spot('PANTONE 485 C'), ['Cortante', 'Cut'])).toBe(false);
  });

  it('DeviceN: basta uma das tintas ser técnica', () => {
    const dn: Cor = { familia: 'DeviceN', valores: [0, 1], nomes: ['Cyan', 'Cortante'] };
    expect(ehSpotTecnica(dn, ['Cortante'])).toBe(true);
  });

  it('normalizarNomeSpot', () => {
    expect(normalizarNomeSpot('Cut Contour_2')).toBe('cutcontour2');
  });
});

describe('chaveSpot — quando duas spots são a mesma cor', () => {
  const igual = (a: string, b: string) => chaveSpot(a) === chaveSpot(b);

  it('maiúsculas, espaços e pontuação não contam', () => {
    expect(igual('PANTONE 485 C', 'Pantone 485 c')).toBe(true);
    expect(igual('PANTONE 485 C', 'PANTONE  485   C')).toBe(true);
    expect(igual('PANTONE 485 C', 'PANTONE485C')).toBe(true);
    expect(igual('PANTONE 485 C', 'PANTONE-485_C')).toBe(true);
  });

  it('CV e CVC são a versão "color bridge" do revestido (C)', () => {
    expect(igual('PANTONE 485 C', 'PANTONE 485 CV')).toBe(true);
    expect(igual('PANTONE 485 C', 'PANTONE 485 CVC')).toBe(true);
    expect(igual('PANTONE 485 CV', 'PANTONE 485 CVC')).toBe(true);
  });

  it('CVU é a versão do não revestido (U)', () => {
    expect(igual('PANTONE 485 U', 'PANTONE 485 CVU')).toBe(true);
  });

  it('revestido e não revestido são cores diferentes', () => {
    expect(igual('PANTONE 485 C', 'PANTONE 485 U')).toBe(false);
    expect(igual('PANTONE 485 C', 'PANTONE 485 CVU')).toBe(false);
  });

  it('códigos diferentes são cores diferentes', () => {
    expect(igual('PANTONE 485 C', 'PANTONE 486 C')).toBe(false);
    expect(igual('PANTONE 2728 C', 'PANTONE 272 C')).toBe(false);
  });

  it('nomes com palavras: Process Blue, Warm Red', () => {
    expect(igual('PANTONE Warm Red C', 'Pantone warm red CV')).toBe(true);
    expect(igual('PANTONE Warm Red C', 'PANTONE Rubine Red C')).toBe(false);
  });

  it('nomes que não são Pantone comparam-se só por maiúsculas e espaços', () => {
    expect(igual('Verniz', 'VERNIZ ')).toBe(true);
    expect(igual('Verniz Localizado', 'verniz-localizado')).toBe(true);
    expect(igual('Verniz', 'Verniz 2')).toBe(false);
    expect(igual('Cortante', 'Vincos')).toBe(false);
  });

  it('o "C" de uma palavra normal não é sufixo de Pantone', () => {
    expect(igual('Magic', 'Magi')).toBe(false);
  });
});

describe('eNomeDeSpot', () => {
  it('tintas de processo e de sistema não são spots', () => {
    for (const n of ['Cyan', 'MAGENTA', 'Yellow', 'Black', 'All', 'None', '']) expect(eNomeDeSpot(n)).toBe(false);
  });
  it('o resto é', () => {
    expect(eNomeDeSpot('PANTONE 485 C')).toBe(true);
    expect(eNomeDeSpot('Cortante')).toBe(true);
  });
});
