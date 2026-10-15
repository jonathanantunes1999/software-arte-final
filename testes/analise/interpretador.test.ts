import { describe, expect, it } from 'vitest';
import { analisarRaw, BASE } from '../fixtures/analisar';
import { mm } from '../fixtures/gerar';

const ev = async (conteudo: string | string[], extra: object = {}) => (await analisarRaw({ ...BASE, conteudo, ...extra })).paginas[0].ir.eventos;

describe('interpretador — geometria', () => {
  it('um retângulo preenchido: bbox e cor', async () => {
    const [e] = await ev('10 20 30 40 re 0 0 0 1 k f');
    expect(e.tipo).toBe('forma');
    expect(e.preenche).toBe(true);
    expect(e.traca).toBe(false);
    expect(e.bbox).toEqual({ x0: 10, y0: 20, x1: 40, y1: 60 });
    expect(e.cor).toMatchObject({ familia: 'CMYK', valores: [0, 0, 0, 1] });
  });

  it('cm aplica translação e escala ao caminho', async () => {
    const [e] = await ev('2 0 0 3 100 50 cm 0 0 10 10 re f');
    expect(e.bbox).toEqual({ x0: 100, y0: 50, x1: 120, y1: 80 });
  });

  it('q/Q restauram a matriz e a cor', async () => {
    const es = await ev('q 1 0 0 1 100 0 cm 1 0 0 rg 0 0 5 5 re f Q 0 0 5 5 re f');
    expect(es[0].bbox.x0).toBe(100);
    expect(es[0].cor?.familia).toBe('RGB');
    expect(es[1].bbox.x0).toBe(0);
    expect(es[1].cor?.familia).toBe('Gray'); // o valor por omissão
  });

  it('curva de Bézier: usa os extremos reais, não só os pontos de controlo', async () => {
    // Sobe a 100 nos pontos de controlo mas a curva só chega a 75
    const [e] = await ev('0 0 m 0 100 100 100 100 0 c f');
    expect(e.bbox.x0).toBeCloseTo(0, 6);
    expect(e.bbox.x1).toBeCloseTo(100, 6);
    expect(e.bbox.y1).toBeCloseTo(75, 6);
  });

  it('operador v: o primeiro ponto de controlo é o ponto atual', async () => {
    // y(t) = 3(1-t)t²·100, máximo em t=2/3: 4/9·100
    const [e] = await ev('0 0 m 50 100 100 0 v f');
    expect(e.bbox.y1).toBeCloseTo((4 / 9) * 100, 6);
    expect(e.bbox.x1).toBeCloseTo(100, 6);
  });

  it('operador y: o último ponto de controlo é o ponto final', async () => {
    // y(t) = 3(1-t)²t·100, máximo em t=1/3: 4/9·100
    const [e] = await ev('0 0 m 50 100 100 0 y f');
    expect(e.bbox.y1).toBeCloseTo((4 / 9) * 100, 6);
  });

  it('um traço alarga a caixa por metade da espessura, já com a escala', async () => {
    const [e] = await ev('2 0 0 2 0 0 cm 4 w 10 10 m 50 10 l S');
    expect(e.traca).toBe(true);
    expect(e.espessuraTraco).toBeCloseTo(8, 6);
    expect(e.bbox).toEqual({ x0: 20 - 4, y0: 20 - 4, x1: 100 + 4, y1: 20 + 4 });
  });

  it('o recorte limita a caixa do que vem a seguir', async () => {
    const [e] = await ev('10 10 50 50 re W n 0 0 200 200 re f');
    expect(e.bbox).toEqual({ x0: 10, y0: 10, x1: 60, y1: 60 });
  });

  it('o recorte acaba com Q', async () => {
    const es = await ev('q 10 10 50 50 re W n Q 0 0 200 200 re f');
    expect(es[0].bbox.x1).toBe(Math.min(200, mm(100)));
  });

  it('o que fica todo fora do recorte não gera evento', async () => {
    const es = await ev('10 10 20 20 re W n 100 100 5 5 re f');
    expect(es).toHaveLength(0);
  });

  it('o operador n sozinho não pinta nada', async () => {
    expect(await ev('0 0 10 10 re n')).toHaveLength(0);
  });

  it('linhas retas (largura zero) contam como visíveis', async () => {
    const [e] = await ev('0 0 m 50 0 l S');
    expect(e).toBeDefined();
  });

  it('B pinta preenchimento e traço no mesmo evento', async () => {
    const [e] = await ev('0 0 1 rg 1 0 0 RG 0 0 10 10 re B');
    expect(e.preenche && e.traca).toBe(true);
    expect(e.cor?.familia).toBe('RGB');
    expect(e.corTraco?.valores).toEqual([1, 0, 0]);
  });
});

describe('interpretador — cores e overprint', () => {
  const espacos = { CS0: { tipo: 'separation' as const, nome: 'PANTONE 485 C' }, CS1: { tipo: 'icc' as const, n: 4 as const }, CS2: { tipo: 'devicen' as const, nomes: ['Cyan', 'Cortante'] } };

  it('spot: guarda o nome e a tinta', async () => {
    const [e] = await ev('/CS0 cs 0.6 scn 0 0 5 5 re f', { espacos });
    expect(e.cor).toMatchObject({ familia: 'Separation', nomes: ['PANTONE 485 C'], valores: [0.6] });
  });

  it('cs sem scn usa o valor inicial: tinta a 100%', async () => {
    const [e] = await ev('/CS0 cs 0 0 5 5 re f', { espacos });
    expect(e.cor?.valores).toEqual([1]);
  });

  it('ICCBased com 4 componentes é CMYK', async () => {
    const [e] = await ev('/CS1 cs 0.1 0.2 0.3 0.4 scn 0 0 5 5 re f', { espacos });
    expect(e.cor).toMatchObject({ familia: 'CMYK', valores: [0.1, 0.2, 0.3, 0.4], calibrada: true });
  });

  it('DeviceN: nomes e tintas', async () => {
    const [e] = await ev('/CS2 cs 0 1 scn 0 0 5 5 re f', { espacos });
    expect(e.cor).toMatchObject({ familia: 'DeviceN', nomes: ['Cyan', 'Cortante'], valores: [0, 1] });
  });

  it('o traço usa a cor de traço, separada da de preenchimento', async () => {
    const [e] = await ev('/CS0 CS 1 SCN 0 0 1 rg 0 0 m 10 10 l S', { espacos });
    expect(e.corTraco).toMatchObject({ familia: 'Separation' });
  });

  const estados = { GS0: { OP: false, op: false }, GS1: { OP: true, op: true, OPM: 1 }, GS2: { op: true }, GS3: { OP: true } };

  it('overprint desligado por omissão', async () => {
    const [e] = await ev('0 0 5 5 re f');
    expect(e.overprintPreenchimento).toBe(false);
    expect(e.overprintTraco).toBe(false);
    expect(e.modoOverprint).toBe(0);
  });

  it('gs liga overprint e OPM', async () => {
    const [e] = await ev('/GS1 gs 0 0 0 0 k 0 0 5 5 re f', { estados });
    expect(e.overprintPreenchimento).toBe(true);
    expect(e.modoOverprint).toBe(1);
    expect(e.cor?.valores).toEqual([0, 0, 0, 0]);
  });

  it('op só afeta preenchimentos; OP sem op vale para ambos', async () => {
    const [a] = await ev('/GS2 gs 0 0 5 5 re f', { estados });
    expect(a.overprintPreenchimento).toBe(true);
    const [b] = await ev('/GS2 gs 0 0 m 5 5 l S', { estados });
    expect(b.overprintTraco).toBe(false);
    const [c] = await ev('/GS3 gs 0 0 5 5 re f', { estados });
    expect(c.overprintPreenchimento).toBe(true);
  });

  it('o overprint acompanha q/Q', async () => {
    const es = await ev('q /GS1 gs 0 0 5 5 re f Q 0 0 5 5 re f', { estados });
    expect(es[0].overprintPreenchimento).toBe(true);
    expect(es[1].overprintPreenchimento).toBe(false);
  });
});

describe('interpretador — layers', () => {
  const camadas = { MC0: { nome: 'CORTANTE' }, MC1: { nome: 'Rascunho', oculta: true } };

  it('anota o nome da layer', async () => {
    const [e] = await ev('/OC /MC0 BDC 0 0 5 5 re f EMC 0 0 5 5 re f', { camadas });
    expect(e.camada).toBe('CORTANTE');
    const es = await ev('/OC /MC0 BDC 0 0 5 5 re f EMC 0 0 5 5 re f', { camadas });
    expect(es[1].camada).toBeUndefined();
  });

  it('layers desligadas por omissão não geram eventos', async () => {
    const es = await ev('/OC /MC1 BDC 0 0 5 5 re f EMC 10 10 5 5 re f', { camadas });
    expect(es).toHaveLength(1);
    expect(es[0].bbox.x0).toBe(10);
  });

  it('a layer mais interna ganha', async () => {
    const [e] = await ev('/OC /MC0 BDC /Span BMC 0 0 5 5 re f EMC EMC', { camadas });
    expect(e.camada).toBe('CORTANTE');
  });
});

describe('interpretador — imagens', () => {
  const imagens = {
    Im0: { larguraPx: 600, alturaPx: 300, espaco: 'RGB' as const },
    Im1: { larguraPx: 100, alturaPx: 100, espaco: 'CMYK' as const },
    Im2: { larguraPx: 64, alturaPx: 64, espaco: 'Gray' as const, mascara: true },
  };

  it('calcula a resolução pelo tamanho a que está colocada', async () => {
    // 144 pt = 2 polegadas -> 600 px / 2 pol = 300 ppi; 72 pt de altura -> 300 px / 1 pol = 300 ppi
    const [e] = await ev('q 144 0 0 72 10 10 cm /Im0 Do Q', { imagens });
    expect(e.tipo).toBe('imagem');
    expect(e.imagem).toMatchObject({ larguraPx: 600, alturaPx: 300, espacoCor: 'RGB' });
    expect(e.imagem!.ppiX).toBeCloseTo(300, 4);
    expect(e.imagem!.ppiY).toBeCloseTo(300, 4);
    expect(e.bbox).toEqual({ x0: 10, y0: 10, x1: 154, y1: 82 });
  });

  it('imagem esticada tem ppi diferente em x e y', async () => {
    const [e] = await ev('q 72 0 0 144 0 0 cm /Im1 Do Q', { imagens });
    expect(e.imagem!.ppiX).toBeCloseTo(100, 4);
    expect(e.imagem!.ppiY).toBeCloseTo(50, 4);
  });

  it('imagem rodada: o ppi usa o comprimento dos lados, não a caixa', async () => {
    // 100x100 px, lado de 72 pt rodado 45°
    const c = 72 * Math.SQRT1_2;
    const [e] = await ev(`q ${c} ${c} ${-c} ${c} 50 0 cm /Im1 Do Q`, { imagens });
    expect(e.imagem!.ppiX).toBeCloseTo(100, 3);
  });

  it('imagem-máscara usa a cor de preenchimento', async () => {
    const [e] = await ev('0 1 1 0 k q 72 0 0 72 0 0 cm /Im2 Do Q', { imagens });
    expect(e.imagem!.espacoCor).toBe('Mask');
    expect(e.cor?.valores).toEqual([0, 1, 1, 0]);
  });

  it('imagem inline conta como imagem', async () => {
    const [e] = await ev('q 72 0 0 72 0 0 cm BI /W 10 /H 10 /CS /RGB /BPC 8 ID \x00\x01\x02 EI Q');
    expect(e.imagem).toMatchObject({ larguraPx: 10, alturaPx: 10, espacoCor: 'RGB' });
    expect(e.imagem!.ppiX).toBeCloseTo(10, 4);
  });
});

describe('interpretador — formulários (Form XObjects)', () => {
  it('desenha o conteúdo do Form com a sua matriz', async () => {
    const formularios = { Fm0: { conteudo: '0 0 10 10 re f', matriz: [1, 0, 0, 1, 30, 40] as [number, number, number, number, number, number] } };
    const [e] = await ev('/Fm0 Do', { formularios });
    expect(e.bbox).toEqual({ x0: 30, y0: 40, x1: 40, y1: 50 });
  });

  it('o BBox do Form recorta o conteúdo', async () => {
    const formularios = { Fm0: { conteudo: '0 0 100 100 re f', bbox: [0, 0, 20, 20] as [number, number, number, number] } };
    const [e] = await ev('/Fm0 Do', { formularios });
    expect(e.bbox).toEqual({ x0: 0, y0: 0, x1: 20, y1: 20 });
  });

  it('o Form herda a cor e o overprint em vigor', async () => {
    const formularios = { Fm0: { conteudo: '0 0 10 10 re f' } };
    const [e] = await ev('/GS1 gs 1 0 0 0 k /Fm0 Do', { formularios, estados: { GS1: { op: true } } });
    expect(e.cor?.valores).toEqual([1, 0, 0, 0]);
    expect(e.overprintPreenchimento).toBe(true);
  });

  it('o que se muda dentro do Form não vaza para fora', async () => {
    const formularios = { Fm0: { conteudo: '1 0 0 0 k 0 0 10 10 re f' } };
    const es = await ev('0 0 0 1 k /Fm0 Do 20 20 5 5 re f', { formularios });
    expect(es[0].cor?.valores).toEqual([1, 0, 0, 0]);
    expect(es[1].cor?.valores).toEqual([0, 0, 0, 1]);
  });

  it('Forms dentro de Forms funcionam e a recursão infinita não rebenta', async () => {
    const formularios = { Fm0: { conteudo: '0 0 10 10 re f /Fm0 Do', herdaRecursos: true } };
    const analise = await analisarRaw({ ...BASE, conteudo: '/Fm0 Do', formularios });
    expect(analise.paginas[0].ir.eventos.length).toBeGreaterThan(0);
    expect(analise.paginas[0].ir.avisos.join(' ')).toMatch(/aninhados/);
  });
});

describe('interpretador — vários streams e conteúdo estragado', () => {
  it('junta os streams de Contents por ordem', async () => {
    const es = await ev(['0 0 5 5 re', 'f 10 10 5 5 re f']);
    expect(es).toHaveLength(2);
  });

  it('delimitadores soltos e operadores desconhecidos não deitam abaixo o resto', async () => {
    const es = await ev('0 0 5 5 re f >> ] } foo bar 10 10 5 5 re f');
    expect(es).toHaveLength(2);
  });
});

describe('interpretador — área do preenchimento', () => {
  const area = async (c: string) => (await ev(c))[0].area!;

  it('retângulo: largura × altura', async () => {
    expect(await area('10 10 20 10 re f')).toBeCloseTo(200, 6);
  });

  it('a escala da matriz multiplica a área', async () => {
    expect(await area('2 0 0 2 0 0 cm 10 10 20 10 re f')).toBeCloseTo(800, 6);
  });

  it('rodar não muda a área', async () => {
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    expect(await area(`${c} ${s} ${-s} ${c} 50 10 cm 0 0 20 10 re f`)).toBeCloseTo(200, 6);
  });

  it('triângulo traçado com m/l/h', async () => {
    expect(await area('0 0 m 20 0 l 0 10 l h f')).toBeCloseTo(100, 6);
  });

  it('círculo com curvas de Bézier: perto de π·r²', async () => {
    const k = 0.5522847498;
    const r = 20;
    const c = `${r} 0 m ${r} ${k * r} ${k * r} ${r} 0 ${r} c ${-k * r} ${r} ${-r} ${k * r} ${-r} 0 c ${-r} ${-k * r} ${-k * r} ${-r} 0 ${-r} c ${k * r} ${-r} ${r} ${-k * r} ${r} 0 c 50 50 cm f`;
    // as curvas ficaram antes do cm: refaz com o cm primeiro
    const circ = `1 0 0 1 50 50 cm ${c.replace('c 50 50 cm f', 'c f')}`;
    expect(await area(circ)).toBeGreaterThan(Math.PI * r * r * 0.98);
    expect(await area(circ)).toBeLessThan(Math.PI * r * r * 1.02);
  });

  it('moldura com dois "re" e par-ímpar: desconta o buraco', async () => {
    expect(await area('0 0 100 100 re 10 10 80 80 re f*')).toBeCloseTo(10000 - 6400, 6);
  });

  it('dois "re" com a regra do enrolamento e o mesmo sentido: o buraco fica preenchido', async () => {
    expect(await area('0 0 100 100 re 10 10 80 80 re f')).toBeCloseTo(10000, 6);
  });

  it('buraco desenhado em sentido contrário com a regra do enrolamento: desconta', async () => {
    // interior no sentido horário
    expect(await area('0 0 100 100 re 10 10 m 10 90 l 90 90 l 90 10 l h f')).toBeCloseTo(10000 - 6400, 6);
  });

  it('formas separadas somam-se', async () => {
    expect(await area('0 0 10 10 re 50 50 10 10 re f')).toBeCloseTo(200, 6);
  });

  it('ilha dentro do buraco volta a contar (par-ímpar, três níveis)', async () => {
    expect(await area('0 0 100 100 re 10 10 80 80 re 30 30 40 40 re f*')).toBeCloseTo(10000 - 6400 + 1600, 6);
  });

  it('só a parte visível conta quando o recorte corta o objeto', async () => {
    expect(await area('0 0 50 100 re W n 0 0 100 100 re f')).toBeCloseTo(5000, 6);
  });

  it('só os preenchimentos têm área', async () => {
    const [e] = await ev('0 0 10 10 re S');
    expect(e.area).toBeUndefined();
  });

  it('B* usa a regra par-ímpar', async () => {
    expect(await area('0 0 100 100 re 10 10 80 80 re B*')).toBeCloseTo(3600, 6);
  });
});
