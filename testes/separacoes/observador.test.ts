import { describe, expect, it } from 'vitest';
import { observar, type Registo } from '../fixtures/observar';

const fatia = (r: Registo, fluxos: Map<string, { texto: string }>) => fluxos.get(r.fluxo)!.texto.slice(r.inicio, r.fim);
const FONTES = { F1: { tipo: 'incorporada' as const } };
const ESPACOS = {
  CS0: { tipo: 'separation' as const, nome: 'PANTONE 485 C' },
};

describe('observador do interpretador', () => {
  it('cada operador de cor chega com a posição e a cor resultante', async () => {
    const { registos, fluxos } = await observar({ conteudo: '1 0 0 0 k 0.5 G 0 1 0 rg' });
    expect(registos.map((r) => fatia(r, fluxos))).toEqual(['1 0 0 0 k', '0.5 G', '0 1 0 rg']);
    expect(registos[0].o).toMatchObject({ tipo: 'cor', alvo: 'fill', cor: { familia: 'CMYK', valores: [1, 0, 0, 0] } });
    expect(registos[1].o).toMatchObject({ tipo: 'cor', alvo: 'traco', cor: { familia: 'Gray', valores: [0.5] } });
    expect(registos[2].o).toMatchObject({ tipo: 'cor', alvo: 'fill', cor: { familia: 'RGB' } });
  });

  it('cs/CS dão a cor inicial do espaço; scn dá o valor', async () => {
    const { registos, fluxos } = await observar({ espacos: ESPACOS, conteudo: '/CS0 cs 0.4 scn /CS0 CS 1 SCN' });
    expect(registos.map((r) => fatia(r, fluxos))).toEqual(['/CS0 cs', '0.4 scn', '/CS0 CS', '1 SCN']);
    expect(registos[0].o).toMatchObject({ cor: { familia: 'Separation', valores: [1], nomes: ['PANTONE 485 C'] } });
    expect(registos[1].o).toMatchObject({ cor: { valores: [0.4] } });
    expect(registos[2].o).toMatchObject({ alvo: 'traco' });
  });

  it('pintura de caminhos: estado de overprint e opacidade no momento de pintar', async () => {
    const { registos, fluxos } = await observar({
      estados: { GS1: { OP: true, op: false, OPM: 1, ca: 0.5, CA: 0.25 } },
      conteudo: '0 0 0 1 k 1 0 0 0 K /GS1 gs 10 10 50 50 re B',
    });
    const p = registos.filter((r) => r.o.tipo === 'pintar');
    expect(p).toHaveLength(1);
    expect(fatia(p[0], fluxos)).toBe('B');
    expect(p[0].o).toMatchObject({ objeto: 'caminho', preenche: true, traca: true, overprintFill: false, overprintTraco: true, modo: 1, ca: 0.5, CA: 0.25, oculto: false });
  });

  it('n (só recorte) não é uma pintura', async () => {
    const { registos } = await observar({ conteudo: '0 0 50 50 re W n' });
    expect(registos.filter((r) => r.o.tipo === 'pintar')).toEqual([]);
  });

  it('texto: preenchimento ou traço conforme o modo de renderização', async () => {
    const { registos, fluxos } = await observar({ fontes: FONTES, conteudo: 'BT /F1 12 Tf 10 10 Td (A) Tj 1 Tr [(B)] TJ ET' });
    const p = registos.filter((r) => r.o.tipo === 'pintar');
    expect(p.map((r) => fatia(r, fluxos))).toEqual(['(A) Tj', '[(B)] TJ']);
    expect(p[0].o).toMatchObject({ objeto: 'texto', preenche: true, traca: false });
    expect(p[1].o).toMatchObject({ objeto: 'texto', preenche: false, traca: true });
  });

  it('layer desligada: as pinturas chegam marcadas como ocultas', async () => {
    const { registos } = await observar({
      camadas: { MC0: { nome: 'Faca', oculta: true } },
      conteudo: '/OC /MC0 BDC 0 0 50 50 re f EMC 0 0 10 10 re f',
    });
    expect(registos.filter((r) => r.o.tipo === 'pintar').map((r) => (r.o as { oculto: boolean }).oculto)).toEqual([true, false]);
  });

  it('formulários: Do chega como pintura de form; o conteúdo do form tem o seu próprio fluxo', async () => {
    const { registos, fluxos } = await observar({
      formularios: { Fm0: { conteudo: '0 1 0 0 k 0 0 20 20 re f' } },
      conteudo: '/Fm0 Do 1 0 0 0 k 0 0 5 5 re f',
    });
    expect(fluxos.size).toBe(2);
    const doForm = registos.find((r) => r.o.tipo === 'pintar' && r.o.objeto === 'form')!;
    expect(doForm.fluxo).toBe('pagina');
    expect(doForm.o).toMatchObject({ recurso: 'Fm0', oculto: false });
    const dentro = registos.filter((r) => r.fluxo !== 'pagina');
    expect(dentro.map((r) => fluxos.get(r.fluxo)!.texto.slice(r.inicio, r.fim))).toEqual(['0 1 0 0 k', 'f']);
  });

  it('form dentro de layer desligada: o Do vem como oculto e o conteúdo não é visitado', async () => {
    const { registos, fluxos } = await observar({
      camadas: { MC0: { nome: 'Faca', oculta: true } },
      formularios: { Fm0: { conteudo: '0 1 0 0 k 0 0 20 20 re f' } },
      conteudo: '/OC /MC0 BDC /Fm0 Do EMC',
    });
    expect(fluxos.size).toBe(1);
    expect(registos.find((r) => r.o.tipo === 'pintar' && r.o.objeto === 'form')?.o).toMatchObject({ oculto: true });
  });

  it('imagens, máscaras, inline e degradés', async () => {
    const { registos } = await observar({
      imagens: { Im0: { larguraPx: 2, alturaPx: 2, espaco: 'CMYK' }, Im1: { larguraPx: 2, alturaPx: 2, espaco: 'Gray', mascara: true } },
      conteudo: '/Im0 Do /Im1 Do q 10 0 0 10 0 0 cm BI /W 1 /H 1 /BPC 8 /CS /G ID \x00 EI Q /Sh0 sh',
    });
    const p = registos.filter((r) => r.o.tipo === 'pintar').map((r) => r.o as { objeto: string; recurso?: string; mascara?: boolean });
    expect(p.map((x) => x.objeto)).toEqual(['imagem', 'imagem', 'imagem-inline', 'shading']);
    expect(p[0]).toMatchObject({ recurso: 'Im0', mascara: false });
    expect(p[1]).toMatchObject({ recurso: 'Im1', mascara: true });
    expect(p[3]).toMatchObject({ recurso: 'Sh0' });
  });

  it('a cor da pintura é a vigente, mesmo com q/Q pelo meio', async () => {
    const { registos } = await observar({ conteudo: '0 0 0 1 k q 1 0 0 0 k Q 10 10 20 20 re f' });
    const p = registos.find((r) => r.o.tipo === 'pintar')!.o as { cor?: { valores: number[] } };
    expect(p.cor?.valores).toEqual([0, 0, 0, 1]);
  });
});
