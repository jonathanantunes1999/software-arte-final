import { describe, expect, it } from 'vitest';
import { alertasRgb } from '../../src/alertas/rgb';
import { analisarRaw, BASE } from '../fixtures/analisar';
import type { PaginaRaw } from '../fixtures/gerar';

async function alertas(conteudo: string, extra: Partial<PaginaRaw> = {}) {
  return alertasRgb(await analisarRaw({ ...BASE, conteudo, ...extra }));
}
const FONTE = { F1: { tipo: 'incorporada' as const } };

describe('RGB — o que deve apanhar', () => {
  it('preenchimento vetorial em RGB', async () => {
    const [a] = await alertas('1 0 0 rg 10 10 30 30 re f');
    expect(a.id).toBe('rgb');
    expect(a.gravidade).toBe('aviso');
    expect(a.titulo).toBe('Elementos em RGB');
    expect(a.detalhe).toContain('Vetores: 1 (pág. 1)');
    expect(a.detalhe).toContain('RGB 255/0/0');
  });

  it('traço em RGB', async () => {
    const [a] = await alertas('0 0 1 RG 10 10 m 60 60 l S');
    expect(a.detalhe).toContain('Vetores: 1');
  });

  it('preto em RGB conta: converte para um preto de quatro cores', async () => {
    const [a] = await alertas('0 0 0 rg 10 10 30 30 re f');
    expect(a.detalhe).toContain('RGB 0/0/0');
  });

  it('texto em RGB, separado dos vetores', async () => {
    const [a] = await alertas('0.2 0.4 0.6 rg BT /F1 10 Tf 10 10 Td (Ola) Tj ET', { fontes: FONTE });
    expect(a.detalhe).toContain('Texto: 1');
    expect(a.detalhe).not.toContain('Vetores');
  });

  it('imagem DeviceRGB e imagem ICC de 3 componentes', async () => {
    const imagens = { Im0: { larguraPx: 10, alturaPx: 10, espaco: 'RGB' as const } };
    const [a] = await alertas('q 50 0 0 50 10 10 cm /Im0 Do Q', { imagens });
    expect(a.detalhe).toContain('Imagens: 1');
  });

  it('espaço ICCBased de 3 componentes é RGB', async () => {
    const espacos = { CS0: { tipo: 'icc' as const, n: 3 as const } };
    const [a] = await alertas('/CS0 cs 0.5 0.5 0.5 scn 10 10 30 30 re f', { espacos });
    expect(a.id).toBe('rgb');
  });

  it('conta por categoria e lista as páginas', async () => {
    const pag = { ...BASE, conteudo: '1 0 0 rg 10 10 5 5 re f 0 1 0 rg 30 30 5 5 re f' };
    const a = alertasRgb(await analisarRaw(pag, { ...BASE, conteudo: '' }, pag));
    expect(a[0].detalhe).toContain('Vetores: 4 (págs. 1, 3)');
  });

  it('as cores mais usadas aparecem, no máximo 3', async () => {
    const c = ['1 0 0', '0 1 0', '0 0 1', '1 1 0'].map((v, i) => `${v} rg ${i * 20} 0 10 10 re f`).join(' ');
    const [a] = await alertas(c);
    expect(a.detalhe).toMatch(/Cores: .*\+1/);
  });

  it('o destaque junta objetos próximos e separa os distantes', async () => {
    const [a] = await alertas('1 0 0 rg 10 10 10 10 re f 22 10 10 10 re f 1 0 0 rg 200 200 10 10 re f', { mediaMm: [150, 150] });
    expect(a.locais).toHaveLength(2);
  });

  it('cada imagem RGB tem o seu local', async () => {
    const imagens = { Im0: { larguraPx: 10, alturaPx: 10, espaco: 'RGB' as const } };
    const [a] = await alertas('q 20 0 0 20 10 10 cm /Im0 Do Q q 20 0 0 20 200 200 cm /Im0 Do Q', { imagens, mediaMm: [150, 150] });
    expect(a.locais).toHaveLength(2);
  });
});

describe('RGB — o que NÃO deve apanhar (falsos positivos)', () => {
  it('CMYK, cinzento e spots não são RGB', async () => {
    const espacos = { CS0: { tipo: 'separation' as const, nome: 'PANTONE 485 C' } };
    const c = '0 1 1 0 k 0 0 10 10 re f 0.5 g 20 0 10 10 re f /CS0 cs 1 scn 40 0 10 10 re f 0 0 0 1 K 0 50 m 50 50 l S';
    expect(await alertas(c, { espacos })).toEqual([]);
  });

  it('ICCBased de 4 componentes é CMYK', async () => {
    const espacos = { CS0: { tipo: 'icc' as const, n: 4 as const } };
    expect(await alertas('/CS0 cs 0 1 1 0 scn 10 10 30 30 re f', { espacos })).toEqual([]);
  });

  it('imagens CMYK e cinzento', async () => {
    const imagens = { Im0: { larguraPx: 10, alturaPx: 10, espaco: 'CMYK' as const }, Im1: { larguraPx: 10, alturaPx: 10, espaco: 'Gray' as const } };
    expect(await alertas('q 20 0 0 20 0 0 cm /Im0 Do Q q 20 0 0 20 30 0 cm /Im1 Do Q', { imagens })).toEqual([]);
  });

  it('RGB branco puro não conta', async () => {
    expect(await alertas('1 1 1 rg 0 0 50 50 re f')).toEqual([]);
  });

  it('texto invisível em RGB (camada de OCR) não conta', async () => {
    expect(await alertas('1 0 0 rg BT /F1 10 Tf 3 Tr 10 10 Td (Ola) Tj ET', { fontes: FONTE })).toEqual([]);
  });

  it('RGB numa layer desligada por omissão não conta', async () => {
    const camadas = { MC0: { nome: 'Rascunho', oculta: true } };
    expect(await alertas('/OC /MC0 BDC 1 0 0 rg 10 10 30 30 re f EMC', { camadas })).toEqual([]);
  });

  it('RGB todo fora do recorte não conta', async () => {
    expect(await alertas('0 0 5 5 re W n 1 0 0 rg 50 50 10 10 re f')).toEqual([]);
  });

  it('um traço só de cor RGB mas preenchimento CMYK: só o traço conta', async () => {
    const [a] = await alertas('0 1 1 0 k 0 0 1 RG 10 10 30 30 re B');
    expect(a.detalhe).toContain('Vetores: 1');
    const linhaCores = a.detalhe!.split('\n').find((l) => l.startsWith('Cores:'));
    expect(linhaCores).toBe('Cores: RGB 0/0/255');
  });
});
