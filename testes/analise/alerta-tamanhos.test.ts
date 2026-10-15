import { describe, expect, it } from 'vitest';
import { alertaTamanhosDiferentes } from '../../src/alertas/tamanhos-diferentes';
import { formatarPaginas } from '../../src/analise/resumo';

const a4 = { larguraMm: 210, alturaMm: 297 };
const a5 = { larguraMm: 148, alturaMm: 210 };

describe('alertaTamanhosDiferentes', () => {
  it('não alerta quando todas as páginas são iguais', () => {
    expect(alertaTamanhosDiferentes([a4, a4, a4], 0.5)).toEqual([]);
  });

  it('não alerta com uma só página', () => {
    expect(alertaTamanhosDiferentes([a4], 0.5)).toEqual([]);
  });

  it('não alerta com diferenças dentro da tolerância', () => {
    expect(alertaTamanhosDiferentes([a4, { larguraMm: 210.3, alturaMm: 297.4 }], 0.5)).toEqual([]);
  });

  it('alerta com A4 + A5, indica as páginas e salta para a primeira diferente', () => {
    const [alerta] = alertaTamanhosDiferentes([a4, a4, a5, a4], 0.5);
    expect(alerta.gravidade).toBe('aviso');
    expect(alerta.pagina).toBe(2);
    expect(alerta.detalhe).toContain('210,0 × 297,0 mm: págs. 1, 2, 4');
    expect(alerta.detalhe).toContain('148,0 × 210,0 mm: pág. 3');
  });
});

describe('formatarPaginas', () => {
  it('limita o número de intervalos e acaba em reticências', () => {
    expect(formatarPaginas([0, 2, 4, 6, 8, 10, 12], 3)).toBe('págs. 1, 3, 5…');
    expect(formatarPaginas([0, 2, 4], 3)).toBe('págs. 1, 3, 5');
  });
  it('uma página no singular', () => expect(formatarPaginas([0])).toBe('pág. 1'));
  it('duas seguidas não viram intervalo', () => expect(formatarPaginas([0, 1])).toBe('págs. 1, 2'));
  it('três ou mais seguidas viram intervalo', () => expect(formatarPaginas([0, 1, 2, 3])).toBe('págs. 1–4'));
  it('mistura de saltos e intervalos', () => expect(formatarPaginas([0, 2, 3, 4, 6])).toBe('págs. 1, 3–5, 7'));
  it('ordena e remove duplicados', () => expect(formatarPaginas([4, 0, 0, 2])).toBe('págs. 1, 3, 5'));
});
