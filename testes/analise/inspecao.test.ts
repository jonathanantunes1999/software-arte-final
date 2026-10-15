import { describe, expect, it } from 'vitest';
import { inspecionarPagina, prepararInspecao } from '../../src/analise/analisador';
import { abrirPdf } from '../../src/analise/documento';
import { lerPaginas } from '../../src/analise/documento';
import { lerToque, objetosEm, valoresDaCor } from '../../src/analise/inspecao';
import { BASE } from '../fixtures/analisar';
import { gerarPdfRaw, type PaginaRaw } from '../fixtures/gerar';

const ESTADOS = {
  GS0: { OP: false, op: false },
  GS1: { OP: true, op: true, OPM: 1 },
  GS2: { OP: true, op: true, OPM: 0 },
};
const ESPACOS = {
  CS0: { tipo: 'separation' as const, nome: 'cortante' },
  CS1: { tipo: 'separation' as const, nome: 'PANTONE 485 C' },
};

async function ler(conteudo: string, extra: Partial<PaginaRaw> = {}, ocultos?: (c: string[]) => Set<string>) {
  const pdf = await abrirPdf(await gerarPdfRaw([{ ...BASE, estados: ESTADOS, espacos: ESPACOS, conteudo, fontes: { F1: { tipo: 'incorporada' as const } }, ...extra }]));
  const ctx = prepararInspecao(pdf, lerPaginas(pdf));
  const ir = inspecionarPagina(ctx, 0, ocultos ? ocultos([...ctx.ocgPorOmissao]) : undefined);
  return { ir, ctx };
}

describe('leitor de cor — hit-test', () => {
  it('apanha o objeto de cima e depois o de baixo', async () => {
    const { ir } = await ler('1 0 0 0 k 0 0 200 200 re f 0 1 0 0 k 50 50 50 50 re f');
    const t = objetosEm(ir.eventos, 60, 60);
    expect(t).toHaveLength(2);
    expect(t[0].evento.cor?.valores).toEqual([0, 1, 0, 0]);
    expect(t[1].evento.cor?.valores).toEqual([1, 0, 0, 0]);
    expect(objetosEm(ir.eventos, 10, 10)).toHaveLength(1);
  });

  it('fora de qualquer objeto não há nada', async () => {
    const { ir } = await ler('0 1 0 0 k 50 50 50 50 re f');
    expect(objetosEm(ir.eventos, 10, 10)).toEqual([]);
    expect(objetosEm(ir.eventos, 110, 110)).toEqual([]);
  });

  it('moldura (re + re, f*) tem buraco: o centro apanha o que está por baixo', async () => {
    const { ir } = await ler('1 0 0 0 k 0 0 200 200 re f 0 1 0 0 k 20 20 100 100 re 40 40 60 60 re f*');
    expect(objetosEm(ir.eventos, 70, 70).map((t) => t.evento.cor?.valores[0])).toEqual([1]);
    expect(objetosEm(ir.eventos, 25, 25)[0].evento.cor?.valores[1]).toBe(1);
  });

  it('enrolamento: contorno interior no mesmo sentido não faz buraco', async () => {
    const { ir } = await ler('0 1 0 0 k 20 20 100 100 re 40 40 60 60 re f');
    expect(objetosEm(ir.eventos, 70, 70)).toHaveLength(1);
  });

  it('triângulo: a caixa não conta', async () => {
    const { ir } = await ler('0 0 1 0 k 10 10 m 110 10 l 10 110 l f');
    expect(objetosEm(ir.eventos, 20, 20)).toHaveLength(1);
    expect(objetosEm(ir.eventos, 100, 100)).toHaveLength(0);
  });

  it('círculo de Bézier: dentro sim, no canto da caixa não', async () => {
    const k = 0.5523 * 40;
    const { ir } = await ler(`0 1 1 0 k 90 50 m 90 ${50 + k} ${50 + k} 90 50 90 c ${50 - k} 90 10 ${50 + k} 10 50 c 10 ${50 - k} ${50 - k} 10 50 10 c ${50 + k} 10 90 ${50 - k} 90 50 c f`);
    expect(objetosEm(ir.eventos, 50, 50)).toHaveLength(1);
    expect(objetosEm(ir.eventos, 14, 14)).toHaveLength(0);
  });

  it('traço: só apanha perto da linha', async () => {
    const { ir } = await ler('0 0 0 1 K 4 w 10 50 m 90 50 l S', {});
    expect(objetosEm(ir.eventos, 50, 51.5, 0)).toHaveLength(1);
    expect(objetosEm(ir.eventos, 50, 53, 0)).toHaveLength(0);
    // com tolerância apanha-se uma linha fina
    const { ir: fina } = await ler('0 0 0 1 K 0.25 w 10 50 m 90 50 l S');
    expect(objetosEm(fina.eventos, 50, 51, 0)).toHaveLength(0);
    expect(objetosEm(fina.eventos, 50, 51, 1.5)).toHaveLength(1);
  });

  it('retângulo só com traço: o interior não conta', async () => {
    const { ir } = await ler('0 0 0 1 K 1 w 20 20 60 60 re S');
    expect(objetosEm(ir.eventos, 50, 50, 0)).toHaveLength(0);
    expect(objetosEm(ir.eventos, 20, 50, 0)).toHaveLength(1);
  });

  it('caminho aberto não fecha: o lado em falta não conta', async () => {
    const { ir } = await ler('0 0 0 1 K 1 w 20 20 m 80 20 l 80 80 l S');
    expect(objetosEm(ir.eventos, 50, 50, 0.4)).toHaveLength(0); // a diagonal que fecharia o triângulo
    const { ir: ir2 } = await ler('0 0 0 1 K 1 w 20 20 m 80 20 l 80 80 l s');
    expect(objetosEm(ir2.eventos, 50, 50, 0.4)).toHaveLength(1); // s fecha o caminho
  });

  it('h fecha o caminho para o traço', async () => {
    const { ir } = await ler('0 0 0 1 K 1 w 20 20 m 80 20 l 80 80 l h S');
    expect(objetosEm(ir.eventos, 50, 50, 0.4)).toHaveLength(1);
  });

  it('preenchimento + traço: o interior só apanha o preenchimento, a borda apanha os dois', async () => {
    const { ir } = await ler('1 0 0 0 k 0 1 0 0 K 4 w 20 20 60 60 re B');
    expect(objetosEm(ir.eventos, 50, 50, 0)[0]).toMatchObject({ preenchimento: true, traco: false });
    expect(objetosEm(ir.eventos, 20, 50, 0)[0]).toMatchObject({ preenchimento: true, traco: true });
  });

  it('o recorte limita: fora do clip não se apanha', async () => {
    const { ir } = await ler('q 0 0 50 50 re W n 1 0 0 0 k 0 0 100 100 re f Q');
    expect(objetosEm(ir.eventos, 25, 25)).toHaveLength(1);
    expect(objetosEm(ir.eventos, 75, 75)).toHaveLength(0);
  });

  it('texto conta pela caixa; texto invisível (Tr 3) não conta', async () => {
    const { ir } = await ler('0 0 0 1 k BT /F1 20 Tf 10 10 Td (Ola) Tj ET');
    const t = objetosEm(ir.eventos, 15, 15);
    expect(t).toHaveLength(1);
    expect(lerToque(t[0]).objeto).toBe('Texto');
    const { ir: ir2 } = await ler('0 0 0 1 k BT /F1 20 Tf 3 Tr 10 10 Td (Ola) Tj ET');
    expect(objetosEm(ir2.eventos, 15, 15)).toEqual([]);
  });

  it('layers desligadas por omissão não aparecem; ligá-las faz aparecer', async () => {
    const camadas = { MC0: { nome: 'Faca', oculta: true } };
    const conteudo = '/OC /MC0 BDC 1 0 0 0 k 0 0 100 100 re f EMC';
    const { ir } = await ler(conteudo, { camadas });
    expect(objetosEm(ir.eventos, 50, 50)).toEqual([]);
    expect(ir.camadas).toEqual([expect.objectContaining({ nome: 'Faca', desligada: true })]);
    const { ir: ligada } = await ler(conteudo, { camadas }, () => new Set());
    expect(objetosEm(ligada.eventos, 50, 50)).toHaveLength(1);
  });
});

describe('leitor de cor — leitura', () => {
  it('CMYK com overprint em modo 1: ligado', async () => {
    const { ir } = await ler('/GS1 gs 0 0 0 1 k 0 0 100 100 re f');
    const l = lerToque(objetosEm(ir.eventos, 50, 50)[0]);
    expect(l.partes).toHaveLength(1);
    expect(l.partes[0]).toMatchObject({ parte: 'Preenchimento', valores: 'C 0 · M 0 · Y 0 · K 100', overprint: 'ligado' });
  });

  it('CMYK com overprint em modo 0: ligado mas sem efeito', async () => {
    const { ir } = await ler('/GS2 gs 0 0 0 1 k 0 0 100 100 re f');
    expect(lerToque(objetosEm(ir.eventos, 50, 50)[0]).partes[0].overprint).toBe('sem-efeito');
  });

  it('sem overprint: desligado', async () => {
    const { ir } = await ler('0 0 0 1 k 0 0 100 100 re f');
    expect(lerToque(objetosEm(ir.eventos, 50, 50)[0]).partes[0].overprint).toBe('desligado');
  });

  it('spot: nome e percentagem; overprint conta mesmo em modo 0', async () => {
    const { ir } = await ler('/GS2 gs /CS1 cs 0.6 scn 0 0 100 100 re f');
    const p = lerToque(objetosEm(ir.eventos, 50, 50)[0]).partes[0];
    expect(p.valores).toBe('PANTONE 485 C · 60%');
    expect(p.overprint).toBe('ligado');
    expect(p.amostra).toBeUndefined();
  });

  it('preenchimento e traço de cores diferentes, cada um com o seu overprint', async () => {
    const { ir } = await ler('/GS1 gs 1 0 0 0 k /CS0 CS 1 SCN 5 w 20 20 60 60 re B');
    const l = lerToque(objetosEm(ir.eventos, 20, 50, 0)[0]);
    expect(l.partes.map((p) => p.parte)).toEqual(['Preenchimento', 'Traço']);
    expect(l.partes[1].valores).toBe('cortante · 100%');
  });

  it('formatação de valores', () => {
    expect(valoresDaCor({ familia: 'CMYK', valores: [0.125, 0, 1, 0.5] })).toBe('C 12,5 · M 0 · Y 100 · K 50');
    expect(valoresDaCor({ familia: 'RGB', valores: [1, 0, 0.5] })).toBe('RGB 255 · 0 · 128');
    expect(valoresDaCor({ familia: 'Gray', valores: [0.25] })).toBe('Cinzento · K 75%');
  });
});
