import { describe, expect, it } from 'vitest';
import { alertasResolucao } from '../../src/alertas/resolucao';
import type { ConfigAlertas } from '../../src/alertas/tipos';
import { analisarRaw, BASE, CFG_BASE } from '../fixtures/analisar';
import type { ImagemSpec, PaginaRaw } from '../fixtures/gerar';

/** Uma imagem de `px`×`px` colocada em `pt`×`pt` pontos (72 pt = 1 polegada) */
async function alertas(imagem: Partial<ImagemSpec> & { px?: number; pt?: number; ptAltura?: number }, extra: Partial<PaginaRaw> = {}, cfg: Partial<ConfigAlertas> = {}) {
  const px = imagem.px ?? 300;
  const pt = imagem.pt ?? 72;
  const imagens = { Im0: { larguraPx: px, alturaPx: imagem.alturaPx ?? px, espaco: imagem.espaco ?? ('CMYK' as const), mascara: imagem.mascara } };
  const a = await analisarRaw({ ...BASE, mediaMm: [300, 300], conteudo: `q ${pt} 0 0 ${imagem.ptAltura ?? pt} 10 10 cm /Im0 Do Q`, imagens, ...extra });
  return alertasResolucao(a, { ...CFG_BASE, ...cfg });
}
const ids = (as: { id: string }[]) => as.map((a) => a.id);

describe('resolução — limites', () => {
  it('300 ppi: certo', async () => {
    expect(await alertas({ px: 300 })).toEqual([]);
  });

  it('mais que 300 ppi: certo', async () => {
    expect(await alertas({ px: 1200 })).toEqual([]);
  });

  it('299 ppi: aviso', async () => {
    const r = await alertas({ px: 299 });
    expect(ids(r)).toEqual(['resolucao-media']);
    expect(r[0].gravidade).toBe('aviso');
    expect(r[0].titulo).toBe('Imagem abaixo de 300 ppi');
  });

  it('150 ppi: ainda só aviso; 149 ppi: erro', async () => {
    expect(ids(await alertas({ px: 150 }))).toEqual(['resolucao-media']);
    const r = await alertas({ px: 149 });
    expect(ids(r)).toEqual(['resolucao-baixa']);
    expect(r[0].gravidade).toBe('erro');
    expect(r[0].titulo).toBe('Imagem com resolução muito baixa');
  });

  it('compara ao valor mostrado: 299,7 ppi diz-se 300 e não é problema', async () => {
    // 1498 px em 360 pt = 5 polegadas -> 299,6 ppi
    expect(await alertas({ px: 1498, pt: 360 })).toEqual([]);
  });

  it('limites configuráveis', async () => {
    expect(await alertas({ px: 200 }, {}, { resolucaoAvisoPpi: 150 })).toEqual([]);
    expect(ids(await alertas({ px: 200 }, {}, { resolucaoAvisoPpi: 300, resolucaoErroPpi: 250 }))).toEqual(['resolucao-baixa']);
  });

  it('um limite de erro acima do de aviso não cria erros fantasma', async () => {
    const r = await alertas({ px: 200 }, {}, { resolucaoAvisoPpi: 300, resolucaoErroPpi: 500 });
    expect(ids(r)).toEqual(['resolucao-baixa']);
  });
});

describe('resolução — como se calcula', () => {
  it('pelo tamanho a que está colocada: a mesma imagem esticada dá menos ppi', async () => {
    expect(await alertas({ px: 600, pt: 144 })).toEqual([]); // 300 ppi
    const r = await alertas({ px: 600, pt: 288 }); // 150 ppi
    expect(ids(r)).toEqual(['resolucao-media']);
  });

  it('o detalhe diz os pixels e o tamanho em mm', async () => {
    const [a] = await alertas({ px: 100, pt: 72 });
    expect(a.id).toBe('resolucao-baixa');
    expect(a.detalhe).toContain('Pág. 1: 100 ppi (100×100 px a 25,4 × 25,4 mm)');
  });

  it('imagem esticada só num sentido: usa o pior e diz que está esticada', async () => {
    const [a] = await alertas({ px: 300, pt: 72, ptAltura: 216 }); // 300 × 100 ppi
    expect(a.id).toBe('resolucao-baixa');
    expect(a.detalhe).toContain('300×100 ppi, esticada');
  });

  it('imagem rodada: a resolução vem do comprimento dos lados, não da caixa', async () => {
    const c = 72 * Math.SQRT1_2;
    const imagens = { Im0: { larguraPx: 300, alturaPx: 300, espaco: 'CMYK' as const } };
    const a = await analisarRaw({ ...BASE, mediaMm: [300, 300], conteudo: `q ${c} ${c} ${-c} ${c} 100 10 cm /Im0 Do Q`, imagens });
    expect(alertasResolucao(a, CFG_BASE)).toEqual([]);
  });

  it('imagem-máscara (1 bit) também conta', async () => {
    const r = await alertas({ px: 100, mascara: true });
    expect(r[0].id).toBe('resolucao-baixa');
  });

  it('imagem inline também conta', async () => {
    const a = await analisarRaw({ ...BASE, mediaMm: [300, 300], conteudo: 'q 72 0 0 72 10 10 cm BI /W 100 /H 100 /CS /G /BPC 8 ID \x00 EI Q' });
    expect(ids(alertasResolucao(a, CFG_BASE))).toEqual(['resolucao-baixa']);
  });

  it('o local é a caixa da imagem', async () => {
    const [a] = await alertas({ px: 100 });
    expect(a.locais).toHaveLength(1);
    expect(a.locais![0].caixa).toEqual({ x0: 10, y0: 10, x1: 82, y1: 82 });
  });

  it('erros e avisos em alertas separados, vários numa página', async () => {
    const imagens = { Im0: { larguraPx: 100, alturaPx: 100, espaco: 'CMYK' as const }, Im1: { larguraPx: 200, alturaPx: 200, espaco: 'CMYK' as const } };
    const a = await analisarRaw({ ...BASE, mediaMm: [300, 300], conteudo: 'q 72 0 0 72 10 10 cm /Im0 Do Q q 72 0 0 72 100 10 cm /Im1 Do Q', imagens });
    expect(ids(alertasResolucao(a, CFG_BASE))).toEqual(['resolucao-baixa', 'resolucao-media']);
  });
});

describe('resolução — o que NÃO deve apanhar (falsos positivos)', () => {
  it('imagem toda fora da área de produção (na zona das marcas)', async () => {
    // página 300 mm, corte 100 mm no meio; imagem a 250 mm
    const imagens = { Im0: { larguraPx: 10, alturaPx: 10, espaco: 'CMYK' as const } };
    const a = await analisarRaw({ mediaMm: [300, 300], trimMm: [100, 100, 100, 100], bleedMm: [97, 97, 106, 106], conteudo: `q 72 0 0 72 ${250 * 2.83} ${250 * 2.83} cm /Im0 Do Q`, imagens });
    expect(alertasResolucao(a, CFG_BASE)).toEqual([]);
  });

  it('imagem numa layer desligada por omissão', async () => {
    const camadas = { MC0: { nome: 'Rascunho', oculta: true } };
    const imagens = { Im0: { larguraPx: 10, alturaPx: 10, espaco: 'CMYK' as const } };
    const a = await analisarRaw({ ...BASE, conteudo: '/OC /MC0 BDC q 72 0 0 72 10 10 cm /Im0 Do Q EMC', imagens, camadas });
    expect(alertasResolucao(a, CFG_BASE)).toEqual([]);
  });

  it('imagem toda recortada', async () => {
    const imagens = { Im0: { larguraPx: 10, alturaPx: 10, espaco: 'CMYK' as const } };
    const a = await analisarRaw({ ...BASE, conteudo: '0 0 5 5 re W n q 72 0 0 72 50 50 cm /Im0 Do Q', imagens });
    expect(alertasResolucao(a, CFG_BASE)).toEqual([]);
  });

  it('página sem imagens', async () => {
    expect(alertasResolucao(await analisarRaw({ ...BASE, conteudo: '0 0 10 10 re f' }), CFG_BASE)).toEqual([]);
  });
});
