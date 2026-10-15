import { describe, expect, it } from 'vitest';
import { alertasOverprint } from '../../src/alertas/overprint';
import type { ConfigAlertas } from '../../src/alertas/tipos';
import { analisarRaw, BASE, CFG_BASE } from '../fixtures/analisar';
import type { PaginaRaw } from '../fixtures/gerar';

const ESTADOS = {
  GS0: { OP: false, op: false },
  GS1: { OP: true, op: true, OPM: 1 }, // overprint ligado, modo 1: o que o Illustrator escreve
  GS2: { OP: true, op: true, OPM: 0 }, // ligado mas em modo 0
};
const FONTES = { F1: { tipo: 'incorporada' as const } };
const ESPACOS = {
  CS0: { tipo: 'separation' as const, nome: 'cortante' },
  CS1: { tipo: 'separation' as const, nome: 'PANTONE 485 C' },
  CS2: { tipo: 'separation' as const, nome: 'Verniz' },
  CS3: { tipo: 'separation' as const, nome: 'All' },
};
/** Fundo ciano a toda a página */
const FUNDO = '0.8 0 0 0 k 0 0 300 300 re f';
const texto = (x = 20, y = 50) => `BT /F1 10 Tf ${x} ${y} Td (Ola) Tj ET`;

async function alertas(conteudo: string, extra: Partial<PaginaRaw> = {}, cfg: Partial<ConfigAlertas> = {}) {
  const a = await analisarRaw({ ...BASE, fontes: FONTES, espacos: ESPACOS, estados: ESTADOS, conteudo, ...extra });
  return alertasOverprint(a, { ...CFG_BASE, ...cfg });
}
const ids = (as: { id: string }[]) => as.map((a) => a.id);

describe('overprint — branco que desaparece', () => {
  it('branco 0/0/0/0 em overprint (modo 1) sobre um fundo: erro', async () => {
    const [a] = await alertas(`${FUNDO} /GS1 gs 0 0 0 0 k 20 20 50 50 re f`);
    expect(a.id).toBe('overprint-branco');
    expect(a.gravidade).toBe('erro');
    expect(a.titulo).toBe('Branco com overprint');
    expect(a.detalhe).toContain('Preenchimentos brancos: 1 (pág. 1)');
    expect(a.locais).toHaveLength(1);
  });

  it('texto branco e traço branco, em linhas separadas', async () => {
    const [a] = await alertas(`${FUNDO} /GS1 gs 0 0 0 0 k ${texto()} 0 0 0 0 K 2 w 100 100 m 200 100 l S`);
    expect(a.detalhe).toContain('Texto brancos: 1');
    expect(a.detalhe).toContain('Traços brancos: 1');
  });

  it('em modo 0 o branco apaga o que está por baixo e mostra-se: não é problema', async () => {
    expect(await alertas(`${FUNDO} /GS2 gs 0 0 0 0 k 20 20 50 50 re f`)).toEqual([]);
  });

  it('branco sem overprint é o normal (apaga a cor por baixo)', async () => {
    expect(await alertas(`${FUNDO} /GS0 gs 0 0 0 0 k 20 20 50 50 re f`)).toEqual([]);
  });

  it('branco em overprint sem nada por baixo: não faz diferença nenhuma', async () => {
    expect(await alertas('/GS1 gs 0 0 0 0 k 20 20 50 50 re f')).toEqual([]);
  });

  it('o que está por baixo tem de estar pintado antes: um fundo que vem depois não conta', async () => {
    expect(await alertas(`/GS1 gs 0 0 0 0 k 20 20 50 50 re f /GS0 gs ${FUNDO}`)).toEqual([]);
  });

  it('por baixo só há outro branco: nada a apagar', async () => {
    expect(await alertas('/GS0 gs 0 0 0 0 k 0 0 300 300 re f /GS1 gs 20 20 50 50 re f')).toEqual([]);
  });

  it('por baixo tem de estar no mesmo sítio, não noutro canto da página', async () => {
    expect(await alertas(`/GS0 gs 0.8 0 0 0 k 200 200 50 50 re f /GS1 gs 0 0 0 0 k 20 20 50 50 re f`)).toEqual([]);
  });

  it('cinzento 100% (branco) não é CMYK: sem efeito', async () => {
    expect(await alertas(`${FUNDO} /GS1 gs 1 g 20 20 50 50 re f`)).toEqual([]);
  });

  it('só o preenchimento tem overprint: o traço branco sem overprint não conta', async () => {
    const estados = { GS3: { op: true, OPM: 1 } };
    expect(await alertas(`${FUNDO} /GS3 gs 0 0 0 0 K 2 w 20 20 m 90 20 l S`, { estados })).toEqual([]);
  });

  it('branco em layer desligada, ou recortado', async () => {
    const camadas = { MC0: { nome: 'Rascunho', oculta: true } };
    expect(await alertas(`${FUNDO} /GS1 gs /OC /MC0 BDC 0 0 0 0 k 20 20 50 50 re f EMC`, { camadas })).toEqual([]);
    expect(await alertas(`${FUNDO} /GS1 gs 200 200 10 10 re W n 0 0 0 0 k 20 20 50 50 re f`)).toEqual([]);
  });

  it('conta objetos e páginas', async () => {
    const pag = { ...BASE, estados: ESTADOS, conteudo: `${FUNDO} /GS1 gs 0 0 0 0 k 20 20 20 20 re f 60 60 20 20 re f` };
    const a = alertasOverprint(await analisarRaw(pag, { ...BASE, conteudo: '' }, pag), CFG_BASE);
    expect(a[0].detalhe).toContain('Preenchimentos brancos: 4 (págs. 1, 3)');
  });
});

describe('overprint — preto sem overprint sobre cor', () => {
  it('texto K 100% sobre cor, sem overprint: aviso', async () => {
    const [a] = await alertas(`${FUNDO} 0 0 0 1 k ${texto()}`);
    expect(a.id).toBe('overprint-preto-desligado');
    expect(a.gravidade).toBe('aviso');
    expect(a.titulo).toBe('Preto sem overprint sobre cor');
    expect(a.detalhe).toContain('Texto: 1 (pág. 1)');
    expect(a.locais).toHaveLength(1);
  });

  it('com overprint em modo 1: certo', async () => {
    expect(await alertas(`${FUNDO} /GS1 gs 0 0 0 1 k ${texto()}`)).toEqual([]);
  });

  it('com overprint ligado mas em modo 0: continua a apagar, e diz-se', async () => {
    const [a] = await alertas(`${FUNDO} /GS2 gs 0 0 0 1 k ${texto()}`);
    expect(a.id).toBe('overprint-preto-desligado');
    expect(a.detalhe).toContain('1 tem o overprint ligado em modo 0');
    expect(a.detalhe).toContain('Falta o modo 1');
  });

  it('sem overprint e sem ser o modo 0, a linha do modo 0 não aparece', async () => {
    const [a] = await alertas(`${FUNDO} 0 0 0 1 k ${texto()}`);
    expect(a.detalhe).not.toContain('modo 0');
  });

  it('o preto como cinzento 0 também conta', async () => {
    expect(ids(await alertas(`${FUNDO} 0 g ${texto()}`))).toEqual(['overprint-preto-desligado']);
  });

  it('linha fina K 100% sobre cor, sem overprint', async () => {
    const [a] = await alertas(`${FUNDO} 0 0 0 1 K 0.5 w 10 100 m 200 100 l S`);
    expect(a.detalhe).toContain('Linhas até 1 pt: 1 (pág. 1)');
  });

  it('linha grossa (3 pt) não conta: é uma forma', async () => {
    expect(await alertas(`${FUNDO} 0 0 0 1 K 3 w 10 100 m 200 100 l S`)).toEqual([]);
  });

  it('limite de espessura configurável, e 1 pt exato ainda conta', async () => {
    expect(ids(await alertas(`${FUNDO} 0 0 0 1 K 1 w 10 100 m 200 100 l S`))).toEqual(['overprint-preto-desligado']);
    expect(await alertas(`${FUNDO} 0 0 0 1 K 2 w 10 100 m 200 100 l S`, {}, { overprintLinhaMaxPt: 1 })).toEqual([]);
    expect(ids(await alertas(`${FUNDO} 0 0 0 1 K 2 w 10 100 m 200 100 l S`, {}, { overprintLinhaMaxPt: 2 }))).toEqual(['overprint-preto-desligado']);
  });

  it('por baixo uma spot, ou uma imagem a cores', async () => {
    expect(ids(await alertas(`/CS1 cs 1 scn 0 0 300 300 re f 0 0 0 1 k ${texto()}`))).toEqual(['overprint-preto-desligado']);
    const imagens = { Im0: { larguraPx: 10, alturaPx: 10, espaco: 'CMYK' as const } };
    expect(ids(await alertas(`q 300 0 0 300 0 0 cm /Im0 Do Q 0 0 0 1 k ${texto()}`, { imagens }))).toEqual(['overprint-preto-desligado']);
  });

  it('o overprint acompanha só o preenchimento do texto (op), não o traço (OP)', async () => {
    const estados = { GS4: { op: true, OPM: 1 } };
    expect(await alertas(`${FUNDO} /GS4 gs 0 0 0 1 k ${texto()}`, { estados })).toEqual([]);
  });
});

describe('overprint — preto: o que NÃO deve apanhar', () => {
  it('texto preto sobre o papel, sem nada por baixo', async () => {
    expect(await alertas(`0 0 0 1 k ${texto()}`)).toEqual([]);
  });

  it('texto preto sobre branco ou sobre outro preto', async () => {
    expect(await alertas(`0 0 0 0 k 0 0 300 300 re f 0 0 0 1 k ${texto()}`)).toEqual([]);
    expect(await alertas(`0 0 0 1 k 0 0 300 300 re f 0 0 0 1 k ${texto()}`)).toEqual([]);
  });

  it('texto preto sobre uma imagem a preto e branco (só K)', async () => {
    const imagens = { Im0: { larguraPx: 10, alturaPx: 10, espaco: 'Gray' as const } };
    expect(await alertas(`q 300 0 0 300 0 0 cm /Im0 Do Q 0 0 0 1 k ${texto()}`, { imagens })).toEqual([]);
  });

  it('texto preto sobre um fundo cinzento ou sobre um K a 50%: não há cor para apagar', async () => {
    expect(await alertas(`0.5 g 0 0 300 300 re f 0 0 0 1 k ${texto()}`)).toEqual([]);
    expect(await alertas(`0 0 0 0.5 k 0 0 300 300 re f 0 0 0 1 k ${texto()}`)).toEqual([]);
  });

  it('...mas sobre um cinzento com um pouco de cor já conta', async () => {
    expect(ids(await alertas(`0.1 0 0 0.5 k 0 0 300 300 re f 0 0 0 1 k ${texto()}`))).toEqual(['overprint-preto-desligado']);
  });

  it('o fundo tem de estar por baixo e no mesmo sítio', async () => {
    expect(await alertas(`0 0 0 1 k ${texto()} ${FUNDO}`)).toEqual([]); // o fundo vem depois
    expect(await alertas(`0.8 0 0 0 k 200 200 50 50 re f 0 0 0 1 k ${texto()}`)).toEqual([]); // noutro canto
  });

  it('só o K puro: um preto rico ou um K a 90% não são o caso', async () => {
    expect(await alertas(`${FUNDO} 0.6 0.4 0.4 1 k ${texto()}`)).toEqual([]);
    expect(await alertas(`${FUNDO} 0 0 0 0.9 k ${texto()}`)).toEqual([]);
  });

  it('um preenchimento preto grande (não é texto nem linha) não conta', async () => {
    expect(await alertas(`${FUNDO} 0 0 0 1 k 20 20 100 100 re f`)).toEqual([]);
  });

  it('texto invisível e layers desligadas', async () => {
    expect(await alertas(`${FUNDO} 0 0 0 1 k 3 Tr ${texto()}`)).toEqual([]);
    const camadas = { MC0: { nome: 'Rascunho', oculta: true } };
    expect(await alertas(`${FUNDO} /OC /MC0 BDC 0 0 0 1 k ${texto()} EMC`, { camadas })).toEqual([]);
  });
});

describe('overprint — spots técnicas sem overprint', () => {
  it('a faca (cortante) sem overprint: erro', async () => {
    const [a] = await alertas(`${FUNDO} /CS0 CS 1 SCN 1 w 10 10 m 200 10 l S`);
    expect(a.id).toBe('overprint-spots-tecnicas');
    expect(a.gravidade).toBe('erro');
    expect(a.titulo).toBe('Spots técnicas sem overprint');
    expect(a.detalhe).toContain('cortante: 1 objeto (pág. 1)');
  });

  it('com overprint: certo (como no cortante real da M2)', async () => {
    expect(await alertas(`${FUNDO} /GS1 gs /CS0 CS 1 SCN 1 w 10 10 m 200 10 l S`)).toEqual([]);
  });

  it('nas spots o modo de overprint não conta: o modo 0 também serve', async () => {
    expect(await alertas(`${FUNDO} /GS2 gs /CS0 CS 1 SCN 1 w 10 10 m 200 10 l S`)).toEqual([]);
  });

  it('verniz em preenchimento', async () => {
    const [a] = await alertas(`${FUNDO} /CS2 cs 1 scn 20 20 50 50 re f`);
    expect(a.detalhe).toContain('Verniz: 1 objeto');
  });

  it('agrupa por nome, com contagem', async () => {
    const c = `${FUNDO} /CS0 CS 1 SCN 1 w 10 10 m 200 10 l S 10 20 m 200 20 l S /CS2 cs 1 scn 20 20 50 50 re f`;
    const [a] = await alertas(c);
    expect(a.detalhe).toContain('cortante: 2 objetos');
    expect(a.detalhe).toContain('Verniz: 1 objeto');
  });

  it('só as técnicas: uma Pantone e o registo (All) não contam', async () => {
    expect(await alertas(`${FUNDO} /CS1 cs 1 scn 20 20 50 50 re f /CS3 CS 1 SCN 1 w 10 10 m 200 10 l S`)).toEqual([]);
  });

  it('tinta a 0% não imprime', async () => {
    expect(await alertas(`${FUNDO} /CS0 CS 0 SCN 1 w 10 10 m 200 10 l S`)).toEqual([]);
  });

  it('a lista de técnicas é configurável', async () => {
    const c = `${FUNDO} /CS1 cs 1 scn 20 20 50 50 re f`;
    expect(await alertas(c)).toEqual([]);
    expect(ids(await alertas(c, {}, { spotsTecnicas: ['PANTONE 485 C'] }))).toEqual(['overprint-spots-tecnicas']);
  });

  it('layer desligada por omissão', async () => {
    const camadas = { MC0: { nome: 'Faca', oculta: true } };
    expect(await alertas(`${FUNDO} /OC /MC0 BDC /CS0 CS 1 SCN 1 w 10 10 m 200 10 l S EMC`, { camadas })).toEqual([]);
  });

  it('os três tipos juntos, por ordem de gravidade no registo e sem se atropelarem', async () => {
    const c = `${FUNDO} /CS0 CS 1 SCN 1 w 10 10 m 200 10 l S /GS1 gs 0 0 0 0 k 100 100 50 50 re f /GS0 gs 0 0 0 1 k ${texto()}`;
    expect(ids(await alertas(c)).sort()).toEqual(['overprint-branco', 'overprint-preto-desligado', 'overprint-spots-tecnicas']);
  });
});
