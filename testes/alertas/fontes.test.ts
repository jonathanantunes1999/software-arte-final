import { describe, expect, it } from 'vitest';
import { alertasFontes } from '../../src/alertas/fontes';
import { analisarRaw, BASE } from '../fixtures/analisar';
import type { FonteSpec, PaginaRaw } from '../fixtures/gerar';

const TEXTO = (fonte = 'F1', x = 10, y = 10) => `BT /${fonte} 10 Tf ${x} ${y} Td (Ola) Tj ET`;

async function alertas(...paginas: Partial<PaginaRaw>[]) {
  const a = await analisarRaw(...paginas.map((p) => ({ ...BASE, conteudo: '', ...p })));
  return alertasFontes(a);
}
const ids = (as: { id: string }[]) => as.map((a) => a.id);
const nao: FonteSpec = { tipo: 'padrao', nome: 'Helvetica' };
const sim: FonteSpec = { tipo: 'incorporada', nome: 'ABCDEF+Garamond-Bold' };

describe('fontes — o que deve apanhar', () => {
  it('fonte não incorporada: erro com o nome, a página e o número de usos', async () => {
    const [e, i] = await alertas({ conteudo: `${TEXTO()} ${TEXTO('F1', 10, 30)} ${TEXTO('F1', 10, 50)}`, fontes: { F1: nao } });
    expect(e.id).toBe('fonte-nao-incorporada');
    expect(e.gravidade).toBe('erro');
    expect(e.titulo).toBe('Fonte não incorporada');
    expect(e.detalhe).toContain('Helvetica: pág. 1 (3 usos)');
    expect(i.id).toBe('texto-em-fonte');
  });

  it('o local aponta para o texto', async () => {
    const [e] = await alertas({ conteudo: TEXTO('F1', 20, 30), fontes: { F1: nao } });
    expect(e.locais).toHaveLength(1);
    const { pagina, caixa } = e.locais![0];
    expect(pagina).toBe(0);
    expect(caixa.x0).toBeCloseTo(20, 4);
    expect(caixa.y0).toBeLessThan(30);
    expect(caixa.y1).toBeGreaterThan(30);
  });

  it('descritor sem ficheiro de fonte também conta como não incorporada', async () => {
    const [e] = await alertas({ conteudo: TEXTO(), fontes: { F1: { tipo: 'sem-ficheiro', nome: 'Arial' } } });
    expect(e.detalhe).toContain('Arial');
  });

  it('fonte composta (Type0) não incorporada', async () => {
    const [e] = await alertas({ conteudo: 'BT /F1 10 Tf 10 10 Td <00410042> Tj ET', fontes: { F1: { tipo: 'type0', incorporada: false, nome: 'ABCDEF+FonteCID' } } });
    expect(e.id).toBe('fonte-nao-incorporada');
    expect(e.detalhe).toContain('FonteCID');
  });

  it('várias fontes não incorporadas: plural e uma linha por fonte', async () => {
    const [e] = await alertas({
      conteudo: `${TEXTO('F1')} ${TEXTO('F2', 10, 40)}`,
      fontes: { F1: nao, F2: { tipo: 'padrao', nome: 'Times-Roman' } },
    });
    expect(e.titulo).toBe('2 fontes não incorporadas');
    expect(e.detalhe).toContain('Helvetica');
    expect(e.detalhe).toContain('Times-Roman');
  });

  it('mesma fonte em várias páginas: junta as páginas, um local por página', async () => {
    const pag = { conteudo: TEXTO(), fontes: { F1: nao } };
    const [e] = await alertas(pag, { conteudo: '' }, pag);
    expect(e.detalhe).toContain('Helvetica: págs. 1, 3 (2 usos)');
    expect(e.locais!.map((l) => l.pagina)).toEqual([0, 2]);
  });

  it('só marca a fonte má quando há uma boa ao lado', async () => {
    const r = await alertas({ conteudo: `${TEXTO('F1')} ${TEXTO('F2', 10, 40)}`, fontes: { F1: nao, F2: sim } });
    expect(ids(r)).toEqual(['fonte-nao-incorporada', 'texto-em-fonte']);
    expect(r[0].detalhe).toContain('Helvetica');
    expect(r[0].detalhe).not.toContain('Garamond');
    // o informativo lista as duas
    expect(r[1].detalhe).toContain('2 fontes');
    expect(r[1].detalhe).toContain('Garamond-Bold'); // sem o prefixo ABCDEF+
    expect(r[1].detalhe).not.toContain('ABCDEF');
  });

  it('texto em fonte dentro de um Form', async () => {
    const formularios = { Fm0: { conteudo: TEXTO('FF'), fontes: { FF: nao } } };
    const [e] = await alertas({ conteudo: '/Fm0 Do', formularios });
    expect(e.id).toBe('fonte-nao-incorporada');
  });
});

describe('fontes — texto ainda em fonte (informação)', () => {
  it('fonte incorporada: só a informação, sem erro', async () => {
    const r = await alertas({ conteudo: TEXTO(), fontes: { F1: sim } });
    expect(ids(r)).toEqual(['texto-em-fonte']);
    expect(r[0].gravidade).toBe('info');
    expect(r[0].detalhe).toContain('1 fonte:');
    expect(r[0].detalhe).toContain('Garamond-Bold: pág. 1');
  });

  it('Type3 e Type0 incorporadas não dão erro', async () => {
    const r = await alertas({
      conteudo: `${TEXTO('F1')} ${TEXTO('F2', 10, 40)}`,
      fontes: { F1: { tipo: 'type3' }, F2: { tipo: 'type0', incorporada: true } },
    });
    expect(ids(r)).toEqual(['texto-em-fonte']);
  });

  it('um local por página com texto', async () => {
    const [i] = await alertas({ conteudo: TEXTO(), fontes: { F1: sim } }, { conteudo: '' }, { conteudo: TEXTO(), fontes: { F1: sim } });
    expect(i.locais!.map((l) => l.pagina)).toEqual([0, 2]);
  });

  it('lista longa de fontes é cortada com "…e mais"', async () => {
    const fontes: Record<string, FonteSpec> = {};
    let conteudo = '';
    for (let n = 0; n < 12; n++) {
      fontes[`F${n}`] = { tipo: 'incorporada', nome: `ABCDEF+Fonte${n}` };
      conteudo += TEXTO(`F${n}`, 5, 5 + n * 7) + ' ';
    }
    const [i] = await alertas({ conteudo, fontes });
    expect(i.detalhe).toContain('12 fontes:');
    expect(i.detalhe).toContain('…e mais 4');
  });
});

describe('fontes — o que NÃO deve apanhar (falsos positivos)', () => {
  it('página sem texto', async () => {
    expect(await alertas({ conteudo: '0 0 50 50 re f' })).toEqual([]);
  });

  it('fonte declarada nos recursos mas nunca usada', async () => {
    expect(await alertas({ conteudo: '0 0 50 50 re f', fontes: { F1: nao } })).toEqual([]);
  });

  it('texto invisível (modo 3, camada de OCR) não conta', async () => {
    expect(await alertas({ conteudo: 'BT /F1 10 Tf 3 Tr 10 10 Td (Ola) Tj ET', fontes: { F1: nao } })).toEqual([]);
  });

  it('texto todo recortado não conta', async () => {
    expect(await alertas({ conteudo: `0 0 5 5 re W n ${TEXTO('F1', 50, 50)}`, fontes: { F1: nao } })).toEqual([]);
  });

  it('texto numa layer desligada por omissão não conta', async () => {
    const camadas = { MC0: { nome: 'Rascunho', oculta: true } };
    expect(await alertas({ conteudo: `/OC /MC0 BDC ${TEXTO()} EMC`, fontes: { F1: nao }, camadas })).toEqual([]);
  });

  it('o mesmo nome incorporado e não incorporado: só o não incorporado dá erro', async () => {
    const r = await alertas({
      conteudo: `${TEXTO('F1')} ${TEXTO('F2', 10, 40)}`,
      fontes: { F1: { tipo: 'incorporada', nome: 'ABCDEF+Arial' }, F2: { tipo: 'sem-ficheiro', nome: 'Arial' } },
    });
    expect(r[0].id).toBe('fonte-nao-incorporada');
    expect(r[0].locais).toHaveLength(1);
  });
});
