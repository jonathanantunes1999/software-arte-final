import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos: é o código da casca, partilhado com o teste
import { iconeDaBandeja, modeloDoMenu, pdfsSoltos } from '../electron/bandeja.mjs';

const PASTA = new URL('../electron/icones/', import.meta.url).pathname;

/** Largura e altura de um PNG (estão no cabeçalho) */
function medidasPng(caminho: string) {
  const b = readFileSync(caminho);
  expect(String.fromCharCode(b[1], b[2], b[3])).toBe('PNG');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { l: v.getUint32(16), a: v.getUint32(20) };
}

describe('bandeja: ícone', () => {
  it('macOS usa o ícone "template" (o nome acaba em Template: o sistema pinta-o), Windows e Linux o ícone a cores', () => {
    expect(iconeDaBandeja('darwin', '/x')).toEqual({ caminho: '/x/bandeja-Template.png', modelo: true });
    expect(iconeDaBandeja('win32', '/x')).toEqual({ caminho: '/x/bandeja-win.png', modelo: false });
    expect(iconeDaBandeja('linux', '/x').modelo).toBe(false);
  });

  it('os ficheiros existem, com o tamanho certo e a versão @2x ao lado (o Electron escolhe-a sozinho)', () => {
    for (const [nome, px] of [['bandeja-Template', 18], ['bandeja-win', 16]] as const) {
      expect(existsSync(`${PASTA}${nome}.png`)).toBe(true);
      expect(medidasPng(`${PASTA}${nome}.png`)).toEqual({ l: px, a: px });
      expect(medidasPng(`${PASTA}${nome}@2x.png`)).toEqual({ l: px * 2, a: px * 2 });
    }
  });

  it('o ícone da app tem 1024 px (daqui saem o .icns e o .ico)', () => {
    expect(medidasPng(new URL('../build/icon.png', import.meta.url).pathname)).toEqual({ l: 1024, a: 1024 });
  });
});

describe('bandeja: largar ficheiros no ícone', () => {
  it('só se aceitam PDF, sem distinguir maiúsculas, pela ordem em que vieram', () => {
    expect(pdfsSoltos(['/a/b.txt', '/a/c.PDF', '/a/d.pdf', '/a/e.pdf.exe'])).toEqual(['/a/c.PDF', '/a/d.pdf']);
  });
  it('lixo não rebenta', () => {
    expect(pdfsSoltos(undefined)).toEqual([]);
    expect(pdfsSoltos([null, 3, {}] as never)).toEqual([]);
  });
});

describe('bandeja: menu do botão direito', () => {
  const acoes = { alternar: () => 'alternar', abrirPdf: () => 'abrir', manterNaBandeja: () => {}, sair: () => 'sair' };

  it('o primeiro item diz o que o clique vai fazer', () => {
    expect(modeloDoMenu({ visivel: true, manterNaBandeja: true }, acoes)[0].label).toBe('Esconder o Arte Final');
    expect(modeloDoMenu({ visivel: false, manterNaBandeja: true }, acoes)[0].label).toBe('Abrir o Arte Final');
  });

  it('tem Abrir PDF, a opção de manter na bandeja (com o estado certo) e Sair, ligados às ações', () => {
    const m = modeloDoMenu({ visivel: false, manterNaBandeja: false }, acoes);
    expect(m.map((i: { label?: string }) => i.label ?? '-')).toEqual(['Abrir o Arte Final', 'Abrir PDF…', '-', 'Fechar a janela deixa a app na bandeja', '-', 'Sair do Arte Final']);
    const manter = m[3];
    expect(manter.type).toBe('checkbox');
    expect(manter.checked).toBe(false);
    expect(m[1].click).toBe(acoes.abrirPdf);
    expect(m[5].click).toBe(acoes.sair);
  });

  it('mudar a opção chama a ação com o valor novo', () => {
    let visto: boolean | null = null;
    const m = modeloDoMenu({ visivel: true, manterNaBandeja: true }, { ...acoes, manterNaBandeja: (v: boolean) => (visto = v) });
    m[3].click?.({ checked: false });
    expect(visto).toBe(false);
  });
});
