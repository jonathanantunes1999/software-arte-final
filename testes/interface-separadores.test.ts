import { describe, expect, it } from 'vitest';
import { ativoAoFechar, estaVazio, MAX_SEPARADORES, mostrarBarra, mover, moverPorPasso, ondeAbrir, porNumero, posicaoAoArrastar, separadorVazio, vizinho, type Separador } from '../src/interface/separadores';

const com = (id: number, caminho = '', extra: Partial<Separador> = {}): Separador => ({ ...separadorVazio(id), nome: `f${id}.pdf`, caminho, temFicheiro: true, ...extra });

describe('separadores: fechar', () => {
  it('fechar o ativo passa ao da direita; o último passa ao da esquerda', () => {
    expect(ativoAoFechar([1, 2, 3], 2, 2)).toEqual({ ids: [1, 3], ativo: 3 });
    expect(ativoAoFechar([1, 2, 3], 3, 3)).toEqual({ ids: [1, 2], ativo: 2 });
    expect(ativoAoFechar([1, 2, 3], 1, 1)).toEqual({ ids: [2, 3], ativo: 2 });
  });
  it('fechar um que não é o ativo não muda o ativo', () => {
    expect(ativoAoFechar([1, 2, 3], 1, 3)).toEqual({ ids: [2, 3], ativo: 3 });
  });
  it('fechar o único devolve sem ativo (quem chama cria um vazio)', () => {
    expect(ativoAoFechar([7], 7, 7)).toEqual({ ids: [], ativo: null });
  });
  it('fechar um que não existe não faz nada', () => {
    expect(ativoAoFechar([1, 2], 9, 1)).toEqual({ ids: [1, 2], ativo: 1 });
  });
});

describe('separadores: navegar', () => {
  it('Ctrl+Tab dá a volta nos dois sentidos', () => {
    expect(vizinho([1, 2, 3], 3, 1)).toBe(1);
    expect(vizinho([1, 2, 3], 1, -1)).toBe(3);
    expect(vizinho([1, 2, 3], 2, 1)).toBe(3);
  });
  it('um só separador fica onde está', () => {
    expect(vizinho([5], 5, 1)).toBe(5);
  });
  it('Cmd+1…8 vai ao separador n; Cmd+9 ao último; fora do alcance, nada', () => {
    expect(porNumero([10, 20, 30], 2)).toBe(20);
    expect(porNumero([10, 20, 30], 9)).toBe(30);
    expect(porNumero([10, 20, 30], 5)).toBeNull();
    expect(porNumero([10, 20, 30], 0)).toBeNull();
    expect(porNumero([], 1)).toBeNull();
  });
});

describe('separadores: onde abrir', () => {
  it('o ecrã inicial (separador vazio) aproveita-se', () => {
    expect(ondeAbrir([separadorVazio(1)], 1, '/a.pdf')).toEqual({ tipo: 'ativo' });
  });
  it('com um ficheiro à frente, abre-se num separador novo', () => {
    expect(ondeAbrir([com(1, '/a.pdf')], 1, '/b.pdf')).toEqual({ tipo: 'novo' });
  });
  it('o mesmo ficheiro (mesmo caminho) não se abre duas vezes: vai-se para o que já existe', () => {
    expect(ondeAbrir([com(1, '/a.pdf'), com(2, '/b.pdf')], 1, '/b.pdf')).toEqual({ tipo: 'existente', id: 2 });
  });
  it('sem caminho (arrastado do browser) nunca se junta a outro', () => {
    expect(ondeAbrir([com(1, '')], 1, '')).toEqual({ tipo: 'novo' });
  });
  it('um separador a abrir não conta como vazio', () => {
    expect(estaVazio({ ...separadorVazio(1), aCarregar: true })).toBe(false);
    expect(ondeAbrir([{ ...separadorVazio(1), aCarregar: true }], 1, '/x.pdf')).toEqual({ tipo: 'novo' });
  });
  it('há um limite', () => {
    const muitos = Array.from({ length: MAX_SEPARADORES }, (_, i) => com(i + 1, `/${i}.pdf`));
    expect(ondeAbrir(muitos, 1, '/novo.pdf')).toEqual({ tipo: 'cheio' });
    // mas o que já existe continua a ser encontrado
    expect(ondeAbrir(muitos, 1, '/3.pdf')).toEqual({ tipo: 'existente', id: 4 });
  });
});

describe('separadores: a barra', () => {
  it('só aparece quando há o que mostrar', () => {
    expect(mostrarBarra([separadorVazio(1)])).toBe(false);
    expect(mostrarBarra([com(1)])).toBe(true);
    expect(mostrarBarra([separadorVazio(1), separadorVazio(2)])).toBe(true);
  });
});

describe('separadores: reordenar', () => {
  it('põe um separador em qualquer posição, mantendo a ordem dos outros', () => {
    expect(mover([1, 2, 3, 4], 3, 0)).toEqual([3, 1, 2, 4]);
    expect(mover([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 4, 1]);
    expect(mover([1, 2, 3, 4], 2, 2)).toEqual([1, 3, 2, 4]);
  });
  it('na mesma posição, ou com um que não existe, devolve a lista como estava', () => {
    const l = [1, 2, 3];
    expect(mover(l, 2, 1)).toBe(l);
    expect(mover(l, 9, 0)).toBe(l);
  });
  it('posições fora do alcance ficam nas pontas', () => {
    expect(mover([1, 2, 3], 2, -5)).toEqual([2, 1, 3]);
    expect(mover([1, 2, 3], 2, 99)).toEqual([1, 3, 2]);
  });
  it('não muda a lista que recebe', () => {
    const l = [1, 2, 3];
    mover(l, 3, 0);
    expect(l).toEqual([1, 2, 3]);
  });
  it('um passo de cada vez, parando nas pontas', () => {
    expect(moverPorPasso([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(moverPorPasso([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    expect(moverPorPasso([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(moverPorPasso([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
  });
  it('a posição ao arrastar conta os outros cujo centro ficou para trás', () => {
    const centros = [50, 150, 250]; // os outros três
    expect(posicaoAoArrastar(centros, 10)).toBe(0);
    expect(posicaoAoArrastar(centros, 100)).toBe(1);
    expect(posicaoAoArrastar(centros, 200)).toBe(2);
    expect(posicaoAoArrastar(centros, 999)).toBe(3);
    expect(posicaoAoArrastar([], 40)).toBe(0);
  });
  it('arrastar ao longo dos centros dá cada posição uma vez, sem saltos', () => {
    // 4 separadores de 100 px: o que se arrasta (o 1.º) passa pelos centros dos outros
    const outros = [150, 250, 350];
    const posicoes = [50, 120, 160, 260, 360].map((c) => posicaoAoArrastar(outros, c));
    expect(posicoes).toEqual([0, 0, 1, 2, 3]);
  });
});
