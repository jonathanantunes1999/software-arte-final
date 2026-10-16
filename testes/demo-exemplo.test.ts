import { describe, expect, it } from 'vitest';
import { calcularAlertas } from '../src/alertas/registo';
import { analisarDocumento } from '../src/analise/analisador';
import { abrirPdf } from '../src/analise/documento';
import { gerarExemplo } from '../src/demo/exemplo';
import { CFG_BASE } from './fixtures/analisar';

describe('PDF de exemplo', () => {
  it('é um PDF de 100 × 150 mm com os problemas postos de propósito', async () => {
    const bytes = await gerarExemplo();
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe('%PDF-');
    const doc = await abrirPdf(bytes);
    const analise = analisarDocumento(doc);
    expect(analise.paginas).toHaveLength(1);
    expect(analise.paginas[0].info.larguraMm).toBeCloseTo(100, 1);
    expect(analise.paginas[0].info.alturaMm).toBeCloseTo(150, 1);
    const ids = calcularAlertas(analise, CFG_BASE).map((a) => a.id);
    for (const esperado of ['sangria-ausente', 'rgb', 'resolucao-baixa', 'fonte-nao-incorporada', 'preto-rico-texto-pequeno', 'linhas-finas', 'overprint-branco']) {
      expect(ids, esperado).toContain(esperado);
    }
  });

  it('é determinístico no que importa: duas gerações dão os mesmos alertas', async () => {
    const a = calcularAlertas(analisarDocumento(await abrirPdf(await gerarExemplo())), CFG_BASE).map((x) => x.id);
    const b = calcularAlertas(analisarDocumento(await abrirPdf(await gerarExemplo())), CFG_BASE).map((x) => x.id);
    expect(a).toEqual(b);
  });
});
