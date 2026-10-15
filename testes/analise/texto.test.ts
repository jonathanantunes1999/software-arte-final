import { describe, expect, it } from 'vitest';
import { analisarRaw, BASE } from '../fixtures/analisar';
import type { FonteSpec } from '../fixtures/gerar';

const F1: Record<string, FonteSpec> = { F1: { tipo: 'padrao' } };

async function texto(conteudo: string, fontes: Record<string, FonteSpec> = F1, extra: object = {}) {
  const a = await analisarRaw({ ...BASE, conteudo, fontes, ...extra });
  const p = a.paginas[0].ir;
  return { eventos: p.eventos.filter((e) => e.tipo === 'texto'), ir: p, fontes: a.fontes };
}

describe('texto — caixa do texto', () => {
  it('largura pela tabela de larguras e altura por ascent/descent', async () => {
    // Helvetica sem /Widths: 500 por glifo. 2 glifos × 0,5 × 10 pt = 10 pt de avanço.
    const { eventos } = await texto('BT /F1 10 Tf 10 10 Td (AB) Tj ET');
    expect(eventos).toHaveLength(1);
    expect(eventos[0].bbox).toEqual({ x0: 10, y0: 8, x1: 20, y1: 18 }); // descent -200, ascent 800
    expect(eventos[0].texto).toMatchObject({ tamanho: 10, invisivel: false });
  });

  it('usa o /Widths da fonte', async () => {
    const fontes = { F1: { tipo: 'incorporada' as const, primeiro: 65, larguras: [600, 700] } };
    const { eventos } = await texto('BT /F1 10 Tf 0 0 Td (AB) Tj ET', fontes);
    expect(eventos[0].bbox.x1 - eventos[0].bbox.x0).toBeCloseTo(13, 6);
  });

  it('Tc soma-se a cada glifo e Tw só ao espaço', async () => {
    const fontes = { F1: { tipo: 'incorporada' as const, primeiro: 32, larguras: [1000, ...new Array(40).fill(1000)] } };
    // "A B": 3 glifos × 10 = 30; Tc=2 → +6; Tw=5 → +5 (só o espaço)
    const { eventos } = await texto('BT /F1 10 Tf 2 Tc 5 Tw 0 0 Td (A B) Tj ET', fontes);
    expect(eventos[0].bbox.x1 - eventos[0].bbox.x0).toBeCloseTo(41, 6);
  });

  it('a caixa não sobe nem desce mais do que a tinta: ascent até 0,8 em e descent até 0,25 em', async () => {
    const fontes = { F1: { tipo: 'incorporada' as const, ascent: 1000, descent: -400 } };
    const { eventos } = await texto('BT /F1 10 Tf 10 10 Td (A) Tj ET', fontes);
    expect(eventos[0].bbox.y0).toBeCloseTo(10 - 2.5, 6);
    expect(eventos[0].bbox.y1).toBeCloseTo(10 + 8, 6);
  });

  it('fontes com métricas mais pequenas que o limite mantêm as suas', async () => {
    const fontes = { F1: { tipo: 'incorporada' as const, ascent: 700, descent: -150 } };
    const { eventos } = await texto('BT /F1 10 Tf 10 10 Td (A) Tj ET', fontes);
    expect(eventos[0].bbox.y0).toBeCloseTo(10 - 1.5, 6);
    expect(eventos[0].bbox.y1).toBeCloseTo(10 + 7, 6);
  });

  it('Tz escala a largura horizontal', async () => {
    const { eventos } = await texto('BT /F1 10 Tf 50 Tz 0 0 Td (AB) Tj ET');
    expect(eventos[0].bbox.x1 - eventos[0].bbox.x0).toBeCloseTo(5, 6);
  });

  it('TJ: os números deslocam o texto (milésimos de corpo, positivos aproximam)', async () => {
    // A (5) + ajuste -1000 → +10 + B (5) = 20; com +1000 fica 0
    const mais = await texto('BT /F1 10 Tf 0 0 Td [(A) -1000 (B)] TJ ET');
    expect(mais.eventos[0].bbox.x1 - mais.eventos[0].bbox.x0).toBeCloseTo(20, 6);
    // longe da margem: o texto recua até x=-5 e a MediaBox cortaria a caixa
    const menos = await texto('BT /F1 10 Tf 20 20 Td [(A) 1000 (B)] TJ ET');
    expect(menos.eventos[0].bbox.x1 - menos.eventos[0].bbox.x0).toBeCloseTo(10, 6);
  });

  it('o tamanho efetivo inclui a escala da matriz', async () => {
    const { eventos } = await texto('2 0 0 2 0 0 cm BT /F1 10 Tf 0 0 Td (A) Tj ET');
    expect(eventos[0].texto!.tamanho).toBeCloseTo(20, 6);
  });

  it('Tm posiciona e T* / TL / aspas avançam linha', async () => {
    const { eventos } = await texto("BT /F1 10 Tf 12 TL 1 0 0 1 10 50 Tm (A) Tj T* (B) Tj (C) ' ET");
    expect(eventos).toHaveLength(3);
    expect(eventos[0].bbox.y0).toBeCloseTo(48, 6);
    expect(eventos[1].bbox.y0).toBeCloseTo(36, 6);
    expect(eventos[2].bbox.y0).toBeCloseTo(24, 6);
    expect(eventos[1].bbox.x0).toBeCloseTo(10, 6);
  });

  it('texto em fonte composta (2 bytes por código) com /W e /DW', async () => {
    const fontes = { F1: { tipo: 'type0' as const, incorporada: true, dw: 1000, w: [65, [500]] } };
    // <0041> = 65 → 500 ; <0042> = 66 → DW 1000 ⇒ (0,5 + 1) × 10 = 15
    const { eventos } = await texto('BT /F1 10 Tf 0 0 Td <00410042> Tj ET', fontes);
    expect(eventos[0].bbox.x1 - eventos[0].bbox.x0).toBeCloseTo(15, 6);
  });

  it('a cor do texto é a de preenchimento', async () => {
    const { eventos } = await texto('0 1 0 0 k BT /F1 10 Tf 0 0 Td (A) Tj ET');
    expect(eventos[0].cor).toMatchObject({ familia: 'CMYK', valores: [0, 1, 0, 0] });
    expect(eventos[0].preenche).toBe(true);
  });

  it('modo de renderização 3 é invisível; 1 é só contorno', async () => {
    const inv = await texto('BT /F1 10 Tf 3 Tr 0 0 Td (A) Tj ET');
    expect(inv.eventos[0].texto!.invisivel).toBe(true);
    const contorno = await texto('BT /F1 10 Tf 1 Tr 0 0 Td (A) Tj ET');
    expect(contorno.eventos[0]).toMatchObject({ preenche: false, traca: true });
  });

  it('texto todo fora do recorte não gera evento mas a fonte conta como usada', async () => {
    const { eventos, ir } = await texto('0 0 5 5 re W n BT /F1 10 Tf 50 50 Td (A) Tj ET');
    expect(eventos).toHaveLength(0);
    expect(ir.fontesUsadas).toHaveLength(1);
  });

  it('só conta as fontes realmente usadas', async () => {
    const fontes = { F1: { tipo: 'padrao' as const }, F2: { tipo: 'padrao' as const, nome: 'Times-Roman' } };
    const { ir, fontes: info } = await texto('BT /F1 10 Tf 0 0 Td (A) Tj ET', fontes);
    expect(ir.fontesUsadas).toHaveLength(1);
    expect(Object.values(info).map((f) => f.nome)).toEqual(['Helvetica']);
  });

  it('fonte que não existe nos recursos: aviso, sem rebentar', async () => {
    const { eventos, ir } = await texto('BT /Fx 10 Tf 0 0 Td (A) Tj ET');
    expect(eventos).toHaveLength(0);
    expect(ir.avisos.join(' ')).toMatch(/Fx/);
  });

  it('texto dentro de um Form usa as fontes do Form', async () => {
    const formularios = { Fm0: { conteudo: 'BT /FF 10 Tf 0 0 Td (A) Tj ET', fontes: { FF: { tipo: 'padrao' as const, nome: 'Courier' } } } };
    const { eventos, fontes } = await texto('/Fm0 Do', {}, { formularios });
    expect(eventos).toHaveLength(1);
    expect(fontes[eventos[0].texto!.fonte].nome).toBe('Courier');
  });
});

describe('fontes — incorporada ou não', () => {
  const info = async (spec: FonteSpec) => {
    const { eventos, fontes } = await texto('BT /F1 10 Tf 0 0 Td (A) Tj ET', { F1: spec });
    return fontes[eventos[0].texto!.fonte];
  };

  it('Helvetica sem descritor: não incorporada', async () => {
    expect(await info({ tipo: 'padrao' })).toMatchObject({ nome: 'Helvetica', incorporada: false });
  });

  it('descritor sem FontFile: não incorporada', async () => {
    expect(await info({ tipo: 'sem-ficheiro', nome: 'Arial' })).toMatchObject({ nome: 'Arial', incorporada: false });
  });

  it('descritor com FontFile2: incorporada, e tira o prefixo de subset do nome', async () => {
    const f = await info({ tipo: 'incorporada', nome: 'ABCDEF+MinhaFonte-Bold' });
    expect(f).toMatchObject({ nome: 'MinhaFonte-Bold', nomeCompleto: 'ABCDEF+MinhaFonte-Bold', incorporada: true });
  });

  it('Type0: olha para a fonte descendente', async () => {
    expect(await info({ tipo: 'type0', incorporada: true })).toMatchObject({ composta: true, incorporada: true });
    expect(await info({ tipo: 'type0', incorporada: false })).toMatchObject({ composta: true, incorporada: false });
  });

  it('Type3 conta como incorporada (os glifos estão no ficheiro)', async () => {
    expect(await info({ tipo: 'type3' })).toMatchObject({ type3: true, incorporada: true });
  });

  it('a mesma fonte usada em duas páginas é uma só', async () => {
    const pagina = { ...BASE, conteudo: 'BT /F1 10 Tf 0 0 Td (A) Tj ET', fontes: F1 };
    const a = await analisarRaw(pagina, pagina);
    // cada página cria a sua fonte no gerador, mas dentro de cada uma o id é estável
    expect(a.paginas[0].ir.fontesUsadas).toHaveLength(1);
    expect(a.paginas[1].ir.fontesUsadas).toHaveLength(1);
  });
});
