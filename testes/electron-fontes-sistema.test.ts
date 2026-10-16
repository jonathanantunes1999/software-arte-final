import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lerPrograma } from '../src/texto/programa';
// @ts-expect-error módulo .mjs sem tipos: é o código da casca, partilhado com o teste
import { analisarNome, carregarFace, escolherFace, extrairFace, indexarFontes, lerFacesDoFicheiro, pastasDeFontes, procurarFontes } from '../electron/fontes-sistema.mjs';

const fx = (f: string) => path.resolve(__dirname, 'fixtures', 'fontes', f);

interface Face {
  caminho: string;
  indice: number;
  familia: string;
  familiaCompat: string;
  estilo: string;
  completo: string;
  postscript: string;
}
const face = (familia: string, estilo: string, postscript: string, completo = `${familia} ${estilo}`): Face => ({ caminho: '/x', indice: 0, familia, familiaCompat: familia, estilo, completo, postscript });

describe('fontes do sistema: ler o que está instalado', () => {
  const raiz = mkdtempSync(path.join(os.tmpdir(), 'arte-fontes-'));
  afterAll(() => rmSync(raiz, { recursive: true, force: true }));
  mkdirSync(path.join(raiz, 'Supplemental', 'fundo'), { recursive: true });
  copyFileSync(fx('colecao.ttc'), path.join(raiz, 'Helvetica.ttc'));
  copyFileSync(fx('verdana.ttf'), path.join(raiz, 'Supplemental', 'Verdana.ttf'));
  copyFileSync(fx('centurygothic-bold.ttf'), path.join(raiz, 'Supplemental', 'fundo', 'GOTHICB.TTF'));
  copyFileSync(fx('teste.cff'), path.join(raiz, 'nao-e-fonte.ttf')); // lixo com extensão de fonte

  it('lê as faces de uma coleção (.ttc) com nomes e estilos', () => {
    const faces: Face[] = lerFacesDoFicheiro(path.join(raiz, 'Helvetica.ttc'));
    expect(faces.map((f) => f.postscript)).toEqual(['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique', 'Helvetica-Light']);
    expect(faces[3]).toMatchObject({ familia: 'Helvetica', estilo: 'Bold Oblique', indice: 3 });
  });

  it('um ficheiro que não é fonte (ou não existe) dá lista vazia, sem rebentar', () => {
    expect(lerFacesDoFicheiro(path.join(raiz, 'nao-e-fonte.ttf'))).toEqual([]);
    expect(lerFacesDoFicheiro(path.join(raiz, 'nao-existe.ttf'))).toEqual([]);
  });

  it('indexa pastas inclusive subpastas, e ignora as que não existem', () => {
    const faces: Face[] = indexarFontes([raiz, path.join(raiz, 'não-existe')]);
    expect(faces).toHaveLength(7);
    expect(faces.map((f) => f.postscript)).toContain('CenturyGothic-Bold');
    expect(faces.map((f) => f.postscript)).toContain('Verdana');
  });

  it('extrai uma face de um TTC como fonte autónoma que o leitor de fontes da app abre', () => {
    const faces: Face[] = lerFacesDoFicheiro(path.join(raiz, 'Helvetica.ttc'));
    const bytes = carregarFace(faces[1]) as Uint8Array;
    expect(String.fromCharCode(...bytes.subarray(0, 4))).not.toBe('ttcf');
    const r = lerPrograma(bytes, 'sfnt');
    if (!('ok' in r)) throw new Error(r.erro);
    expect(r.ok.numGlifos).toBe(6);
    expect(r.ok.contorno(r.ok.porNome('A')!).length).toBeGreaterThan(3);
    // as outras faces também (as tabelas são partilhadas no ficheiro)
    for (const f of faces) expect('ok' in lerPrograma(carregarFace(f), 'sfnt')).toBe(true);
  });

  it('a face extraída tem o nome certo quando se volta a ler', () => {
    const faces: Face[] = lerFacesDoFicheiro(path.join(raiz, 'Helvetica.ttc'));
    const solta = path.join(raiz, 'solta.ttf');
    const fs = require('node:fs') as typeof import('node:fs');
    fs.writeFileSync(solta, carregarFace(faces[2]));
    expect(lerFacesDoFicheiro(solta)[0]).toMatchObject({ postscript: 'Helvetica-Oblique', estilo: 'Oblique' });
  });

  it('extrairFace recusa um índice fora da coleção e devolve intacto o que não é coleção', () => {
    const ttc = new Uint8Array(require('node:fs').readFileSync(fx('colecao.ttc')));
    expect(() => extrairFace(ttc, 9)).toThrow();
    const ttf = new Uint8Array(require('node:fs').readFileSync(fx('verdana.ttf')));
    expect(extrairFace(ttf, 0)).toBe(ttf);
  });

  it('pastas por sistema', () => {
    expect(pastasDeFontes('darwin', {}, '/Users/j')).toEqual(['/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts', '/Users/j/Library/Fonts']);
    expect(pastasDeFontes('win32', { WINDIR: 'C:\\Windows', LOCALAPPDATA: 'C:\\L' }, 'C:\\U')[0]).toContain('Fonts');
    expect(pastasDeFontes('linux', {}, '/home/j')).toContain('/usr/share/fonts');
  });
});

describe('fontes do sistema: nomes do PDF', () => {
  it.each([
    ['Helvetica', 'helvetica', false, false],
    ['Helvetica-BoldOblique', 'helvetica', true, true],
    ['Helvetica-Oblique', 'helvetica', false, true],
    ['CenturyGothic,Bold', 'centurygothic', true, false],
    ['CenturyGothic-Bold', 'centurygothic', true, false],
    ['ABCDEF+Verdana-Italic', 'verdana', false, true],
    ['ArialMT', 'arial', false, false],
    ['Arial-BoldMT', 'arial', true, false],
    ['TimesNewRomanPS-BoldItalicMT', 'timesnewroman', true, true],
    ['ArialBold', 'arial', true, false],
  ])('%s', (nome, familia, negrito, italico) => {
    expect(analisarNome(nome)).toMatchObject({ familia, negrito, italico });
  });
});

describe('fontes do sistema: escolher a fonte', () => {
  const instaladas = [
    face('Helvetica', 'Regular', 'Helvetica'),
    face('Helvetica', 'Light', 'Helvetica-Light'),
    face('Helvetica', 'Bold', 'Helvetica-Bold'),
    face('Helvetica', 'Oblique', 'Helvetica-Oblique'),
    face('Helvetica', 'Bold Oblique', 'Helvetica-BoldOblique'),
    face('Helvetica Neue', 'Regular', 'HelveticaNeue'),
    face('Verdana', 'Regular', 'Verdana'),
    face('Verdana', 'Bold', 'Verdana-Bold'),
    face('Arial', 'Regular', 'ArialMT'),
    face('Arial', 'Bold', 'Arial-BoldMT'),
    face('Arial Narrow', 'Bold', 'ArialNarrow-Bold'),
    face('Courier New', 'Regular', 'CourierNewPSMT'),
  ];
  const ps = (n: string, p = {}) => escolherFace(instaladas, n, p)?.face.postscript;

  it('nome PostScript exato', () => {
    expect(ps('Helvetica-BoldOblique')).toBe('Helvetica-BoldOblique');
    expect(ps('XYZABC+Verdana-Bold')).toBe('Verdana-Bold');
    expect(ps('ArialMT')).toBe('ArialMT');
  });

  it('família + estilo quando o nome não é o PostScript', () => {
    expect(ps('Verdana,Bold')).toBe('Verdana-Bold');
    expect(ps('Arial,Bold')).toBe('Arial-BoldMT');
    expect(ps('Helvetica-Bold')).toBe('Helvetica-Bold');
  });

  it('o regular não cai na Light, nem Helvetica na Helvetica Neue ou Arial na Arial Narrow', () => {
    expect(ps('Helvetica')).toBe('Helvetica');
    expect(ps('Arial,Bold')).not.toBe('ArialNarrow-Bold');
  });

  it('as pistas do descritor decidem o estilo quando o nome não o diz', () => {
    expect(ps('Verdana', { negrito: true })).toBe('Verdana-Bold');
    expect(ps('Helvetica', { italico: true })).toBe('Helvetica-Oblique');
    expect(ps('Helvetica', { negrito: true, italico: true })).toBe('Helvetica-BoldOblique');
  });

  it('fonte que não existe → null; equivalente de métricas só como último recurso e assinalado', () => {
    expect(escolherFace(instaladas, 'CenturyGothic')).toBeNull();
    expect(escolherFace(instaladas, 'Garamond-Bold')).toBeNull();
    const sem = instaladas.filter((f) => f.familia !== 'Helvetica');
    const r = escolherFace(sem, 'Helvetica-Bold');
    expect(r?.face.postscript).toBe('Arial-BoldMT');
    expect(r?.aproximada).toBe(true);
    expect(escolherFace(instaladas, 'Helvetica-Bold')?.aproximada).toBe(false);
    // Courier → Courier New
    expect(escolherFace(instaladas, 'Courier')?.face.postscript).toBe('CourierNewPSMT');
  });

  it('o equivalente respeita o estilo: não há Arial itálico → null, em vez de um regular', () => {
    const sem = instaladas.filter((f) => f.familia !== 'Helvetica');
    expect(escolherFace(sem, 'Helvetica-Oblique')).toBeNull();
  });
});

describe('fontes do sistema: pedido da página', () => {
  const instaladas = [face('Verdana', 'Regular', 'Verdana'), face('Verdana', 'Bold', 'Verdana-Bold'), face('Arial', 'Regular', 'ArialMT')];
  const carregar = (f: Face) => new Uint8Array([f.postscript.length]);

  it('devolve uma resposta por pedido, na mesma ordem (null quando não há)', () => {
    const r = procurarFontes(instaladas, [{ nomeBase: 'Verdana-Bold' }, { nomeBase: 'CenturyGothic' }, { nomeBase: 'Helvetica' }], carregar);
    expect(r.map((x: { nome: string } | null) => x?.nome ?? null)).toEqual(['Verdana Bold', null, 'Arial Regular']);
    expect(r[2].aproximada).toBe(true);
    expect(r[0].aproximada).toBe(false);
  });

  it('as pistas viajam no pedido', () => {
    expect(procurarFontes(instaladas, [{ nomeBase: 'Verdana', negrito: true }], carregar)[0].nome).toBe('Verdana Bold');
  });

  it('não confia no que vem da página', () => {
    expect(procurarFontes(instaladas, 'x', carregar)).toEqual([]);
    expect(procurarFontes(instaladas, [null, {}, { nomeBase: 5 }, { nomeBase: '' }, { nomeBase: 'x'.repeat(500) }], carregar)).toEqual([null, null, null, null, null]);
    expect(procurarFontes(instaladas, new Array(1000).fill({ nomeBase: 'Verdana' }), carregar)).toHaveLength(300);
  });

  it('uma fonte que não se consegue ler dá null em vez de rebentar', () => {
    const mau = () => {
      throw new Error('x');
    };
    expect(procurarFontes(instaladas, [{ nomeBase: 'Verdana' }], mau)).toEqual([null]);
  });

  it('a mesma face pedida duas vezes lê-se uma só vez', () => {
    let n = 0;
    procurarFontes(instaladas, [{ nomeBase: 'Verdana' }, { nomeBase: 'Verdana' }, { nomeBase: 'Verdana', italico: false }], (f: Face) => (n++, carregar(f)));
    expect(n).toBe(1);
  });
});
