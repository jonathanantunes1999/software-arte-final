import { describe, expect, it } from 'vitest';
import { alertasPreto } from '../../src/alertas/preto';
import type { ConfigAlertas } from '../../src/alertas/tipos';
import { ehPretoChapado, ehPretoRico } from '../../src/analise/cores';
import { analisarRaw, BASE, CFG_BASE } from '../fixtures/analisar';
import type { PaginaRaw } from '../fixtures/gerar';

const FONTES = { F1: { tipo: 'incorporada' as const } };
const texto = (cor: string, tam: number) => `${cor} BT /F1 ${tam} Tf 10 50 Td (Ola) Tj ET`;

async function alertas(conteudo: string, extra: Partial<PaginaRaw> = {}, cfg: Partial<ConfigAlertas> = {}) {
  return alertasPreto(await analisarRaw({ ...BASE, conteudo, fontes: FONTES, ...extra }), { ...CFG_BASE, ...cfg });
}
const ids = (as: { id: string }[]) => as.map((a) => a.id);

describe('preto — o que é preto rico e o que é preto chapado', () => {
  const cmyk = (...v: number[]) => ({ familia: 'CMYK' as const, valores: v });
  it('preto rico: K alto com C, M e Y', () => {
    expect(ehPretoRico(cmyk(0.6, 0.4, 0.4, 1))).toBe(true);
    expect(ehPretoRico(cmyk(0.75, 0.68, 0.67, 0.9))).toBe(true);
    expect(ehPretoRico(cmyk(1, 1, 1, 1))).toBe(true);
  });
  it('não é preto rico: só K, só duas tintas, K baixo', () => {
    expect(ehPretoRico(cmyk(0, 0, 0, 1))).toBe(false);
    expect(ehPretoRico(cmyk(0.3, 0, 0, 1))).toBe(false);
    expect(ehPretoRico(cmyk(0.6, 0.4, 0.4, 0.5))).toBe(false);
    expect(ehPretoRico({ familia: 'RGB', valores: [0, 0, 0] })).toBe(false);
  });
  it('preto chapado: só K a 100% ou cinzento 0', () => {
    expect(ehPretoChapado(cmyk(0, 0, 0, 1))).toBe(true);
    expect(ehPretoChapado({ familia: 'Gray', valores: [0] })).toBe(true);
    expect(ehPretoChapado(cmyk(0, 0, 0, 0.8))).toBe(false);
    expect(ehPretoChapado(cmyk(0.1, 0, 0, 1))).toBe(false);
  });
});

describe('preto — texto pequeno em quatro cores', () => {
  it('8 pt em 60/40/40/100: aviso', async () => {
    const [a] = await alertas(texto('0.6 0.4 0.4 1 k', 8));
    expect(a.id).toBe('preto-rico-texto-pequeno');
    expect(a.gravidade).toBe('aviso');
    expect(a.detalhe).toContain('CMYK 60/40/40/100: 1 texto de 8 pt (pág. 1)');
    expect(a.locais).toHaveLength(1);
  });

  it('12 pt exatos: certo; 11,9 pt: aviso', async () => {
    expect(await alertas(texto('0.6 0.4 0.4 1 k', 12))).toEqual([]);
    expect(ids(await alertas(texto('0.6 0.4 0.4 1 k', 11.9)))).toEqual(['preto-rico-texto-pequeno']);
  });

  it('texto grande em quatro cores é aceitável', async () => {
    expect(await alertas(texto('0.6 0.4 0.4 1 k', 24))).toEqual([]);
  });

  it('limite configurável', async () => {
    expect(await alertas(texto('0.6 0.4 0.4 1 k', 14), {}, { textoPretoMaxPt: 12 })).toEqual([]);
    expect(ids(await alertas(texto('0.6 0.4 0.4 1 k', 14), {}, { textoPretoMaxPt: 16 }))).toEqual(['preto-rico-texto-pequeno']);
  });

  it('registo (100/100/100/100) conta', async () => {
    expect(ids(await alertas(texto('1 1 1 1 k', 8)))).toEqual(['preto-rico-texto-pequeno']);
  });

  it('o corpo efetivo inclui a escala: 4 pt a 2× são 8 pt', async () => {
    expect(ids(await alertas(`2 0 0 2 0 0 cm ${texto('0.6 0.4 0.4 1 k', 4)}`))).toEqual(['preto-rico-texto-pequeno']);
    expect(await alertas(`3 0 0 3 0 0 cm ${texto('0.6 0.4 0.4 1 k', 4)}`)).toEqual([]);
  });

  it('mostra o intervalo de corpos quando há vários', async () => {
    const [a] = await alertas(`0.6 0.4 0.4 1 k BT /F1 6 Tf 10 20 Td (A) Tj /F1 10 Tf 0 20 Td (B) Tj ET`);
    expect(a.detalhe).toContain('2 textos de 6–10 pt');
  });

  it('K 100% simples em texto pequeno é o certo', async () => {
    expect(await alertas(texto('0 0 0 1 k', 8))).toEqual([]);
  });

  it('K alto com só uma cor, ou K baixo, não são preto de 4 cores', async () => {
    expect(await alertas(texto('0.3 0 0 1 k', 8))).toEqual([]);
    expect(await alertas(texto('0.6 0.4 0.4 0.5 k', 8))).toEqual([]);
  });

  it('texto invisível e layers desligadas não contam', async () => {
    expect(await alertas('0.6 0.4 0.4 1 k BT /F1 8 Tf 3 Tr 10 50 Td (Ola) Tj ET')).toEqual([]);
    const camadas = { MC0: { nome: 'Rascunho', oculta: true } };
    expect(await alertas(`/OC /MC0 BDC ${texto('0.6 0.4 0.4 1 k', 8)} EMC`, { camadas })).toEqual([]);
  });

  it('só o texto: uma forma pequena em quatro cores não conta', async () => {
    expect(await alertas('0.6 0.4 0.4 1 k 10 10 5 5 re f')).toEqual([]);
  });
});

describe('preto — fundo só em K: a área conta só dentro do corte', () => {
  // página de 110 mm com o corte a 100 mm no meio: o que passa do corte é sangria e não conta
  const pagina = { mediaMm: [110, 110] as [number, number], trimMm: [5, 5, 100, 100] as [number, number, number, number], bleedMm: [2, 2, 106, 106] as [number, number, number, number] };
  const mm = (v: number) => (v * 72) / 25.4;

  it('fundo que cobre a página e a sangria: 100% e não mais', async () => {
    const [a] = await alertas(`0 0 0 1 k 0 0 ${mm(110)} ${mm(110)} re f`, pagina);
    expect(a.detalhe).toContain('100% da página');
  });

  it('fundo que só tem uma faixa dentro do corte: conta só essa faixa', async () => {
    // faixa vertical da esquerda: x de 0 a 30 mm; dentro do corte são 25 mm de 100 = 25%
    const [a] = await alertas(`0 0 0 1 k 0 0 ${mm(30)} ${mm(110)} re f`, pagina);
    expect(a.detalhe).toContain('25% da página');
  });

  it('um fundo só na sangria, fora do corte, não conta', async () => {
    expect(await alertas(`0 0 0 1 k 0 0 ${mm(5)} ${mm(110)} re f`, pagina)).toEqual([]);
  });
});

describe('preto — fundo grande só em K 100%', () => {
  // BASE: página de 100 × 100 mm, sem TrimBox, logo corte = página. 283,46 pt de lado.
  const L = 283.4645669;
  const fundo = (frac: number) => `0 0 0 1 k 0 0 ${L} ${L * frac} re f`; // fração da altura = fração da área

  it('50% da página: aviso, com a percentagem', async () => {
    const [a] = await alertas(fundo(0.5));
    expect(a.id).toBe('fundo-preto-chapado');
    expect(a.gravidade).toBe('aviso');
    expect(a.detalhe).toContain('Pág. 1: 50% da página');
  });

  it('20% é pequeno (limite 25%); 25% já conta', async () => {
    expect(await alertas(fundo(0.2))).toEqual([]);
    expect(ids(await alertas(fundo(0.25)))).toEqual(['fundo-preto-chapado']);
  });

  it('limite configurável', async () => {
    expect(ids(await alertas(fundo(0.2), {}, { fundoPretoMinimoPercent: 10 }))).toEqual(['fundo-preto-chapado']);
    expect(await alertas(fundo(0.5), {}, { fundoPretoMinimoPercent: 60 })).toEqual([]);
  });

  it('cinzento 0 (preto) também conta', async () => {
    expect(ids(await alertas(`0 g 0 0 ${L} ${L / 2} re f`))).toEqual(['fundo-preto-chapado']);
  });

  it('o destaque é a parte do fundo que está dentro do corte', async () => {
    const [a] = await alertas(fundo(0.5));
    expect(a.locais![0].caixa.y1).toBeCloseTo(L / 2, 3);
  });

  it('só conta o que cai dentro do corte, não a sangria', async () => {
    // fundo de 3× a página, mas só um quarto cai dentro do corte? aqui cobre a página inteira: 100%
    const [a] = await alertas(`0 0 0 1 k -50 -50 ${L + 100} ${L + 100} re f`);
    expect(a.detalhe).toContain('100% da página');
  });

  it('preto rico em fundo grande é o certo', async () => {
    expect(await alertas(`0.6 0.4 0.4 1 k 0 0 ${L} ${L} re f`)).toEqual([]);
  });

  it('moldura preta: caixa enorme mas pouca tinta (buraco descontado)', async () => {
    // 100 × 100 mm com buraco de 90 × 90: ficam 19% da página
    const m = L * 0.05;
    expect(await alertas(`0 0 0 1 k 0 0 ${L} ${L} re ${m} ${m} ${L - 2 * m} ${L - 2 * m} re f*`)).toEqual([]);
  });

  it('um traço (filete) não é fundo', async () => {
    expect(await alertas(`0 0 0 1 K 5 w 0 0 ${L} ${L} re S`)).toEqual([]);
  });

  it('K 100% numa Pantone ou spot não conta', async () => {
    const espacos = { CS0: { tipo: 'separation' as const, nome: 'PANTONE Black C' } };
    expect(await alertas(`/CS0 cs 1 scn 0 0 ${L} ${L} re f`, { espacos })).toEqual([]);
  });

  it('layer desligada por omissão', async () => {
    const camadas = { MC0: { nome: 'Rascunho', oculta: true } };
    expect(await alertas(`/OC /MC0 BDC ${fundo(1)} EMC`, { camadas })).toEqual([]);
  });

  it('fundo parcialmente recortado conta só a parte visível', async () => {
    // recorte a 10% da altura: o fundo de 100% fica com 10%
    expect(await alertas(`0 0 ${L} ${L * 0.1} re W n ${fundo(1)}`)).toEqual([]);
  });
});
