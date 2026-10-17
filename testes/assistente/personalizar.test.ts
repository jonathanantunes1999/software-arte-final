import { describe, expect, it } from 'vitest';
import { interpretarMascote } from '../../src/assistente/personalizar';

describe('assistente: mudar a mascote', () => {
  it.each([
    ['mete um chapéu de bruxa', 'bruxa'],
    ['põe-te uma coroa', 'coroa'],
    ['quero que uses uns óculos de sol', 'sol'],
    ['mete uns óculos', 'oculos'],
    ['põe um chapéu de festa', 'festa'],
    ['veste um gorro', 'gorro'],
    ['mascote, põe um cachecol', 'cachecol'],
    ['mete uma boina', 'boina'],
    ['põe-te um laço', 'laco'],
  ])('%s → %s', (frase, acessorio) => {
    expect(interpretarMascote(frase)?.mudancas.acessorio).toBe(acessorio);
  });

  it('tirar acessórios', () => {
    expect(interpretarMascote('tira o chapéu')).toBeNull(); // sem "te"/"mascote": ambíguo, não mexe
    expect(interpretarMascote('mascote, tira o chapéu')?.mudancas.acessorio).toBe('nenhum');
    expect(interpretarMascote('fica sem acessórios')?.mudancas.acessorio).toBe('nenhum');
  });

  it.each([
    ['fica rosa', '#ffc4d9'],
    ['muda a mascote para azul', '#bcdcff'],
    ['mascote, fica amarela', '#ffe27a'],
    ['pinta-te de verde', '#b9ecda'],
    ['tu ficas roxa', '#d6cbff'],
    ['mascote fica cinzenta', '#4a4f62'],
  ])('%s → cor %s', (frase, cor) => {
    expect(interpretarMascote(frase)?.mudancas.cor).toBe(cor);
  });

  it('uma cor sem se falar dela não mexe na mascote (é sobre o ficheiro)', () => {
    expect(interpretarMascote('converte o azul para spot')).toBeNull();
    expect(interpretarMascote('há rosa no fundo da página 2')).toBeNull();
  });

  it.each([
    ['dança', 'danca'],
    ['dorme', 'dorme'],
    ['mascote, faz uma festa', 'feliz'],
    ['fica irritada', 'irritada'],
    ['tu estás apaixonada', 'ama'],
    ['pisca o olho', 'pisca'],
    ['acorda', 'cumprimenta'],
    ['sorri', 'feliz'],
    ['fica tonta', 'tonta'],
  ])('%s → expressão %s', (frase, e) => {
    expect(interpretarMascote(frase)?.expressao).toBe(e);
  });

  it('bolas e esconder', () => {
    expect(interpretarMascote('mascote, tira as bolas')?.mudancas.bolas).toBe(false);
    expect(interpretarMascote('mascote, põe as bolas')?.mudancas.bolas).toBe(true);
    expect(interpretarMascote('mascote esconde-te')?.mudancas.visivel).toBe(false);
  });

  it.each(['o que é sangria', 'corrige o rgb', 'quantos erros tem o ficheiro', 'a festa de lançamento está no pdf', 'danca de erro no alerta 2'])('«%s» não é um pedido à mascote', (f) => {
    expect(interpretarMascote(f)).toBeNull();
  });
});
