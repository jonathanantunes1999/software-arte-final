import { describe, expect, it } from 'vitest';
import { balaoDaAnalise, balaoDaCorrecao, SAUDACAO } from '../../src/assistente/baloes';
import { PERFIL_OMISSAO, sanearPerfil } from '../../src/mascote/personalizacao';

describe('balões da mascote', () => {
  it('a saudação é só "Olá!", sem pergunta', () => {
    expect(SAUDACAO).toEqual({ texto: 'Olá!' });
  });

  it('depois da análise diz o que encontrou e oferece-se para explicar (o clique resume o ficheiro)', () => {
    expect(balaoDaAnalise({ erros: 4, avisos: 4, infos: 2 })).toEqual({ texto: 'Encontrei 4 erros e 4 avisos. Queres que explique?', pergunta: 'Resume o ficheiro' });
    expect(balaoDaAnalise({ erros: 1, avisos: 0, infos: 0 }).texto).toBe('Encontrei 1 erro. Queres que explique?');
    expect(balaoDaAnalise({ erros: 0, avisos: 3, infos: 0 }).texto).toBe('Encontrei 3 avisos. Queres que explique?');
  });

  it('sem erros nem avisos não oferece nada para explicar', () => {
    expect(balaoDaAnalise({ erros: 0, avisos: 0, infos: 1 })).toEqual({ texto: 'Sem erros nem avisos, só 1 nota.' });
    expect(balaoDaAnalise({ erros: 0, avisos: 0, infos: 3 }).texto).toBe('Sem erros nem avisos, só 3 notas.');
    expect(balaoDaAnalise({ erros: 0, avisos: 0, infos: 0 })).toEqual({ texto: 'Sem alertas: está tudo em ordem.' });
  });

  it('depois de uma correção só fala se melhorou', () => {
    expect(balaoDaCorrecao(8, 5)).toEqual({ texto: 'Pronto: 8 alertas passaram a 5.' });
    expect(balaoDaCorrecao(8, 0)).toEqual({ texto: 'Pronto: ficou sem alertas.' });
    expect(balaoDaCorrecao(8, 8)).toBeNull();
    expect(balaoDaCorrecao(3, 5)).toBeNull();
  });

  it('há um interruptor nas Definições da mascote, ligado por omissão e à prova de lixo', () => {
    expect(PERFIL_OMISSAO.balao).toBe(true);
    expect(sanearPerfil({ balao: false }).balao).toBe(false);
    expect(sanearPerfil({ balao: 'não' }).balao).toBe(true);
    expect(sanearPerfil(undefined).balao).toBe(true);
  });
});
