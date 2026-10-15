import { describe, expect, it } from 'vitest';
import { lerDocumento } from '../../src/analise/documento';
import { tamanhosDiferentes } from '../../src/analise/caixas';
import { A4_COM_SANGRIA, gerarPdf } from '../fixtures/gerar';

describe('lerDocumento — medida final', () => {
  it('usa a TrimBox quando existe', async () => {
    const doc = await lerDocumento(await gerarPdf([A4_COM_SANGRIA]));
    const p = doc.paginas[0];
    expect(p.origemTrim).toBe('TrimBox');
    expect(p.larguraMm).toBeCloseTo(210, 1);
    expect(p.alturaMm).toBeCloseTo(297, 1);
  });

  it('sem TrimBox usa a CropBox e diz que veio daí', async () => {
    const doc = await lerDocumento(await gerarPdf([{ mediaMm: [226, 313], cropMm: [8, 8, 210, 297] }]));
    const p = doc.paginas[0];
    expect(p.origemTrim).toBe('CropBox');
    expect(p.larguraMm).toBeCloseTo(210, 1);
    expect(p.alturaMm).toBeCloseTo(297, 1);
  });

  it('sem TrimBox nem CropBox usa a MediaBox', async () => {
    const doc = await lerDocumento(await gerarPdf([{ mediaMm: [148, 210] }]));
    const p = doc.paginas[0];
    expect(p.origemTrim).toBe('MediaBox');
    expect(p.larguraMm).toBeCloseTo(148, 1);
    expect(p.alturaMm).toBeCloseTo(210, 1);
  });

  it('a medida aparece sempre, mesmo sem formato standard', async () => {
    const doc = await lerDocumento(await gerarPdf([{ mediaMm: [123.4, 67.8] }]));
    expect(doc.paginas[0].larguraMm).toBeCloseTo(123.4, 1);
    expect(doc.paginas[0].alturaMm).toBeCloseTo(67.8, 1);
  });

  it('página rodada 90° troca largura e altura (como se vê no ecrã)', async () => {
    const doc = await lerDocumento(await gerarPdf([{ ...A4_COM_SANGRIA, rotacao: 90 }]));
    const p = doc.paginas[0];
    expect(p.larguraMm).toBeCloseTo(297, 1);
    expect(p.alturaMm).toBeCloseTo(210, 1);
  });

  it('página rodada 180° mantém largura e altura', async () => {
    const doc = await lerDocumento(await gerarPdf([{ ...A4_COM_SANGRIA, rotacao: 180 }]));
    expect(doc.paginas[0].larguraMm).toBeCloseTo(210, 1);
  });

  it('respeita UserUnit', async () => {
    const doc = await lerDocumento(await gerarPdf([{ mediaMm: [100, 50], userUnit: 2 }]));
    expect(doc.paginas[0].larguraMm).toBeCloseTo(200, 1);
    expect(doc.paginas[0].alturaMm).toBeCloseTo(100, 1);
  });

  it('TrimBox sem área é ignorada', async () => {
    const doc = await lerDocumento(await gerarPdf([{ mediaMm: [100, 100], trimMm: [10, 10, 0, 0] }]));
    expect(doc.paginas[0].origemTrim).toBe('MediaBox');
  });
});

describe('lerDocumento — sangria', () => {
  it('3 mm em cada lado quando BleedBox − TrimBox = 3 mm', async () => {
    const doc = await lerDocumento(await gerarPdf([A4_COM_SANGRIA]));
    const p = doc.paginas[0];
    expect(p.origemSangria).toBe('BleedBox');
    for (const lado of ['esquerda', 'cima', 'direita', 'baixo'] as const) {
      expect(p.sangriaMm[lado]).toBeCloseTo(3, 1);
    }
  });

  it('sangria diferente por lado', async () => {
    const doc = await lerDocumento(
      await gerarPdf([{ mediaMm: [230, 320], trimMm: [10, 10, 210, 297], bleedMm: [8, 5, 215, 304] }]),
    );
    const s = doc.paginas[0].sangriaMm;
    expect(s.esquerda).toBeCloseTo(2, 1);
    expect(s.baixo).toBeCloseTo(5, 1);
    expect(s.direita).toBeCloseTo(3, 1); // 8+215=223 vs trim 220
    expect(s.cima).toBeCloseTo(2, 1);    // 5+304=309 vs trim 307
  });

  it('sem BleedBox: origem "nenhuma" e zero em todos os lados', async () => {
    const doc = await lerDocumento(await gerarPdf([{ mediaMm: [226, 313], trimMm: [8, 8, 210, 297] }]));
    const p = doc.paginas[0];
    expect(p.origemSangria).toBe('nenhuma');
    expect(p.sangriaMm).toEqual({ esquerda: 0, cima: 0, direita: 0, baixo: 0 });
  });

  it('com a página rodada 90° os lados acompanham o que se vê', async () => {
    // sangria só à esquerda do espaço de utilizador (5 mm), resto 0
    const spec = { mediaMm: [226, 313] as [number, number], trimMm: [8, 8, 210, 297] as [number, number, number, number], bleedMm: [3, 8, 215, 297] as [number, number, number, number] };
    const normal = (await lerDocumento(await gerarPdf([spec]))).paginas[0].sangriaMm;
    expect(normal.esquerda).toBeCloseTo(5, 1);

    const r90 = (await lerDocumento(await gerarPdf([{ ...spec, rotacao: 90 }]))).paginas[0].sangriaMm;
    expect(r90.cima).toBeCloseTo(5, 1);
    expect(r90.esquerda).toBeCloseTo(0, 1);

    const r180 = (await lerDocumento(await gerarPdf([{ ...spec, rotacao: 180 }]))).paginas[0].sangriaMm;
    expect(r180.direita).toBeCloseTo(5, 1);

    const r270 = (await lerDocumento(await gerarPdf([{ ...spec, rotacao: 270 }]))).paginas[0].sangriaMm;
    expect(r270.baixo).toBeCloseTo(5, 1);
  });
});

describe('páginas com tamanhos diferentes', () => {
  it('um PDF todo igual não avisa', async () => {
    const doc = await lerDocumento(await gerarPdf([A4_COM_SANGRIA, A4_COM_SANGRIA, A4_COM_SANGRIA]));
    expect(tamanhosDiferentes(doc.paginas, 0.5)).toBe(false);
  });

  it('A4 + A5 avisa', async () => {
    const doc = await lerDocumento(await gerarPdf([A4_COM_SANGRIA, { mediaMm: [148, 210] }]));
    expect(doc.paginas).toHaveLength(2);
    expect(tamanhosDiferentes(doc.paginas, 0.5)).toBe(true);
  });

  it('diferença dentro da tolerância não avisa', async () => {
    const doc = await lerDocumento(await gerarPdf([{ mediaMm: [210, 297] }, { mediaMm: [210.3, 297.2] }]));
    expect(tamanhosDiferentes(doc.paginas, 0.5)).toBe(false);
  });
});

describe('segurança do original', () => {
  it('ler o documento não altera os bytes de entrada', async () => {
    const bytes = await gerarPdf([A4_COM_SANGRIA]);
    const antes = Array.from(bytes);
    await lerDocumento(bytes);
    expect(Array.from(bytes)).toEqual(antes);
  });
});
