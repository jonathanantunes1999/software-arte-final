import { describe, expect, it } from 'vitest';
import { analisarDocumento, prepararInspecao } from '../../src/analise/analisador';
import { abrirPdf, lerPaginas } from '../../src/analise/documento';
import { alertasTintaImagens, medirTintaDasImagens } from '../../src/alertas/tinta-imagens';
import type { ConfigAlertas } from '../../src/alertas/tipos';
import { BASE, CFG_BASE } from '../fixtures/analisar';
import { gerarPdfRaw, type ImagemSpec } from '../fixtures/gerar';

async function correr(imagens: Record<string, ImagemSpec>, conteudo: string, cfg: Partial<ConfigAlertas> = {}) {
  const pdf = await abrirPdf(await gerarPdfRaw([{ ...BASE, imagens, conteudo }]));
  const a = analisarDocumento(pdf);
  const c = prepararInspecao(pdf, lerPaginas(pdf));
  const medidas = medirTintaDasImagens(c, a);
  return { medidas, alertas: alertasTintaImagens(a, medidas, { ...CFG_BASE, ...cfg }) };
}
const COLOCA = 'q 100 0 0 100 10 10 cm /Im0 Do Q';
const cmyk = (dados: number[]): ImagemSpec => ({ larguraPx: dados.length / 4, alturaPx: 1, espaco: 'CMYK', dados });

describe('tinta total em imagens CMYK', () => {
  it('mede o pixel com mais tinta', async () => {
    const { medidas } = await correr({ Im0: cmyk([255, 255, 255, 255, 0, 0, 0, 0, 51, 51, 51, 51]) }, COLOCA);
    expect([...medidas.values()]).toEqual([400]);
  });

  it('acima do limite: aviso com a percentagem e as páginas; 400% é erro', async () => {
    const { alertas } = await correr({ Im0: cmyk([255, 204, 204, 204]) }, COLOCA); // 330%
    expect(alertas[0]).toMatchObject({ id: 'tinta-total-imagens', gravidade: 'aviso', titulo: 'Imagens com tinta a mais' });
    expect(alertas[0].detalhe).toContain('1 imagem CMYK passa de 300% de tinta total, até 330%');
    expect(alertas[0].locais).toHaveLength(1);
    const { alertas: e } = await correr({ Im0: cmyk([255, 255, 255, 255]) }, COLOCA);
    expect(e[0].gravidade).toBe('erro');
  });

  it('dentro do limite, nada; 0 desliga', async () => {
    expect((await correr({ Im0: cmyk([153, 102, 102, 255]) }, COLOCA)).alertas).toEqual([]); // 240%
    expect((await correr({ Im0: cmyk([255, 255, 255, 255]) }, COLOCA, { tintaTotalMaxPercent: 0 })).alertas).toEqual([]);
  });

  it('imagens RGB e cinzento não se medem', async () => {
    const { medidas } = await correr({ Im0: { larguraPx: 1, alturaPx: 1, espaco: 'RGB', dados: [0, 0, 0] } }, COLOCA);
    expect(medidas.size).toBe(0);
  });

  it('imagem ilegível (dados a menos): fica como null e não dá alerta', async () => {
    const { medidas, alertas } = await correr({ Im0: { larguraPx: 4, alturaPx: 4, espaco: 'CMYK', dados: [1, 2, 3] } }, COLOCA);
    expect([...medidas.values()]).toEqual([null]);
    expect(alertas).toEqual([]);
  });

  it('a mesma imagem usada duas vezes mede-se uma vez e conta duas', async () => {
    const { medidas, alertas } = await correr({ Im0: cmyk([255, 255, 255, 200]) }, `${COLOCA} ${COLOCA}`);
    expect(medidas.size).toBe(1);
    expect(alertas[0].detalhe).toContain('1 imagem CMYK');
  });
});
