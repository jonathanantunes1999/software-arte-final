import { describe, expect, it } from 'vitest';
import type { Alerta } from '../../src/alertas/tipos';
import { montarContexto, paginasDoAlerta } from '../../src/assistente/contexto';
import { formatar, partirNegrito } from '../../src/assistente/formatar';
import type { Inventario } from '../../src/correcoes/inventario';
import { PERFIL_OMISSAO } from '../../src/mascote/personalizacao';

const caixa = { x: 0, y: 0, largura: 1, altura: 1 } as never;
const alerta = (id: string, extra: Partial<Alerta> = {}): Alerta => ({ id, gravidade: 'erro', titulo: id, ...extra });

describe('assistente: contexto', () => {
  it('páginas do alerta: 1-based, sem repetidas, por ordem; sem locais usa a página', () => {
    expect(paginasDoAlerta(alerta('a', { locais: [{ pagina: 2, caixa }, { pagina: 0, caixa }, { pagina: 2, caixa }] }))).toEqual([1, 3]);
    expect(paginasDoAlerta(alerta('a', { pagina: 4 }))).toEqual([5]);
    expect(paginasDoAlerta(alerta('a'))).toEqual([]);
  });

  it('monta a fotografia: alertas com a correção que os resolve, inventário em números e ficheiro em 1-based', () => {
    const inv: Inventario = {
      spots: [{ nome: 'A', objetos: 1, paginas: [0] }],
      juncoesSugeridas: [{ de: 'a', para: 'A' }],
      coresDeTraco: [{ valores: [0, 1, 0, 0], objetos: 3, espessuraMediaPt: 0.5 }],
      overprint: { branco: 1, pretoTexto: 2, pretoLinha: 3, spotsTecnicas: 4 },
      fontes: [
        { id: '1 0 R', nome: 'A', convertivel: true },
        { id: '2 0 R', nome: 'B', convertivel: false, motivo: 'fonte não incorporada' },
        { id: '3 0 R', nome: 'C', convertivel: false, motivo: 'fonte Type 1 (FontFile)' },
      ],
      rgb: { vetores: 5, imagens: 6 },
    };
    const c = montarContexto({ nome: 'x.pdf', paginas: 3, pagina: 1, alertas: [alerta('sangria-ausente', { pagina: 0 }), alerta('qualquer-coisa', { gravidade: 'info' })], inventario: inv, paginasSemSangria: 2, sangriaMm: 3, corrigido: false, desktop: true, mascote: PERFIL_OMISSAO, temFicheiro: true });
    expect(c.ficheiro).toEqual({ nome: 'x.pdf', paginas: 3, pagina: 2 });
    expect(c.alertas[0]).toMatchObject({ id: 'sangria-ausente', correcao: 'sangria', paginas: [1] });
    expect(c.alertas[1].correcao).toBeNull();
    expect(c.inventario).toMatchObject({ rgbVetores: 5, rgbImagens: 6, spots: 1, facas: 1, fontesConvertiveis: ['1 0 R'], fontesTotal: 3, fontesNaoIncorporadas: 1 });
    expect(c.inventario?.overprint).toEqual({ branco: 1, pretoTexto: 2, pretoLinha: 3, spotsTecnicas: 4 });
    // é uma cópia: mexer nela não mexe no inventário da app
    c.inventario!.juncoes[0].de = 'mudou';
    expect(inv.juncoesSugeridas[0].de).toBe('a');
  });

  it('sem ficheiro nem inventário', () => {
    const c = montarContexto({ nome: '', paginas: 0, pagina: 0, alertas: [], inventario: null, paginasSemSangria: 0, sangriaMm: 3, corrigido: false, desktop: false, mascote: PERFIL_OMISSAO, temFicheiro: false });
    expect(c.ficheiro).toBeNull();
    expect(c.inventario).toBeNull();
  });
});

describe('assistente: formatar', () => {
  it('negrito só entre ** **; um ** solto não fica negrito', () => {
    expect(partirNegrito('a **b** c')).toEqual([{ texto: 'a ', negrito: false }, { texto: 'b', negrito: true }, { texto: ' c', negrito: false }]);
    expect(partirNegrito('a **b c')).toEqual([{ texto: 'a ', negrito: false }, { texto: 'b c', negrito: false }]);
    expect(partirNegrito('')).toEqual([]);
  });

  it('parágrafos e linhas', () => {
    const p = formatar('um\ndois\n\n\n**três**');
    expect(p).toHaveLength(2);
    expect(p[0]).toHaveLength(2);
    expect(p[1][0][0]).toEqual({ texto: 'três', negrito: true });
  });

  it('marcação HTML no texto continua a ser texto (a interface nunca a interpreta)', () => {
    const p = formatar('<img src=x onerror=alert(1)> **<b>x</b>**');
    expect(p[0][0].map((x) => x.texto).join('')).toBe('<img src=x onerror=alert(1)> <b>x</b>');
  });
});
