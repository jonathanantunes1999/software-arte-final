import { describe, expect, it } from 'vitest';
import { alertasSangria } from '../../src/alertas/sangria';
import { SPOTS_TECNICAS_OMISSAO, type ConfigAlertas } from '../../src/alertas/tipos';
import { analisarRaw } from '../fixtures/analisar';
import { mm, type PaginaRaw } from '../fixtures/gerar';

const CFG: ConfigAlertas = { sangriaReferenciaMm: 3, toleranciaFormatoMm: 0.5, spotsTecnicas: SPOTS_TECNICAS_OMISSAO };

/** Página de 110 mm com corte a 100 mm (margem de 5 mm) e BleedBox a 3 mm do corte */
const PAGINA: Omit<PaginaRaw, 'conteudo'> = { mediaMm: [110, 110], trimMm: [5, 5, 100, 100], bleedMm: [2, 2, 106, 106] };
const re = (x: number, y: number, w: number, h: number) => `${mm(x)} ${mm(y)} ${mm(w)} ${mm(h)} re`;

async function alertas(conteudo: string, extra: Partial<PaginaRaw> = {}, cfg: Partial<ConfigAlertas> = {}) {
  const a = await analisarRaw({ ...PAGINA, conteudo, ...extra });
  return alertasSangria(a, { ...CFG, ...cfg });
}
const ids = (as: { id: string }[]) => as.map((a) => a.id);

describe('sangria — o que deve apanhar', () => {
  it('fundo até ao corte, sem passar: erro nos quatro lados', async () => {
    const r = await alertas(`0 0 0 1 k ${re(5, 5, 100, 100)} f`);
    expect(ids(r)).toEqual(['sangria-ausente']);
    expect(r[0].gravidade).toBe('erro');
    expect(r[0].detalhe).toContain('Esquerda, direita, em cima e em baixo');
    expect(r[0].locais).toHaveLength(4);
  });

  it('fundo com sangria curta: aviso com o valor, e só dos lados curtos', async () => {
    // passa 1,5 mm à esquerda; nos outros lados passa 3 mm
    const r = await alertas(`0 0 0 1 k ${re(3.5, 2, 104.5, 106)} f`);
    expect(ids(r)).toEqual(['sangria-curta']);
    expect(r[0].gravidade).toBe('aviso');
    expect(r[0].titulo).toBe('Sangria menor que 3,0 mm');
    expect(r[0].detalhe).toContain('Esquerda 1,5 mm');
    expect(r[0].detalhe).not.toMatch(/direita|em cima|em baixo/i);
  });

  it('só os lados onde o objeto toca no corte', async () => {
    // toca no corte à esquerda (sem passar); em cima passa 3 mm; não chega à direita nem a baixo
    const r = await alertas(`0 0 0 1 k ${re(5, 20, 50, 88)} f`);
    expect(ids(r)).toEqual(['sangria-ausente']);
    expect(r[0].detalhe).toContain('Esquerda');
    expect(r[0].detalhe).not.toMatch(/direita|em cima|em baixo/i);
    expect(r[0].locais).toHaveLength(1);
  });

  it('imagem encostada ao corte sem sangria', async () => {
    const imagens = { Im0: { larguraPx: 1000, alturaPx: 1000, espaco: 'CMYK' as const } };
    const r = await alertas(`q ${mm(100)} 0 0 ${mm(100)} ${mm(5)} ${mm(5)} cm /Im0 Do Q`, { imagens });
    expect(ids(r)).toEqual(['sangria-ausente']);
  });

  it('o recorte do conteúdo ao corte tira a sangria que existia', async () => {
    const r = await alertas(`${re(5, 5, 100, 100)} W n 0 0 0 1 k ${re(0, 0, 110, 110)} f`);
    expect(ids(r)).toEqual(['sangria-ausente']);
  });

  it('traço (filete) no limite do corte: só metade passa', async () => {
    const r = await alertas(`0 0 0 1 K ${mm(1)} w ${re(5, 5, 100, 100)} S`);
    // metade de 1 mm = 0,5 mm de excesso: sangria curta, não ausente
    expect(ids(r)).toEqual(['sangria-curta']);
    expect(r[0].detalhe).toContain('0,5 mm');
  });

  it('o limite de referência é configurável', async () => {
    const fundo = `0 0 0 1 k ${re(3.5, 3.5, 103, 103)} f`; // 1,5 mm de sangria
    expect(ids(await alertas(fundo, {}, { sangriaReferenciaMm: 3 }))).toEqual(['sangria-curta']);
    expect(await alertas(fundo, {}, { sangriaReferenciaMm: 1 })).toEqual([]);
    expect(ids(await alertas(fundo, {}, { sangriaReferenciaMm: 5 }))).toEqual(['sangria-curta']);
  });

  it('agrupa páginas iguais e mostra o número da página', async () => {
    const pag = { ...PAGINA, conteudo: `0 0 0 1 k ${re(5, 5, 100, 100)} f` };
    const a = await analisarRaw(pag, { ...pag, conteudo: `0 0 0 1 k ${re(2, 2, 106, 106)} f` }, pag);
    const [al] = alertasSangria(a, CFG);
    expect(al.detalhe).toContain('págs. 1, 3');
    expect(al.locais!.map((l) => l.pagina)).toContain(2);
    expect(al.locais!.map((l) => l.pagina)).not.toContain(1);
  });

  it('com a página rodada, os lados dizem-se como se veem', async () => {
    // toca só à esquerda do espaço de utilizador; com /Rotate 90 isso fica "em cima"
    const r = await alertas(`0 0 0 1 k ${re(5, 20, 50, 88)} f`, { rotacao: 90 });
    expect(r[0].detalhe).toContain('Em cima');
  });
});

describe('sangria — o que NÃO deve apanhar (falsos positivos)', () => {
  it('fundo que chega à BleedBox: sangria certa', async () => {
    expect(await alertas(`0 0 0 1 k ${re(2, 2, 106, 106)} f`)).toEqual([]);
  });

  it('fundo que passa além da sangria pedida', async () => {
    expect(await alertas(`0 0 0 1 k ${re(0, 0, 110, 110)} f`)).toEqual([]);
  });

  it('conteúdo com margem branca dentro do corte não precisa de sangria', async () => {
    expect(await alertas(`0 0 0 1 k ${re(15, 15, 80, 80)} f`)).toEqual([]);
  });

  it('página vazia', async () => {
    expect(await alertas('')).toEqual([]);
  });

  it('branco (0/0/0/0) encostado ao corte não conta: o papel já é branco', async () => {
    expect(await alertas(`0 0 0 0 k ${re(5, 5, 100, 100)} f`)).toEqual([]);
    expect(await alertas(`1 g ${re(5, 5, 100, 100)} f`)).toEqual([]);
  });

  it('texto encostado ao corte não é assunto de sangria', async () => {
    const fontes = { F1: { tipo: 'incorporada' as const } };
    expect(await alertas(`BT /F1 10 Tf ${mm(5)} ${mm(50)} Td (A) Tj ET`, { fontes })).toEqual([]);
  });

  it('marcas de corte fora do corte não contam', async () => {
    const marcas = ['0 0 0 1 K 0.25 w'];
    // marcas verticais e horizontais a 3 mm do canto, junto do corte mas fora dele
    for (const [x, y] of [[5, 5], [105, 5], [5, 105], [105, 105]]) {
      marcas.push(`${mm(x)} ${mm(y - 4)} m ${mm(x)} ${mm(y - 1)} l S`, `${mm(x - 4)} ${mm(y)} m ${mm(x - 1)} ${mm(y)} l S`);
    }
    expect(await alertas(marcas.join(' '))).toEqual([]);
  });

  it('faca, vincos e registo encostados ao corte não precisam de sangria', async () => {
    const espacos = {
      CS0: { tipo: 'separation' as const, nome: 'cortante' },
      CS1: { tipo: 'separation' as const, nome: 'Vincos' },
      CS2: { tipo: 'separation' as const, nome: 'All' },
    };
    for (const cs of ['CS0', 'CS1', 'CS2']) {
      expect(await alertas(`/${cs} CS 1 SCN 1 w ${re(5, 5, 100, 100)} S`, { espacos })).toEqual([]);
    }
  });

  it('...mas uma spot normal na mesma posição apanha-se (controlo)', async () => {
    const espacos = { CS0: { tipo: 'separation' as const, nome: 'PANTONE 485 C' } };
    expect(ids(await alertas(`/CS0 cs 1 scn ${re(5, 5, 100, 100)} f`, { espacos }))).toEqual(['sangria-ausente']);
  });

  it('a lista de spots técnicas é configurável', async () => {
    const espacos = { CS0: { tipo: 'separation' as const, nome: 'Faca do cliente' } };
    const conteudo = `/CS0 CS 1 SCN ${re(5, 5, 100, 100)} S`;
    expect(ids(await alertas(conteudo, { espacos }))).toEqual(['sangria-ausente']);
    expect(await alertas(conteudo, { espacos }, { spotsTecnicas: ['faca do cliente'] })).toEqual([]);
  });

  it('layer desligada por omissão não conta', async () => {
    const camadas = { MC0: { nome: 'Rascunho', oculta: true } };
    expect(await alertas(`/OC /MC0 BDC 0 0 0 1 k ${re(5, 5, 100, 100)} f EMC`, { camadas })).toEqual([]);
  });
});

describe('sangria — que área conta', () => {
  it('sem BleedBox, a CropBox é o limite: conteúdo cortado por ela não tem sangria', async () => {
    const r = await alertas(`0 0 0 1 k ${re(0, 0, 110, 110)} f`, { bleedMm: undefined, cropMm: [5, 5, 100, 100] });
    expect(ids(r)).toEqual(['sangria-ausente']);
  });

  it('com BleedBox, é ela o limite, mesmo que a CropBox seja mais pequena', async () => {
    expect(await alertas(`0 0 0 1 k ${re(0, 0, 110, 110)} f`, { cropMm: [5, 5, 100, 100] })).toEqual([]);
  });

  it('BleedBox de 1 mm corta o conteúdo: sangria curta mesmo que o desenho passe mais', async () => {
    const r = await alertas(`0 0 0 1 k ${re(0, 0, 110, 110)} f`, { bleedMm: [4, 4, 102, 102] });
    expect(ids(r)).toEqual(['sangria-curta']);
    expect(r[0].detalhe).toContain('1,0 mm');
  });
});
