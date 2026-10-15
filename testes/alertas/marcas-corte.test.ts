import { describe, expect, it } from 'vitest';
import { alertasMarcasCorte } from '../../src/alertas/marcas-corte';
import type { ConfigAlertas } from '../../src/alertas/tipos';
import { analisarRaw, CFG_BASE } from '../fixtures/analisar';
import { mm, type PaginaRaw } from '../fixtures/gerar';

/** Página de 130 mm com o corte a 100 mm (de 15 a 115 mm) e BleedBox a 3 mm do corte */
const PAGINA: Omit<PaginaRaw, 'conteudo'> = { mediaMm: [130, 130], trimMm: [15, 15, 100, 100], bleedMm: [12, 12, 106, 106] };
const ESPACOS = { CS0: { tipo: 'separation' as const, nome: 'All' } };
const REGISTO = '/CS0 CS 1 SCN';

type Slot = `${'esq' | 'dir'}-${'cima' | 'baixo'}-${'h' | 'v'}`;
interface Opcoes {
  /** Distância da ponta da marca ao corte, em mm */
  gap?: number;
  comp?: number;
  /** Desvio da marca em relação à linha do corte, em mm */
  desal?: number;
  /** Só estas marcas (por omissão, as oito) */
  so?: Slot[];
  cor?: string;
  espessura?: number;
  /** Uma marca por caminho, em vez de todas no mesmo */
  separadas?: boolean;
}

/** Content stream com as marcas de corte pedidas */
function marcas(o: Opcoes = {}): string {
  const { gap = 5, comp = 5, desal = 0, cor = REGISTO, espessura = 0.25, separadas = false } = o;
  const cantos = [
    { h: 'esq', v: 'baixo', x: 15, y: 15 },
    { h: 'dir', v: 'baixo', x: 115, y: 15 },
    { h: 'esq', v: 'cima', x: 15, y: 115 },
    { h: 'dir', v: 'cima', x: 115, y: 115 },
  ] as const;
  const linhas: string[] = [];
  for (const c of cantos) {
    const sx = c.h === 'esq' ? -1 : 1;
    const sy = c.v === 'baixo' ? -1 : 1;
    const slotH = `${c.h}-${c.v}-h` as Slot;
    const slotV = `${c.h}-${c.v}-v` as Slot;
    if (!o.so || o.so.includes(slotH)) linhas.push(`${mm(c.x + sx * gap)} ${mm(c.y + desal)} m ${mm(c.x + sx * (gap + comp))} ${mm(c.y + desal)} l`);
    if (!o.so || o.so.includes(slotV)) linhas.push(`${mm(c.x + desal)} ${mm(c.y + sy * gap)} m ${mm(c.x + desal)} ${mm(c.y + sy * (gap + comp))} l`);
  }
  const cab = `${cor} ${espessura} w`;
  return separadas ? `${cab} ${linhas.map((l) => `${l} S`).join(' ')}` : `${cab} ${linhas.join(' ')} S`;
}

async function alertas(conteudo: string, extra: Partial<PaginaRaw> = {}, cfg: Partial<ConfigAlertas> = {}) {
  const a = await analisarRaw({ ...PAGINA, espacos: ESPACOS, conteudo, ...extra });
  return alertasMarcasCorte(a, { ...CFG_BASE, ...cfg });
}
const ids = (as: { id: string }[]) => as.map((a) => a.id);
const FUNDO = `0 0 0 1 k ${mm(12)} ${mm(12)} ${mm(106)} ${mm(106)} re f`;

describe('marcas de corte — bem feitas', () => {
  it('as oito marcas em cor de registo, num só caminho', async () => {
    expect(await alertas(FUNDO + marcas())).toEqual([]);
  });

  it('...ou uma por caminho', async () => {
    expect(await alertas(marcas({ separadas: true }))).toEqual([]);
  });

  it('marcas de comprimentos e afastamentos diferentes', async () => {
    expect(await alertas(marcas({ gap: 4, comp: 8 }))).toEqual([]);
    expect(await alertas(marcas({ gap: 3, comp: 3 }))).toEqual([]); // exatamente à sangria
  });

  it('o ficheiro não tem de ser só marcas: o resto do conteúdo não atrapalha', async () => {
    const c = `${FUNDO} 0 1 1 0 k ${mm(30)} ${mm(30)} ${mm(40)} ${mm(40)} re f 0 0 0 1 K 1 w ${mm(20)} ${mm(60)} m ${mm(90)} ${mm(60)} l S ${marcas()}`;
    expect(await alertas(c)).toEqual([]);
  });
});

describe('marcas de corte — em falta', () => {
  it('sem nenhuma marca, com espaço para elas: aviso', async () => {
    const [a] = await alertas(FUNDO);
    expect(a.id).toBe('marcas-corte-ausentes');
    expect(a.gravidade).toBe('aviso');
    expect(a.titulo).toBe('Sem marcas de corte');
    expect(a.detalhe).toContain('pág. 1');
  });

  it('sem espaço na página para as marcas: só informação', async () => {
    const pagina = { mediaMm: [106, 106] as [number, number], trimMm: [3, 3, 100, 100] as [number, number, number, number], bleedMm: [0, 0, 106, 106] as [number, number, number, number] };
    const r = await alertas(FUNDO, pagina);
    expect(ids(r)).toEqual(['marcas-corte-sem-espaco']);
    expect(r[0].gravidade).toBe('info');
  });

  it('um canto sem marcas: incompletas, com o nome do canto', async () => {
    const todos: Slot[] = ['esq-baixo-h', 'esq-baixo-v', 'dir-baixo-h', 'dir-baixo-v', 'esq-cima-h', 'esq-cima-v'];
    const r = await alertas(marcas({ so: todos }));
    expect(ids(r)).toEqual(['marcas-corte-incompletas']);
    expect(r[0].detalhe).toContain('canto superior direito (horizontal), canto superior direito (vertical)');
    expect(r[0].locais).toHaveLength(1);
  });

  it('só falta uma das duas marcas de um canto', async () => {
    const todos = (['esq', 'dir'] as const).flatMap((h) => (['cima', 'baixo'] as const).flatMap((v) => [`${h}-${v}-h`, `${h}-${v}-v`] as Slot[]));
    const r = await alertas(marcas({ so: todos.filter((s) => s !== 'esq-baixo-v') }));
    expect(r[0].detalhe).toContain('Faltam: canto inferior esquerdo (vertical)');
    expect(r[0].detalhe).not.toContain('(horizontal)');
  });

  it('só as marcas horizontais: faltam as quatro verticais', async () => {
    const r = await alertas(marcas({ so: ['esq-baixo-h', 'dir-baixo-h', 'esq-cima-h', 'dir-cima-h'] }));
    expect(r[0].detalhe!.match(/\(vertical\)/g)).toHaveLength(4);
    expect(r[0].locais).toHaveLength(4);
  });
});

describe('marcas de corte — mal colocadas', () => {
  it('dentro da sangria: diz a que distância está e qual é a sangria', async () => {
    const r = await alertas(marcas({ gap: 1.5 }));
    expect(ids(r)).toEqual(['marcas-corte-mal-colocadas']);
    expect(r[0].detalhe).toContain('a 1,5 mm do corte, dentro da sangria (3,0 mm)');
    expect(r[0].locais!.length).toBeGreaterThanOrEqual(4);
  });

  it('a entrar no corte', async () => {
    const r = await alertas(marcas({ gap: -2, comp: 6 }));
    expect(r[0].detalhe).toContain('entra 2,0 mm no corte');
  });

  it('em preto em vez de registo', async () => {
    const r = await alertas(marcas({ cor: '0 0 0 1 K' }));
    expect(ids(r)).toEqual(['marcas-corte-mal-colocadas']);
    expect(r[0].detalhe).toContain('em CMYK 0/0/0/100, devia ser cor de registo');
  });

  it('desalinhada da linha de corte', async () => {
    const r = await alertas(marcas({ desal: 1 }));
    expect(r[0].detalhe).toContain('desalinhada 1,0 mm do corte');
  });

  it('um desvio de 0,3 mm ainda conta como alinhada', async () => {
    expect(await alertas(marcas({ desal: 0.3 }))).toEqual([]);
  });

  it('vários defeitos na mesma marca ficam todos na mesma linha', async () => {
    const r = await alertas(marcas({ gap: 1, desal: 1, cor: '0 0 0 1 K', so: ['esq-cima-h'] }));
    const linha = r.find((x) => x.id === 'marcas-corte-mal-colocadas')!.detalhe!;
    expect(linha).toMatch(/desalinhada.*; a 1,0 mm.*; em CMYK/);
  });

  it('sem BleedBox, a sangria de referência é a das definições', async () => {
    const sem = { bleedMm: undefined };
    expect(await alertas(marcas({ gap: 3 }), sem)).toEqual([]);
    expect(ids(await alertas(marcas({ gap: 2 }), sem))).toEqual(['marcas-corte-mal-colocadas']);
    expect(await alertas(marcas({ gap: 2 }), sem, { sangriaReferenciaMm: 1.5 })).toEqual([]);
  });

  it('com uma BleedBox maior que a referência, vale a BleedBox', async () => {
    const maior = { bleedMm: [10, 10, 110, 110] as [number, number, number, number] }; // 5 mm
    const r = await alertas(marcas({ gap: 4 }), maior);
    expect(r[0].detalhe).toContain('dentro da sangria (5,0 mm)');
  });

  it('uma marca boa ao lado de uma má: só a má aparece', async () => {
    const c = marcas({ so: ['esq-baixo-h', 'esq-baixo-v', 'dir-baixo-h', 'dir-baixo-v', 'esq-cima-h', 'esq-cima-v', 'dir-cima-v'] }) +
      ` ${REGISTO} ${mm(115 + 1)} ${mm(115)} m ${mm(115 + 6)} ${mm(115)} l S`; // dir-cima-h a 1 mm
    const r = await alertas(c);
    const mal = r.find((x) => x.id === 'marcas-corte-mal-colocadas')!;
    expect(mal.detalhe).toContain('Canto superior direito, marca horizontal');
    expect(mal.detalhe!.split('\n')).toHaveLength(2); // frase de ajuda e uma só marca má
  });
});

describe('marcas de corte — duas marcas no mesmo sítio', () => {
  it('uma em preto por baixo e outra em registo por cima: conta a boa', async () => {
    // a má vem primeiro no ficheiro; a boa tem de ganhar
    expect(await alertas(marcas({ cor: '0 0 0 1 K' }) + ' ' + marcas())).toEqual([]);
  });

  it('...e em qualquer ordem', async () => {
    expect(await alertas(marcas() + ' ' + marcas({ cor: '0 0 0 1 K' }))).toEqual([]);
  });

  it('com as duas más, aponta a menos má: a mais afastada do corte', async () => {
    const um = marcas({ gap: 1, so: ['esq-cima-h'] });
    const dois = marcas({ gap: 2, so: ['esq-cima-h'] });
    const r = await alertas(`${um} ${dois}`);
    const mal = r.find((x) => x.id === 'marcas-corte-mal-colocadas')!;
    expect(mal.detalhe).toContain('a 2,0 mm do corte');
    expect(mal.detalhe).not.toContain('a 1,0 mm do corte');
  });
});

describe('marcas de corte — o que não é uma marca', () => {
  it('linhas grossas não contam', async () => {
    expect(ids(await alertas(marcas({ espessura: 3 })))).toEqual(['marcas-corte-ausentes']);
  });

  it('linhas compridas demais não contam', async () => {
    expect(ids(await alertas(marcas({ comp: 50 })))).toEqual(['marcas-corte-ausentes']);
  });

  it('linhas curtíssimas não contam', async () => {
    expect(ids(await alertas(marcas({ comp: 0.5 })))).toEqual(['marcas-corte-ausentes']);
  });

  it('linhas na diagonal não contam', async () => {
    const c = `${REGISTO} 0.25 w ${mm(5)} ${mm(5)} m ${mm(10)} ${mm(10)} l ${mm(120)} ${mm(5)} m ${mm(125)} ${mm(10)} l S`;
    expect(ids(await alertas(c))).toEqual(['marcas-corte-ausentes']);
  });

  it('uma marca a 0% de tinta não se imprime, por isso não conta', async () => {
    expect(ids(await alertas(marcas({ cor: '/CS0 CS 0 SCN' })))).toEqual(['marcas-corte-ausentes']);
  });

  it('marcas numa layer desligada por omissão não contam', async () => {
    const camadas = { MC0: { nome: 'Marcas', oculta: true } };
    expect(ids(await alertas(`/OC /MC0 BDC ${marcas()} EMC`, { camadas }))).toEqual(['marcas-corte-ausentes']);
  });

  it('linhas soltas pela página, longe dos cantos, não são marcas', async () => {
    const c = `${REGISTO} 0.25 w ${mm(60)} ${mm(60)} m ${mm(66)} ${mm(60)} l ${mm(60)} ${mm(20)} m ${mm(60)} ${mm(26)} l S`;
    expect(ids(await alertas(c))).toEqual(['marcas-corte-ausentes']);
  });

  it('um traço de retângulo (moldura) não é uma marca', async () => {
    expect(ids(await alertas(`${REGISTO} 0.25 w ${mm(1)} ${mm(1)} ${mm(128)} ${mm(128)} re S`))).toEqual(['marcas-corte-ausentes']);
  });

  it('as marcas dentro do corte, do lado de dentro, não contam', async () => {
    // marca horizontal no canto inferior esquerdo, mas dentro da área do corte
    const c = `${REGISTO} 0.25 w ${mm(20)} ${mm(15)} m ${mm(26)} ${mm(15)} l S`;
    expect(ids(await alertas(c))).toEqual(['marcas-corte-ausentes']);
  });
});

describe('marcas de corte — várias páginas e definições', () => {
  it('agrupa as páginas e aponta as que falham', async () => {
    const bem = { ...PAGINA, espacos: ESPACOS, conteudo: marcas() };
    const mal = { ...PAGINA, espacos: ESPACOS, conteudo: FUNDO };
    const r = alertasMarcasCorte(await analisarRaw(bem, mal, bem, mal), CFG_BASE);
    expect(r[0].detalhe).toContain('págs. 2, 4');
    expect(r[0].locais!.map((l) => l.pagina)).toEqual([1, 3]);
  });

  it('páginas com o mesmo defeito partilham a linha', async () => {
    const pag = { ...PAGINA, espacos: ESPACOS, conteudo: marcas({ gap: 1.5, so: ['esq-baixo-h'] }) };
    const r = alertasMarcasCorte(await analisarRaw(pag, pag), CFG_BASE);
    const mal = r.find((x) => x.id === 'marcas-corte-mal-colocadas')!;
    expect(mal.detalhe).toContain('págs. 1, 2');
  });

  it('com a página rodada, os cantos e os eixos dizem-se como se veem', async () => {
    // Falta a marca horizontal do canto (esq, cima) do espaço de utilizador. Com /Rotate 90,
    // esq passa a "em cima", cima passa a "direita" e a marca horizontal vê-se na vertical.
    const todos = (['esq', 'dir'] as const).flatMap((h) => (['cima', 'baixo'] as const).flatMap((v) => [`${h}-${v}-h`, `${h}-${v}-v`] as Slot[]));
    const r = await alertas(marcas({ so: todos.filter((s) => s !== 'esq-cima-h') }), { rotacao: 90 });
    expect(r[0].detalhe).toContain('Faltam: canto superior direito (vertical)');
  });

  it('desligada nas definições, não verifica nada', async () => {
    expect(await alertas(FUNDO, {}, { verificarMarcasCorte: false })).toEqual([]);
    expect(await alertas(marcas({ gap: 1 }), {}, { verificarMarcasCorte: false })).toEqual([]);
  });

  it('o local de uma marca falhada é o canto onde devia estar', async () => {
    const todos: Slot[] = ['esq-baixo-h', 'esq-baixo-v', 'dir-baixo-h', 'dir-baixo-v', 'esq-cima-h', 'esq-cima-v'];
    const [a] = await alertas(marcas({ so: todos }));
    const c = a.locais![0].caixa;
    // canto superior direito do corte: (115, 115) mm
    expect(c.x0).toBeLessThan(mm(115));
    expect(c.x1).toBeGreaterThan(mm(115));
    expect(c.y1).toBeGreaterThan(mm(115));
  });
});
