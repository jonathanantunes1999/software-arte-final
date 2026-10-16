import { describe, expect, it } from 'vitest';
import { correcaoDoAlerta } from '../src/alertas/correcao-sugerida';

describe('correção sugerida por alerta', () => {
  it('sangria, overprint, spots, faca e fontes têm correção', () => {
    expect(correcaoDoAlerta('sangria-ausente')?.tipo).toBe('sangria');
    expect(correcaoDoAlerta('sangria-curta')?.tipo).toBe('sangria');
    expect(correcaoDoAlerta('overprint-branco')?.tipo).toBe('overprint-branco');
    expect(correcaoDoAlerta('overprint-preto-desligado')?.tipo).toBe('overprint-preto');
    expect(correcaoDoAlerta('overprint-spots-tecnicas')?.tipo).toBe('overprint-spots');
    expect(correcaoDoAlerta('spots-duplicadas')?.tipo).toBe('juntar-spots');
    expect(correcaoDoAlerta('faca-em-processo')?.tipo).toBe('faca-em-spot');
    expect(correcaoDoAlerta('texto-em-fonte')?.tipo).toBe('curvas');
    expect(correcaoDoAlerta('rgb')?.tipo).toBe('rgb-cmyk');
  });

  it('o que não se corrige sozinho não tem botão (RGB, resolução, QR, texto…)', () => {
    for (const id of ['resolucao-baixa', 'qr-codes', 'tinta-total', 'zona-seguranca', 'fonte-nao-incorporada', 'texto-brasileirismo', 'inexistente']) {
      expect(correcaoDoAlerta(id)).toBeNull();
    }
  });
});
