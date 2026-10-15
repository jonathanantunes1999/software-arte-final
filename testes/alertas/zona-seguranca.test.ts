import { describe, expect, it } from 'vitest';
import { alertasZonaSeguranca } from '../../src/alertas/zona-seguranca';
import type { ConfigAlertas } from '../../src/alertas/tipos';
import { analisarRaw, CFG_BASE } from '../fixtures/analisar';
import { mm, type PaginaRaw } from '../fixtures/gerar';

/** Página de 110 mm com o corte a 100 mm (de 5 a 105 mm) e BleedBox a 3 mm do corte */
const PAGINA: Omit<PaginaRaw, 'conteudo'> = { mediaMm: [110, 110], trimMm: [5, 5, 100, 100], bleedMm: [2, 2, 106, 106] };
const FONTES = { F1: { tipo: 'incorporada' as const } };
const re = (x: number, y: number, w: number, h: number) => `${mm(x)} ${mm(y)} ${mm(w)} ${mm(h)} re`;
/** Texto de 10 pt com o canto inferior esquerdo da linha de base em (x, y) mm. A caixa vai de y-2 pt a y+8 pt. */
const texto = (x: number, y: number, s = 'Ola') => `BT /F1 10 Tf ${mm(x)} ${mm(y)} Td (${s}) Tj ET`;

async function alertas(conteudo: string, extra: Partial<PaginaRaw> = {}, cfg: Partial<ConfigAlertas> = {}) {
  const a = await analisarRaw({ ...PAGINA, fontes: FONTES, conteudo, ...extra });
  return alertasZonaSeguranca(a, { ...CFG_BASE, ...cfg });
}
const ids = (as: { id: string }[]) => as.map((a) => a.id);

describe('zona de segurança — texto', () => {
  it('texto a 1,5 mm do corte: aviso', async () => {
    const [a] = await alertas(texto(6.5, 50));
    expect(a.id).toBe('zona-seguranca');
    expect(a.gravidade).toBe('aviso');
    expect(a.titulo).toBe('Elementos a menos de 3,0 mm do corte');
    expect(a.detalhe).toContain('Texto: 1 elemento, o mais perto a 1,5 mm (pág. 1)');
  });

  it('exatamente 3 mm: certo; 2,9 mm: aviso', async () => {
    expect(await alertas(texto(8, 50))).toEqual([]);
    expect(ids(await alertas(texto(7.9, 50)))).toEqual(['zona-seguranca']);
  });

  it('os quatro lados', async () => {
    // direita: "A" tem 5 pt (1,76 mm) de largura; termina a 1,5 mm do corte
    expect(ids(await alertas(texto(105 - 1.5 - 1.76, 50, 'A')))).toEqual(['zona-seguranca']);
    // em baixo: a caixa desce 2 pt (0,71 mm) abaixo da linha; linha a 5+1 mm => caixa a 5,29 mm
    expect(ids(await alertas(texto(50, 5 + 1)))).toEqual(['zona-seguranca']);
    // em cima: a caixa sobe 8 pt (2,82 mm) acima da linha
    expect(ids(await alertas(texto(50, 105 - 1 - 2.82)))).toEqual(['zona-seguranca']);
  });

  it('texto que passa o corte: diz quanto', async () => {
    const [a] = await alertas(texto(3, 50));
    expect(a.detalhe).toContain('o mais perto passa o corte 2,0 mm');
  });

  it('o ascent exagerado da fonte não faz o texto parecer mais perto do que está', async () => {
    // Fonte com Ascent 1000: sem limite a caixa subia 10 pt (3,53 mm) e dava 3,0 − 0,7 = falso aviso.
    const fontes = { F1: { tipo: 'incorporada' as const, ascent: 1000, descent: -300 } };
    // linha de base a 105 − 3,0 − 2,82 mm: a tinta (0,8 em = 8 pt) fica a 3,0 mm do corte
    expect(await alertas(texto(50, 105 - 3 - 2.82), { fontes })).toEqual([]);
  });

  it('limite configurável (3 a 5 mm)', async () => {
    expect(await alertas(texto(9, 50))).toEqual([]); // 4 mm
    expect(ids(await alertas(texto(9, 50), {}, { zonaSegurancaMm: 5 }))).toEqual(['zona-seguranca']);
    expect((await alertas(texto(9, 50), {}, { zonaSegurancaMm: 5 }))[0].titulo).toBe('Elementos a menos de 5,0 mm do corte');
  });

  it('texto branco também conta: é o que se corta numa caixa escura', async () => {
    expect(ids(await alertas(`0 0 0 0 k ${texto(6.5, 50)}`))).toEqual(['zona-seguranca']);
  });

  it('texto com contorno só (modo 1) conta', async () => {
    expect(ids(await alertas(`1 Tr ${texto(6.5, 50)}`))).toEqual(['zona-seguranca']);
  });
});

describe('zona de segurança — o que NÃO deve apanhar no texto', () => {
  it('texto longe do corte', async () => {
    expect(await alertas(texto(30, 50))).toEqual([]);
  });

  it('texto todo fora do corte (legenda de marcas)', async () => {
    expect(await alertas(texto(1, 50, 'A'))).toEqual([]);
  });

  it('texto invisível (camada de OCR)', async () => {
    expect(await alertas(`3 Tr ${texto(6.5, 50)}`)).toEqual([]);
  });

  it('texto numa layer desligada por omissão', async () => {
    const camadas = { MC0: { nome: 'Rascunho', oculta: true } };
    expect(await alertas(`/OC /MC0 BDC ${texto(6.5, 50)} EMC`, { camadas })).toEqual([]);
  });

  it('texto recortado', async () => {
    expect(await alertas(`${re(60, 60, 10, 10)} W n ${texto(6.5, 50)}`)).toEqual([]);
  });
});

describe('zona de segurança — imagens e gráficos', () => {
  const imagens = { Im0: { larguraPx: 100, alturaPx: 100, espaco: 'CMYK' as const } };
  const imagem = (x: number, y: number, l: number, a: number) => `q ${mm(l)} 0 0 ${mm(a)} ${mm(x)} ${mm(y)} cm /Im0 Do Q`;

  it('imagem a 2 mm do corte, sem lhe tocar', async () => {
    const [a] = await alertas(imagem(7, 40, 20, 20), { imagens });
    expect(a.detalhe).toContain('Imagens: 1 elemento, o mais perto a 2,0 mm');
  });

  it('gráfico a 1 mm do corte', async () => {
    const [a] = await alertas(`0 1 1 0 k ${re(6, 40, 30, 30)} f`);
    expect(a.detalhe).toContain('Gráficos: 1 elemento, o mais perto a 1,0 mm');
  });

  it('as três categorias em linhas separadas, por ordem', async () => {
    const c = `${texto(6.5, 90)} 0 1 1 0 k ${re(6, 40, 20, 20)} f ${imagem(50, 6, 20, 20)}`;
    const linhas = (await alertas(c, { imagens }))[0].detalhe!.split('\n');
    expect(linhas[1]).toMatch(/^Texto:/);
    expect(linhas[2]).toMatch(/^Imagens:/);
    expect(linhas[3]).toMatch(/^Gráficos:/);
  });

  it('imagem que toca o corte ou o passa é sangria, não zona de segurança', async () => {
    expect(await alertas(imagem(5, 40, 20, 20), { imagens })).toEqual([]); // toca
    expect(await alertas(imagem(2, 40, 20, 20), { imagens })).toEqual([]); // passa
    expect(await alertas(`0 1 1 0 k ${re(2, 40, 106, 30)} f`)).toEqual([]);
  });

  it('um painel que cobre 90% do corte é o fundo, mesmo sem lhe tocar', async () => {
    // 96 × 96 mm a 2 mm do corte: 92% da área
    expect(await alertas(`0 1 1 0 k ${re(7, 7, 96, 96)} f`)).toEqual([]);
  });

  it('...mas um painel de 85% já é conteúdo', async () => {
    // 92 × 92 mm = 84,6%
    expect(ids(await alertas(`0 1 1 0 k ${re(7, 7, 92, 92)} f`))).toEqual(['zona-seguranca']);
  });

  it('branco, faca, vincos e registo não contam', async () => {
    const espacos = {
      CS0: { tipo: 'separation' as const, nome: 'cortante' },
      CS1: { tipo: 'separation' as const, nome: 'All' },
    };
    expect(await alertas(`0 0 0 0 k ${re(6, 40, 30, 30)} f`)).toEqual([]);
    expect(await alertas(`/CS0 CS 1 SCN 1 w ${re(6, 6, 98, 98)} S`, { espacos })).toEqual([]);
    expect(await alertas(`/CS1 CS 1 SCN 1 w ${re(6, 6, 98, 98)} S`, { espacos })).toEqual([]);
  });

  it('gráfico dentro da zona segura', async () => {
    expect(await alertas(`0 1 1 0 k ${re(20, 20, 60, 60)} f`)).toEqual([]);
  });

  it('o que está todo fora do corte (marcas) não conta', async () => {
    expect(await alertas(`0 0 0 1 K 0.25 w ${mm(2)} ${mm(0)} m ${mm(2)} ${mm(4)} l S`)).toEqual([]);
  });

  it('layer desligada por omissão', async () => {
    const camadas = { MC0: { nome: 'Rascunho', oculta: true } };
    expect(await alertas(`/OC /MC0 BDC 0 1 1 0 k ${re(6, 40, 30, 30)} f EMC`, { camadas })).toEqual([]);
  });

  it('degradé: a caixa é a do recorte e não se mede', async () => {
    expect(await alertas(`${re(6, 40, 30, 30)} W n /Sh0 sh`)).toEqual([]);
  });
});

describe('zona de segurança — agrupar e apontar', () => {
  it('conta elementos, lista páginas e mostra o mais perto', async () => {
    const pag = { ...PAGINA, fontes: FONTES, conteudo: `${texto(6.5, 50)} ${texto(7, 70)} ${texto(6, 30)}` };
    const a = alertasZonaSeguranca(await analisarRaw(pag, { ...PAGINA, conteudo: '' }, pag), CFG_BASE);
    expect(a[0].detalhe).toContain('Texto: 6 elementos, o mais perto a 1,0 mm (págs. 1, 3)');
  });

  it('o destaque junta o que está perto e separa o que está longe', async () => {
    // duas linhas de texto próximas na esquerda, uma isolada em cima
    const c = `${texto(6, 50)} ${texto(6, 57)} ${texto(60, 103.5)}`;
    const [a] = await alertas(c);
    expect(a.locais).toHaveLength(2);
  });

  it('o destaque é a parte do elemento dentro do corte', async () => {
    const [a] = await alertas(texto(3, 50));
    expect(a.locais![0].caixa.x0).toBeCloseTo(mm(5), 3);
  });
});
