import { describe, expect, it } from 'vitest';
import { alertasLinhasFinas } from '../../src/alertas/linhas-finas';
import type { ConfigAlertas } from '../../src/alertas/tipos';
import { analisarRaw, BASE, CFG_BASE } from '../fixtures/analisar';
import { mm, type PaginaRaw } from '../fixtures/gerar';

async function alertas(conteudo: string, extra: Partial<PaginaRaw> = {}, cfg: Partial<ConfigAlertas> = {}) {
  return alertasLinhasFinas(await analisarRaw({ ...BASE, conteudo, ...extra }), { ...CFG_BASE, ...cfg });
}
const linha = (w: number, cor = '0 0 0 1 K') => `${cor} ${w} w 10 50 m 80 50 l S`;

describe('linhas finas — limite', () => {
  it('0,1 pt: aviso', async () => {
    const [a] = await alertas(linha(0.1));
    expect(a.id).toBe('linhas-finas');
    expect(a.gravidade).toBe('aviso');
    expect(a.titulo).toBe('Linhas mais finas que 0,25 pt');
    expect(a.detalhe).toContain('0,10 pt em CMYK 0/0/0/100: 1 traço (pág. 1)');
  });

  it('0,25 pt exatos: certo', async () => {
    expect(await alertas(linha(0.25))).toEqual([]);
  });

  it('0,24 pt: aviso', async () => {
    expect((await alertas(linha(0.24)))[0].id).toBe('linhas-finas');
  });

  it('espessura 0 (a mais fina do dispositivo) também conta', async () => {
    const [a] = await alertas(linha(0));
    expect(a.detalhe).toContain('0 pt');
  });

  it('espessuras normais: sem alerta', async () => {
    expect(await alertas(linha(0.5) + linha(1) + linha(3))).toEqual([]);
  });

  it('limite configurável', async () => {
    expect(await alertas(linha(0.3), {}, { linhaMinimaPt: 0.25 })).toEqual([]);
    expect((await alertas(linha(0.3), {}, { linhaMinimaPt: 0.5 }))[0].titulo).toBe('Linhas mais finas que 0,50 pt');
  });

  it('usa a espessura final, com a escala da matriz', async () => {
    // 0,4 × 0,5 = 0,2 pt
    expect((await alertas(`0.5 0 0 0.5 0 0 cm ${linha(0.4)}`))[0].id).toBe('linhas-finas');
    // 0,1 × 4 = 0,4 pt: certo
    expect(await alertas(`4 0 0 4 0 0 cm 0 0 0 1 K 0.1 w 1 1 m 20 1 l S`)).toEqual([]);
  });

  it('0,25 pt escritos em milímetros não disparam por erro de vírgula flutuante', async () => {
    // 0,0881944444444444 mm × (72/25,4) = 0,2499999999999999 pt em bruto
    const k = 72 / 25.4;
    expect(await alertas(`${k} 0 0 ${k} 0 0 cm 0 0 0 1 K 0.0881944444444444 w 3 17 m 28 17 l S`)).toEqual([]);
    // mas 0,2 pt em milímetros continua a ser fino
    expect((await alertas(`${k} 0 0 ${k} 0 0 cm 0 0 0 1 K 0.0705555555555 w 3 17 m 28 17 l S`))[0].id).toBe('linhas-finas');
  });

  it('contorno fino em texto também conta', async () => {
    const fontes = { F1: { tipo: 'incorporada' as const } };
    const [a] = await alertas('0 0 0 1 K 0.1 w BT /F1 20 Tf 1 Tr 10 10 Td (A) Tj ET', { fontes });
    expect(a.id).toBe('linhas-finas');
  });
});

describe('linhas finas — como se junta', () => {
  it('agrupa por espessura e cor, com contagem', async () => {
    const c = [linha(0.1), linha(0.1), linha(0.1), linha(0.15, '1 0 0 0 K')].join(' ');
    const [a] = await alertas(c);
    expect(a.detalhe).toContain('0,10 pt em CMYK 0/0/0/100: 3 traços');
    expect(a.detalhe).toContain('0,15 pt em CMYK 100/0/0/0: 1 traço');
  });

  it('lista as páginas', async () => {
    const pag = { ...BASE, conteudo: linha(0.1) };
    const a = alertasLinhasFinas(await analisarRaw(pag, { ...BASE, conteudo: '' }, pag), CFG_BASE);
    expect(a[0].detalhe).toContain('págs. 1, 3');
  });

  it('o destaque junta traços próximos e separa os distantes', async () => {
    const c = `0 0 0 1 K 0.1 w 10 10 m 40 10 l S 10 15 m 40 15 l S 10 200 m 40 200 l S`;
    const [a] = await alertas(c, { mediaMm: [150, 150] });
    expect(a.locais).toHaveLength(2);
  });
});

describe('linhas finas — o que NÃO deve apanhar (falsos positivos)', () => {
  const espacos = {
    CS0: { tipo: 'separation' as const, nome: 'cortante' },
    CS1: { tipo: 'separation' as const, nome: 'All' },
    CS2: { tipo: 'separation' as const, nome: 'PANTONE 485 C' },
  };

  it('faca (cortante) fina é o normal', async () => {
    expect(await alertas('/CS0 CS 1 SCN 0.1 w 10 50 m 80 50 l S', { espacos })).toEqual([]);
  });

  it('registo (All) não conta', async () => {
    expect(await alertas('/CS1 CS 1 SCN 0.1 w 10 50 m 80 50 l S', { espacos })).toEqual([]);
  });

  it('...mas uma Pantone normal fina conta (controlo)', async () => {
    expect((await alertas('/CS2 CS 1 SCN 0.1 w 10 50 m 80 50 l S', { espacos }))[0].id).toBe('linhas-finas');
  });

  it('tinta a 0% não imprime', async () => {
    expect(await alertas('/CS2 CS 0 SCN 0.1 w 10 50 m 80 50 l S', { espacos })).toEqual([]);
  });

  it('só preenchimentos: sem traços não há linhas', async () => {
    expect(await alertas('0 0 0 1 k 10 10 50 50 re f')).toEqual([]);
  });

  it('marcas de corte finas fora da área de produção', async () => {
    const pagina = { mediaMm: [110, 110] as [number, number], trimMm: [5, 5, 100, 100] as [number, number, number, number], bleedMm: [2, 2, 106, 106] as [number, number, number, number] };
    const marca = `0 0 0 1 K 0.1 w ${mm(5)} ${mm(-5 + 5)} m ${mm(5)} ${mm(1)} l S`; // dentro da margem, fora da BleedBox
    expect(await alertas(marca, pagina)).toEqual([]);
  });

  it('layer desligada por omissão', async () => {
    const camadas = { MC0: { nome: 'Rascunho', oculta: true } };
    expect(await alertas(`/OC /MC0 BDC ${linha(0.1)} EMC`, { camadas })).toEqual([]);
  });

  it('traço todo recortado', async () => {
    expect(await alertas(`0 0 5 5 re W n ${linha(0.1)}`)).toEqual([]);
  });

  it('texto invisível com contorno fino (OCR)', async () => {
    const fontes = { F1: { tipo: 'incorporada' as const } };
    expect(await alertas('0 0 0 1 K 0.1 w BT /F1 20 Tf 3 Tr 10 10 Td (A) Tj ET', { fontes })).toEqual([]);
  });
});
