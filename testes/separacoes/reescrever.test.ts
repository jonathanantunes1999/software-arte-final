import { describe, expect, it } from 'vitest';
import { PLACA, reescrever } from '../fixtures/reescrever';
import { contagensVazias, reescreverFluxo, RegistoAlfa } from '../../src/separacoes/reescrever';

const ESTADOS = {
  GS0: { OP: false, op: false },
  GS1: { OP: true, op: true, OPM: 1 },
  GS2: { OP: true, op: true, OPM: 0 },
  GS3: { OP: true, op: false, OPM: 1 }, // só o traço em overprint
  GSA: { ca: 0.5, CA: 0.25 },
};
const ESPACOS = { CS0: { tipo: 'separation' as const, nome: 'Verniz' } };
const FONTES = { F1: { tipo: 'incorporada' as const } };
const BASE = { estados: ESTADOS, espacos: ESPACOS, fontes: FONTES };

/** Texto sem espaços repetidos, para comparar mais à vontade */
const limpo = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('reescrever — cores', () => {
  it('a página começa com a cor inicial: preto só na placa K', async () => {
    expect(limpo((await reescrever({ ...BASE, conteudo: '10 10 50 50 re f' }, PLACA.K)).pagina)).toMatch(/^0 g 0 G /);
    expect(limpo((await reescrever({ ...BASE, conteudo: '10 10 50 50 re f' }, PLACA.C)).pagina)).toMatch(/^1 g 1 G /);
  });

  it('CMYK passa a cinzento 1 − tinta, em cada placa', async () => {
    const conteudo = '0.8 0.3 0 0.5 k 10 10 50 50 re f';
    expect(limpo((await reescrever({ ...BASE, conteudo }, PLACA.C)).pagina)).toContain('0.2 g');
    expect(limpo((await reescrever({ ...BASE, conteudo }, PLACA.M)).pagina)).toContain('0.7 g');
    expect(limpo((await reescrever({ ...BASE, conteudo }, PLACA.Y)).pagina)).toContain('1 g /ArtA0 gs 10 10');
    expect(limpo((await reescrever({ ...BASE, conteudo }, PLACA.K)).pagina)).toContain('0.5 g');
  });

  it('traço usa G, preenchimento usa g', async () => {
    const t = limpo((await reescrever({ ...BASE, conteudo: '0 0 0 0.3 K 1 0 0 0 k' }, PLACA.K)).pagina);
    expect(t).toContain('0.7 G');
    expect(t).not.toContain('0.7 g');
    expect(t).toContain('1 g');
    expect(t).not.toContain(' K');
    expect(t).not.toContain(' k');
  });

  it('spots: cs dá a tinta inicial (100%), scn o valor; só a placa da spot leva tinta', async () => {
    const { pagina } = await reescrever({ ...BASE, conteudo: '/CS0 cs 0.6 scn 0 0 10 10 re f' }, PLACA.spot('Verniz'));
    expect(limpo(pagina)).toContain('0 g 0.4 g');
    const outra = await reescrever({ ...BASE, conteudo: '/CS0 cs 0.6 scn 0 0 10 10 re f' }, PLACA.K);
    expect(limpo(outra.pagina)).toContain('1 g 1 g');
  });

  it('RGB e cinzento convertem-se', async () => {
    const r = await reescrever({ ...BASE, conteudo: '1 0 0 rg 0.25 g 0 0 5 5 re f' }, PLACA.K);
    // vermelho não leva K; cinzento 0,25 leva 75% de K
    expect(limpo(r.pagina)).toContain('1 g 0.25 g');
  });

  it('o resto do stream fica igual, byte a byte (texto, números, comentários)', async () => {
    const conteudo = 'q 1 0 0 1 5 5 cm % nota\nBT /F1 12 Tf (Ol\\351 \\(x\\)) Tj ET Q';
    const r = await reescrever({ ...BASE, conteudo }, PLACA.K);
    // acrescenta-se a cor inicial à frente e a opacidade antes de mostrar o texto
    // (o interpretador junta os streams da página com um \n no fim de cada um)
    expect(r.pagina).toBe(`0 g 0 G\n${conteudo.replace('(Ol', '/ArtA0 gs (Ol')}\n`);
  });
});

describe('reescrever — overprint e opacidade', () => {
  const FUNDO = '0.8 0 0 0 k 0 0 100 100 re f';
  const gs = async (conteudo: string, placa: Parameters<typeof reescrever>[1], simular = true) => {
    const r = await reescrever({ ...BASE, conteudo }, placa, simular);
    return { texto: limpo(r.pagina), alfa: r.alfa };
  };

  it('sem overprint: tudo marca a placa com a opacidade original (1)', async () => {
    const r = await gs('/GS0 gs 0 0 0 1 k 10 10 20 20 re f', PLACA.C);
    expect(r.alfa).toEqual([{ nome: 'ArtA0', ca: 1, CA: 1 }]);
    expect(r.texto).toContain('/ArtA0 gs 10 10 20 20 re f');
  });

  it('preto em overprint modo 1: só marca a placa K; nas outras fica transparente', async () => {
    const c = '/GS1 gs 0 0 0 1 k 10 10 20 20 re f';
    expect((await gs(c, PLACA.K)).alfa).toEqual([{ nome: 'ArtA0', ca: 1, CA: 1 }]);
    const c2 = await gs(c, PLACA.C);
    expect(c2.alfa).toEqual([{ nome: 'ArtA0', ca: 0, CA: 1 }]);
    expect(c2.texto).toContain('/ArtA0 gs 10 10 20 20 re f');
  });

  it('modo 0: as outras placas de processo apagam; a spot fica intacta', async () => {
    const c = '/GS2 gs 0 0 0 1 k 10 10 20 20 re f';
    expect((await gs(c, PLACA.C)).alfa).toEqual([{ nome: 'ArtA0', ca: 1, CA: 1 }]);
    expect((await gs(c, PLACA.spot('Verniz'))).alfa).toEqual([{ nome: 'ArtA0', ca: 0, CA: 1 }]);
  });

  it('desligar a simulação trata tudo como sem overprint', async () => {
    const c = '/GS1 gs 0 0 0 1 k 10 10 20 20 re f';
    expect((await gs(c, PLACA.C, false)).alfa).toEqual([{ nome: 'ArtA0', ca: 1, CA: 1 }]);
  });

  it('spot em overprint: deixa o processo em paz e marca a sua placa', async () => {
    const c = '/GS1 gs /CS0 cs 1 scn 10 10 20 20 re f';
    expect((await gs(c, PLACA.K)).alfa[0]).toMatchObject({ ca: 0 });
    expect((await gs(c, PLACA.spot('Verniz'))).alfa[0]).toMatchObject({ ca: 1 });
  });

  it('opacidade original (ca/CA) mantém-se onde marca', async () => {
    const r = await gs('/GSA gs 0 0 0 1 k 0 0 0 1 K 1 w 10 10 20 20 re B', PLACA.K);
    expect(r.alfa).toEqual([{ nome: 'ArtA0', ca: 0.5, CA: 0.25 }]);
  });

  it('preenchimento e traço decidem à parte (op e OP)', async () => {
    const c = '/GS3 gs 0 0 0 1 k 0 0 0 1 K 1 w 10 10 20 20 re B';
    // traço em overprint (modo 1, K 100%): na placa C o traço fica transparente e o preenchimento apaga
    expect((await gs(c, PLACA.C)).alfa).toEqual([{ nome: 'ArtA0', ca: 1, CA: 0 }]);
  });

  it('a opacidade é posta antes do caminho começar, não entre a construção e a pintura', async () => {
    const r = await gs('0 0 0 1 k 10 10 m 50 10 l 50 50 l f', PLACA.K);
    expect(r.texto).toContain('/ArtA0 gs 10 10 m 50 10 l 50 50 l f');
  });

  it('um recorte (W n) antes não desloca o início do caminho seguinte', async () => {
    const r = await gs('0 0 0 1 k 0 0 100 100 re W n 10 10 20 20 re f', PLACA.K);
    expect(r.texto).toContain('re W n /ArtA0 gs 10 10 20 20 re f');
  });

  it('layer desligada: pinturas ficam transparentes, Do é retirado', async () => {
    const camadas = { MC0: { nome: 'Faca', oculta: true } };
    const r = await reescrever({ ...BASE, camadas, formularios: { Fm0: { conteudo: '0 0 0 1 k 0 0 5 5 re f' } }, conteudo: '/OC /MC0 BDC 0 0 0 1 k 10 10 20 20 re f /Fm0 Do EMC' }, PLACA.K);
    // só preenche: o traço (que não se usa) fica com a opacidade original
    expect(r.alfa).toEqual([{ nome: 'ArtA0', ca: 0, CA: 1 }]);
    expect(limpo(r.pagina)).not.toContain('Do');
    expect(Object.keys(r.textos)).toEqual(['pagina']);
  });

  it('texto em overprint marca como o resto', async () => {
    const r = await gs('/GS1 gs 0 0 0 1 k BT /F1 12 Tf 10 10 Td (A) Tj ET', PLACA.M);
    expect(r.alfa).toEqual([{ nome: 'ArtA0', ca: 0, CA: 1 }]);
  });

  it('cor Pattern: a pintura fica transparente e conta-se', async () => {
    const r = await reescrever({ ...BASE, conteudo: '/Pattern cs /P1 scn 0 0 10 10 re f' }, PLACA.K);
    expect(r.alfa).toEqual([{ nome: 'ArtA0', ca: 0, CA: 1 }]);
    expect(r.contagens.padroes).toBe(1);
  });

  it('degradé e imagens ficam de fora (e contam-se); máscaras de 1 bit mantêm-se', async () => {
    const r = await reescrever(
      {
        ...BASE,
        imagens: { Im0: { larguraPx: 2, alturaPx: 2, espaco: 'CMYK' }, Im1: { larguraPx: 2, alturaPx: 2, espaco: 'Gray', mascara: true } },
        conteudo: '0 0 0 1 k /Im0 Do /Im1 Do /Sh0 sh',
      },
      PLACA.K,
    );
    expect(r.contagens).toMatchObject({ imagens: 1, degrades: 1 });
    const t = limpo(r.pagina);
    expect(t).not.toContain('/Im0 Do');
    expect(t).not.toContain('sh');
    expect(t).toContain('/Im1 Do');
  });

  it('formulários: os operadores de dentro são reescritos no seu fluxo', async () => {
    const r = await reescrever({ ...BASE, formularios: { Fm0: { conteudo: '0.5 0 0 0 k 0 0 20 20 re f' } }, conteudo: '/Fm0 Do' }, PLACA.C);
    const [idForm] = Object.keys(r.textos).filter((k) => k !== 'pagina');
    expect(limpo(r.textos[idForm])).toBe('0.5 g /ArtA0 gs 0 0 20 20 re f');
  });

  it('o mesmo form usado com estados diferentes avisa (vale o primeiro)', async () => {
    const r = await reescrever(
      { ...BASE, formularios: { Fm0: { conteudo: '0 0 0 1 k 0 0 20 20 re f' } }, conteudo: '/GS0 gs /Fm0 Do /GS1 gs /Fm0 Do' },
      PLACA.C,
    );
    // dentro do form, a pintura herda o overprint de quem o chama: dois estados, só vale o primeiro
    expect(r.contagens.ambiguos).toBe(1);
  });
});

describe('reescrever — casos de fronteira', () => {
  it('imagens numa layer desligada não contam como "não separadas"', async () => {
    const camadas = { MC0: { nome: 'Faca', oculta: true } };
    const r = await reescrever({ ...BASE, camadas, imagens: { Im0: { larguraPx: 2, alturaPx: 2, espaco: 'CMYK' } }, conteudo: '/OC /MC0 BDC /Im0 Do EMC' }, PLACA.K);
    expect(r.contagens.imagens).toBe(0);
    expect(limpo(r.pagina)).not.toContain('Im0');
  });

  it('trocas sobrepostas: a segunda é ignorada em vez de estragar o texto', () => {
    const cor = { tipo: 'cor' as const, alvo: 'fill' as const, cor: { familia: 'Gray' as const, valores: [0.5] } };
    const r = reescreverFluxo('0123456789', [
      { inicio: 0, fim: 5, o: cor },
      { inicio: 3, fim: 8, o: cor },
    ], { placa: PLACA.K, simularOverprint: true, alfa: new RegistoAlfa(), contagens: contagensVazias(), eDaPagina: false });
    expect(r).toBe('0.5 g56789');
  });

  it('as opacidades arredondam-se, cortam-se a 0–1 e partilham o mesmo estado', () => {
    const a = new RegistoAlfa();
    expect(a.nome(0.5000001, 1)).toBe(a.nome(0.5, 1));
    expect(a.nome(5, 1)).toBe(a.nome(1, 1));
    expect(a.nome(NaN, 1)).toBe(a.nome(1, 1));
    expect(a.nome(-2, 1)).toBe(a.nome(0, 1));
    expect(a.entradas().map((e) => [e.ca, e.CA])).toEqual([[0.5, 1], [1, 1], [0, 1]]);
  });
});
