import { describe, expect, it } from 'vitest';
import { alertasSpotsDuplicadas } from '../../src/alertas/spots-duplicadas';
import { analisarRaw, BASE } from '../fixtures/analisar';
import type { EspacoSpec, PaginaRaw } from '../fixtures/gerar';

const sep = (nome: string): EspacoSpec => ({ tipo: 'separation', nome });
/** Pinta um quadrado com cada spot declarada, em sítios diferentes: CS0 em x=10, CS1 em x=60... */
const usar = (...cs: string[]) => cs.map((c, i) => `/${c} cs 1 scn ${10 + i * 50} 10 20 20 re f`).join(' ');

async function alertas(espacos: Record<string, EspacoSpec>, conteudo: string, extra: Partial<PaginaRaw> = {}) {
  return alertasSpotsDuplicadas(await analisarRaw({ ...BASE, mediaMm: [300, 100], espacos, conteudo, ...extra }));
}

describe('spots duplicadas — o que deve apanhar', () => {
  it('PANTONE 485 C e PANTONE 485 CV: o exemplo do briefing', async () => {
    const [a] = await alertas({ CS0: sep('PANTONE 485 C'), CS1: sep('PANTONE 485 CV') }, usar('CS0', 'CS1'));
    expect(a.id).toBe('spots-duplicadas');
    expect(a.gravidade).toBe('aviso');
    expect(a.titulo).toBe('Spot duplicada com nomes diferentes');
    expect(a.detalhe).toContain('PANTONE 485 C (1 objeto) · PANTONE 485 CV (1 objeto): pág. 1');
  });

  it('só maiúsculas e espaços', async () => {
    const [a] = await alertas({ CS0: sep('PANTONE 485 C'), CS1: sep('Pantone  485 c') }, usar('CS0', 'CS1'));
    expect(a.id).toBe('spots-duplicadas');
  });

  it('spots que não são Pantone', async () => {
    const [a] = await alertas({ CS0: sep('Verniz'), CS1: sep('VERNIZ') }, usar('CS0', 'CS1'));
    expect(a.detalhe).toContain('Verniz');
  });

  it('o nome mais usado é o primeiro e os outros ficam apontados', async () => {
    const espacos = { CS0: sep('PANTONE 485 C'), CS1: sep('PANTONE 485 CV') };
    // o nome menos usado aparece primeiro no ficheiro: a ordem final tem de vir da contagem
    const c = '/CS1 cs 1 scn 200 10 5 5 re f /CS0 cs 1 scn 10 10 5 5 re f 20 10 5 5 re f 30 10 5 5 re f';
    const [a] = await alertas(espacos, c);
    expect(a.detalhe).toContain('PANTONE 485 C (3 objetos) · PANTONE 485 CV (1 objeto)');
    // o destaque vai para o objeto do nome menos usado, o que está lá ao longe
    expect(a.locais).toHaveLength(1);
    expect(a.locais![0].caixa.x0).toBeCloseTo(200, 3);
  });

  it('três variações do mesmo nome contam como um só grupo', async () => {
    const espacos = { CS0: sep('PANTONE 485 C'), CS1: sep('PANTONE 485 CV'), CS2: sep('pantone 485 cvc') };
    const [a] = await alertas(espacos, usar('CS0', 'CS1', 'CS2'));
    expect(a.titulo).toBe('Spot duplicada com nomes diferentes');
    // os três nomes, tal como estão no ficheiro, numa só linha
    expect(a.detalhe).toContain('PANTONE 485 C (1 objeto)');
    expect(a.detalhe).toContain('PANTONE 485 CV (1 objeto)');
    expect(a.detalhe).toContain('pantone 485 cvc (1 objeto)');
    expect(a.detalhe!.split('\n')).toHaveLength(2);
  });

  it('dois grupos diferentes de duplicadas: plural e duas linhas', async () => {
    const espacos = { CS0: sep('PANTONE 485 C'), CS1: sep('PANTONE 485 CV'), CS2: sep('Verniz'), CS3: sep('VERNIZ') };
    const [a] = await alertas(espacos, usar('CS0', 'CS1', 'CS2', 'CS3'));
    expect(a.titulo).toBe('2 spots duplicadas com nomes diferentes');
    expect(a.detalhe!.split('\n')).toHaveLength(3);
  });

  it('spot usada num traço e noutra num preenchimento', async () => {
    const espacos = { CS0: sep('PANTONE 485 C'), CS1: sep('PANTONE 485 CV') };
    const [a] = await alertas(espacos, '/CS0 cs 1 scn 10 10 20 20 re f /CS1 CS 1 SCN 2 w 100 10 m 150 10 l S');
    expect(a.id).toBe('spots-duplicadas');
  });

  it('uma delas dentro de uma DeviceN com tintas de processo', async () => {
    const espacos = { CS0: sep('PANTONE 485 CV'), CS1: { tipo: 'devicen' as const, nomes: ['Cyan', 'PANTONE 485 C'] } };
    const [a] = await alertas(espacos, '/CS0 cs 1 scn 10 10 20 20 re f /CS1 cs 0 1 scn 60 10 20 20 re f');
    expect(a.detalhe).toContain('PANTONE 485 C');
    expect(a.detalhe).not.toContain('Cyan');
  });

  it('uma delas só numa imagem', async () => {
    const espacos = { CS0: sep('PANTONE 485 C') };
    const imagens = { Im0: { larguraPx: 10, alturaPx: 10, espaco: { separation: 'PANTONE 485 CV' } } };
    const [a] = await alertas(espacos, '/CS0 cs 1 scn 10 10 20 20 re f q 40 0 0 40 100 10 cm /Im0 Do Q', { imagens });
    expect(a.id).toBe('spots-duplicadas');
  });

  it('páginas diferentes: o detalhe junta as páginas', async () => {
    const espacos = { CS0: sep('PANTONE 485 C') };
    const p1 = { ...BASE, mediaMm: [300, 100] as [number, number], espacos, conteudo: usar('CS0') };
    const p2 = { ...p1, espacos: { CS0: sep('PANTONE 485 CV') } };
    const a = alertasSpotsDuplicadas(await analisarRaw(p1, p2));
    expect(a[0].detalhe).toContain('págs. 1, 2');
  });
});

describe('spots duplicadas — o que NÃO deve apanhar (falsos positivos)', () => {
  it('uma só spot, usada várias vezes', async () => {
    expect(await alertas({ CS0: sep('PANTONE 485 C') }, usar('CS0', 'CS0', 'CS0'))).toEqual([]);
  });

  it('revestido e não revestido da mesma cor são diferentes', async () => {
    expect(await alertas({ CS0: sep('PANTONE 485 C'), CS1: sep('PANTONE 485 U') }, usar('CS0', 'CS1'))).toEqual([]);
  });

  it('Pantones diferentes', async () => {
    expect(await alertas({ CS0: sep('PANTONE 485 C'), CS1: sep('PANTONE 486 C') }, usar('CS0', 'CS1'))).toEqual([]);
  });

  it('nomes parecidos mas diferentes: "Verniz" e "Verniz 2"', async () => {
    expect(await alertas({ CS0: sep('Verniz'), CS1: sep('Verniz 2') }, usar('CS0', 'CS1'))).toEqual([]);
  });

  it('faca e vincos', async () => {
    expect(await alertas({ CS0: sep('cortante'), CS1: sep('vincos') }, usar('CS0', 'CS1'))).toEqual([]);
  });

  it('duplicada declarada mas nunca usada não conta', async () => {
    expect(await alertas({ CS0: sep('PANTONE 485 C'), CS1: sep('PANTONE 485 CV') }, usar('CS0'))).toEqual([]);
  });

  it('duplicada só usada numa layer desligada por omissão', async () => {
    const camadas = { MC0: { nome: 'Rascunho', oculta: true } };
    const espacos = { CS0: sep('PANTONE 485 C'), CS1: sep('PANTONE 485 CV') };
    const c = `/CS0 cs 1 scn 10 10 20 20 re f /OC /MC0 BDC /CS1 cs 1 scn 60 10 20 20 re f EMC`;
    expect(await alertas(espacos, c, { camadas })).toEqual([]);
  });

  it('objeto recortado não conta', async () => {
    const espacos = { CS0: sep('PANTONE 485 C'), CS1: sep('PANTONE 485 CV') };
    expect(await alertas(espacos, '/CS0 cs 1 scn 10 10 20 20 re f 0 0 5 5 re W n /CS1 cs 1 scn 100 10 20 20 re f')).toEqual([]);
  });

  it('tintas de processo e registo (All) não são spots', async () => {
    const espacos = { CS0: { tipo: 'devicen' as const, nomes: ['Cyan', 'Magenta'] }, CS1: sep('All'), CS2: sep('PANTONE 485 C') };
    expect(await alertas(espacos, '/CS0 cs 1 1 scn 10 10 20 20 re f /CS1 cs 1 scn 60 10 20 20 re f /CS2 cs 1 scn 110 10 20 20 re f')).toEqual([]);
  });

  it('tintas de processo e de sistema com maiúsculas diferentes não são duplicadas', async () => {
    const espacos = {
      CS0: sep('Black'),
      CS1: { tipo: 'devicen' as const, nomes: ['BLACK', 'Cyan'] },
      CS2: sep('All'),
      CS3: sep('ALL'),
      CS4: { tipo: 'devicen' as const, nomes: ['cyan'] },
    };
    const c = '/CS0 cs 1 scn 10 10 5 5 re f /CS1 cs 1 1 scn 30 10 5 5 re f /CS2 cs 1 scn 50 10 5 5 re f /CS3 cs 1 scn 70 10 5 5 re f /CS4 cs 1 scn 90 10 5 5 re f';
    expect(await alertas(espacos, c)).toEqual([]);
  });

  it('sem spots nenhumas', async () => {
    expect(await alertas({}, '0 1 1 0 k 10 10 20 20 re f')).toEqual([]);
  });
});
