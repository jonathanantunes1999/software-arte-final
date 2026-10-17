import { describe, expect, it } from 'vitest';
import { CerebroLocal } from '../../src/assistente/cerebro';
import { MEMORIA_VAZIA, type Acao, type ContextoAssistente, type Memoria } from '../../src/assistente/tipos';
import { PERFIL_OMISSAO } from '../../src/mascote/personalizacao';

const base: ContextoAssistente = {
  ficheiro: null,
  alertas: [],
  inventario: null,
  paginasSemSangria: 0,
  sangriaMm: 3,
  corrigido: false,
  desktop: false,
  mascote: PERFIL_OMISSAO,
};

const comFicheiro: ContextoAssistente = {
  ...base,
  ficheiro: { nome: 'cartaz.pdf', paginas: 4, pagina: 1 },
  alertas: [
    { id: 'sangria-ausente', gravidade: 'erro', titulo: 'Sem sangria', detalhe: 'Há elementos a tocar no corte.', paginas: [1, 2], correcao: 'sangria' },
    { id: 'overprint-branco', gravidade: 'erro', titulo: 'Branco em overprint', detalhe: '', paginas: [3], correcao: 'overprint-branco' },
    { id: 'rgb', gravidade: 'aviso', titulo: 'Cores em RGB', detalhe: '3 cores de vetor.', paginas: [1], correcao: 'rgb-cmyk' },
    { id: 'faca-em-processo', gravidade: 'aviso', titulo: 'Faca em cor de processo', detalhe: '', paginas: [4], correcao: 'faca-em-spot' },
    { id: 'cadernos-multiplo', gravidade: 'info', titulo: 'Páginas não são múltiplo de 4', detalhe: '', paginas: [], correcao: null },
  ],
  inventario: {
    rgbVetores: 3,
    rgbImagens: 1,
    overprint: { branco: 2, pretoTexto: 1, pretoLinha: 0, spotsTecnicas: 0 },
    spots: 2,
    juncoes: [{ de: 'Pantone 185C', para: 'PANTONE 185 C' }],
    facas: 1,
    fontesConvertiveis: ['12 0 R', '14 0 R'],
    fontesTotal: 3,
    fontesNaoIncorporadas: 1,
  },
  paginasSemSangria: 2,
};

const limpo: ContextoAssistente = { ...comFicheiro, alertas: [], inventario: { ...comFicheiro.inventario!, rgbVetores: 0, rgbImagens: 0, overprint: { branco: 0, pretoTexto: 0, pretoLinha: 0, spotsTecnicas: 0 }, juncoes: [], facas: 0 }, paginasSemSangria: 0 };

const perguntar = (m: string, c: ContextoAssistente = comFicheiro, mem: Memoria = MEMORIA_VAZIA) => CerebroLocal.responder(m, c, mem);
const tipos = (m: string, c?: ContextoAssistente, mem?: Memoria) => perguntar(m, c, mem).resposta.acoes.map((a) => a.tipo);
const primeira = (m: string, c?: ContextoAssistente, mem?: Memoria): Acao | undefined => perguntar(m, c, mem).resposta.acoes[0];

describe('assistente: corrigir', () => {
  it.each([
    ['gera a sangria', 'sangria'],
    ['corrige a sangria', 'sangria'],
    ['resolve a sangira', 'sangria'], // gralha
    ['faz a sangria por favor', 'sangria'],
  ])('«%s» pede sangria', (frase) => {
    const a = primeira(frase);
    expect(a?.tipo).toBe('corrigir');
    if (a?.tipo === 'corrigir') expect(a.pedido.sangria).toEqual({ mm: 3 });
  });

  it.each(['converte para cmyk', 'passa tudo para CMYK', 'passa isto a cmik', 'converte o rgb', 'corrige o RGB'])('«%s» converte RGB', (frase) => {
    const a = primeira(frase);
    expect(a?.tipo).toBe('corrigir');
    if (a?.tipo === 'corrigir') expect(a.pedido.rgbParaCmyk).toEqual({ vetores: true, imagens: true });
  });

  it('overprint: o do branco, o do preto ou todos', () => {
    const b = primeira('desliga o overprint nos brancos');
    expect(b?.tipo === 'corrigir' && b.pedido.overprintBranco).toBe(true);
    const p = primeira('liga o overprint no preto');
    expect(p?.tipo === 'corrigir' && p.pedido.overprintPreto).toBe(true);
    expect(p?.tipo === 'corrigir' && p.pedido.overprintBranco).toBe(false);
    const t = primeira('corrige o overprint');
    expect(t?.tipo === 'corrigir' && t.pedido.overprintBranco && t.pedido.overprintPreto).toBe(true);
  });

  it('juntar spots duplicadas', () => {
    const a = primeira('junta as spots duplicadas');
    expect(a?.tipo === 'corrigir' && a.pedido.renomear).toEqual([{ de: 'Pantone 185C', para: 'PANTONE 185 C' }]);
  });

  it('texto em curvas só das fontes que se convertem, com nota sobre as outras', () => {
    const r = perguntar('passa o texto a curvas');
    const a = r.resposta.acoes[0];
    expect(a?.tipo === 'corrigir' && a.pedido.textoEmCurvas).toEqual({ fontes: ['12 0 R', '14 0 R'] });
    expect(r.resposta.texto).toContain('não incorporada');
  });

  it('"corrige tudo" aplica só o que não perde nada, e diz o que deixou de fora', () => {
    const r = perguntar('corrige tudo');
    const a = r.resposta.acoes[0];
    expect(a?.tipo).toBe('corrigir');
    if (a?.tipo === 'corrigir') {
      expect(a.pedido.sangria).toBeDefined();
      expect(a.pedido.overprintBranco).toBe(true);
      expect(a.pedido.rgbParaCmyk).toBeDefined();
      expect(a.pedido.renomear.length).toBe(1);
      expect(a.pedido.textoEmCurvas).toBeUndefined();
    }
    expect(r.resposta.texto).toContain('texto em curvas');
    expect(r.resposta.expressao).toBe('trabalha');
  });

  it('a faca não se corrige sozinha: abre o painel preparado', () => {
    const r = perguntar('converte a faca em spot');
    expect(r.resposta.acoes.map((a) => a.tipo)).toEqual(['prepararCorrecao']);
    expect(r.resposta.texto).toContain('faca');
  });

  it('nada para corrigir: diz porquê e não faz nada', () => {
    const r = perguntar('gera a sangria', limpo);
    expect(r.resposta.acoes).toEqual([]);
    expect(r.resposta.texto).toContain('já tem sangria');
  });

  it('sem ficheiro ou ainda a analisar', () => {
    const a = perguntar('corrige tudo', base);
    expect(a.resposta.acoes).toEqual([]);
    expect(a.resposta.texto).toContain('ficheiro');
    const b = perguntar('corrige tudo', { ...comFicheiro, inventario: null });
    expect(b.resposta.acoes).toEqual([]);
    expect(b.resposta.expressao).toBe('analisa');
  });
});

describe('assistente: perguntas', () => {
  it.each([
    ['o que é sangria?', 'sangria'],
    ['o que é a sangria', 'sangria'],
    ['para que serve a sangria', 'sangria'],
    ['qual a diferença entre RGB e CMYK?', 'RGB'],
    ['porque é que o RGB é mau para imprimir', 'RGB'],
    ['o que é overprint?', 'Overprint'],
    ['o que é uma spot?', 'spot'],
    ['o que é o preto rico', 'K 100%'],
    ['qual a resolução ideal para imagens?', '300 ppi'],
    ['o que são as marcas de corte', 'marcas de corte'],
    ['quanto é a tinta total máxima', 'tinta total'],
    ['o que é pdf/x', 'PDF/X'],
    ['o meu ficheiro sai do computador?', 'não sai do teu computador'],
    ['o que é a faca', 'faca'],
    ['para que servem as fontes incorporadas', 'incorporadas'],
    ['o que é texto em curvas', 'Texto em curvas'],
    ['o que é um caderno', 'múltiplo de 4'],
  ])('«%s» explica', (frase, contem) => {
    const r = perguntar(frase);
    expect(r.resposta.texto.toLowerCase()).toContain(contem.toLowerCase());
    expect(r.resposta.expressao).toBe('pensa');
  });

  it('a explicação diz o que se passa neste ficheiro e propõe resolver', () => {
    const r = perguntar('o que é sangria?');
    expect(r.resposta.texto).toContain('faltam 3 mm de sangria em 2 páginas');
    expect(r.memoria.pendente?.[0].tipo).toBe('corrigir');
    expect(r.memoria.ultimoTema).toBe('sangria');
  });

  it('sem ficheiro explica sem inventar nada sobre ele', () => {
    const r = perguntar('o que é overprint?', base);
    expect(r.resposta.texto).not.toContain('No teu ficheiro');
    expect(r.memoria.pendente).toBeNull();
  });

  it('o tópico sozinho também responde', () => {
    expect(perguntar('overprint').resposta.texto).toContain('Overprint');
    expect(perguntar('pantone').resposta.texto).toContain('spot');
  });
});

describe('assistente: resumo e alertas', () => {
  it('resume com contagens, os mais graves primeiro e propõe corrigir', () => {
    const r = perguntar('resume o ficheiro');
    expect(r.resposta.texto).toContain('2 erros, 2 avisos, 1 nota');
    expect(r.resposta.texto.indexOf('Sem sangria')).toBeLessThan(r.resposta.texto.indexOf('Cores em RGB'));
    expect(r.resposta.texto).toContain('Queres que corrija');
    expect(r.memoria.pendente?.[0].tipo).toBe('corrigir');
    expect(r.resposta.expressao).toBe('erro');
  });

  it.each(['quantos erros tem?', 'está pronto?', 'há problemas?', 'o que encontraste?', 'como está o ficheiro'])('«%s» resume', (frase) => {
    expect(perguntar(frase).resposta.texto).toContain('cartaz.pdf');
  });

  it('ficheiro limpo: tudo em ordem', () => {
    const r = perguntar('está pronto?', limpo);
    expect(r.resposta.expressao).toBe('ok');
    expect(r.resposta.texto).toContain('tudo em ordem');
  });

  it('sem ficheiro', () => {
    expect(perguntar('resume', base).resposta.texto).toContain('Ainda não tenho nenhum ficheiro');
  });

  it('explica o alerta n e o primeiro erro, com a explicação e a proposta de resolver', () => {
    const r = perguntar('explica o alerta 3');
    expect(r.resposta.texto).toContain('Cores em RGB');
    expect(r.resposta.texto).toContain('RGB');
    expect(r.memoria.pendente?.[0].tipo).toBe('corrigir');
    const p = perguntar('o que significa o primeiro erro');
    expect(p.resposta.texto).toContain('Sem sangria');
    expect(p.resposta.expressao).toBe('erro');
  });

  it('a faca: propõe abrir o painel em vez de corrigir', () => {
    const r = perguntar('explica o quarto alerta');
    expect(r.resposta.acoes.map((a) => a.tipo)).toEqual(['prepararCorrecao']);
  });

  it('mostra-me o alerta', () => {
    const a = primeira('mostra o primeiro erro');
    expect(a).toEqual({ tipo: 'irParaAlerta', indice: 0 });
    expect(primeira('vai ao alerta 3')).toEqual({ tipo: 'irParaAlerta', indice: 2 });
    expect(primeira('mostra o segundo erro')).toEqual({ tipo: 'irParaAlerta', indice: 1 });
  });
});

describe('assistente: navegar e interface', () => {
  it.each([
    ['abre as separações', { tipo: 'painel', painel: 'separacoes' }],
    ['mostra as layers', { tipo: 'painel', painel: 'layers' }],
    ['abre o painel de correções', { tipo: 'painel', painel: 'correcoes' }],
    ['mostra as caixas', { tipo: 'painel', painel: 'caixas' }],
    ['abre o relatório', { tipo: 'relatorio' }],
    ['abre as definições', { tipo: 'definicoes', separador: 'verificacoes' }],
    ['abre as definições da mascote', { tipo: 'definicoes', separador: 'mascote' }],
    ['abre um exemplo', { tipo: 'abrirExemplo' }],
    ['quero abrir outro pdf', { tipo: 'abrirFicheiro' }],
    ['põe o tema escuro', { tipo: 'tema', tema: 'escuro' }],
    ['modo claro', { tipo: 'tema', tema: 'claro' }],
    ['vai para a página 3', { tipo: 'pagina', pagina: 2 }],
    ['página seguinte', { tipo: 'pagina', pagina: 1 }],
    ['última página', { tipo: 'pagina', pagina: 3 }],
  ])('«%s»', (frase, esperado) => {
    expect(primeira(frase)).toEqual(esperado);
  });

  it('página fora do ficheiro', () => {
    const r = perguntar('vai para a página 9');
    expect(r.resposta.acoes).toEqual([]);
    expect(r.resposta.texto).toContain('4 páginas');
  });

  it('comparar e descarregar precisam de uma cópia corrigida', () => {
    expect(perguntar('compara com o original').resposta.acoes).toEqual([]);
    expect(perguntar('descarrega a cópia').resposta.texto).toContain('Ainda não há cópia');
    const c = { ...comFicheiro, corrigido: true };
    expect(primeira('compara com o original', c)).toEqual({ tipo: 'comparar' });
    expect(primeira('descarrega a cópia', c)).toEqual({ tipo: 'descarregar' });
    expect(primeira('guarda o pdf corrigido', c)).toEqual({ tipo: 'descarregar' });
  });
});

describe('assistente: conversa', () => {
  it('"sim" executa a proposta anterior; "não" cancela', () => {
    const prop = perguntar('o que é sangria?');
    const sim = perguntar('sim', comFicheiro, prop.memoria);
    expect(sim.resposta.acoes[0].tipo).toBe('corrigir');
    expect(sim.memoria.pendente).toBeNull();
    const nao = perguntar('não, obrigado', comFicheiro, prop.memoria);
    expect(nao.resposta.acoes).toEqual([]);
    expect(nao.memoria.pendente).toBeNull();
  });

  it('"sim" sem nada pendente não faz nada', () => {
    expect(perguntar('sim').resposta.acoes).toEqual([]);
  });

  it('"sim, corrige" também aceita', () => {
    const prop = perguntar('resume');
    expect(perguntar('sim, corrige', comFicheiro, prop.memoria).resposta.acoes[0].tipo).toBe('corrigir');
    expect(perguntar('pode ser', comFicheiro, prop.memoria).resposta.acoes[0]?.tipo).toBe('corrigir');
  });

  it('cumprimentos, agradecimentos e despedidas', () => {
    expect(perguntar('olá').resposta.expressao).toBe('cumprimenta');
    expect(perguntar('bom dia').resposta.expressao).toBe('cumprimenta');
    expect(perguntar('obrigado!').resposta.texto).toContain('De nada');
    expect(perguntar('adeus').resposta.texto).toContain('Até já');
  });

  it('ajuda', () => {
    for (const f of ['ajuda', 'o que sabes fazer?', 'o que podes fazer', 'quem és tu']) expect(perguntar(f).resposta.texto).toContain('Corrigir');
  });

  it('a mascote muda a si própria', () => {
    expect(primeira('mete um chapéu de bruxa')).toEqual({ tipo: 'mascote', mudancas: { acessorio: 'bruxa' } });
    expect(primeira('fica rosa')).toEqual({ tipo: 'mascote', mudancas: { cor: '#ffc4d9' } });
    const d = perguntar('dança');
    expect(d.resposta.expressao).toBe('danca');
    expect(d.resposta.acoes).toEqual([]);
  });

  it('não percebe: pede para reformular e sugere o que se pode fazer', () => {
    const r = perguntar('quanto custa uma pizza');
    expect(r.resposta.texto).toContain('Não percebi');
    expect(r.resposta.expressao).toBe('pergunta');
    expect(r.resposta.sugestoes.length).toBeGreaterThan(0);
    expect(r.resposta.acoes).toEqual([]);
  });

  it('mensagem vazia → ajuda', () => {
    expect(perguntar('   ').resposta.texto).toContain('Corrigir');
  });

  it('nenhuma resposta propõe ações sem ficheiro aberto, exceto abrir exemplos, ficheiros, definições, tema e mascote', () => {
    const permitidas = new Set(['abrirExemplo', 'abrirFicheiro', 'definicoes', 'tema', 'mascote', 'painel']);
    for (const f of ['corrige tudo', 'gera a sangria', 'compara', 'descarrega', 'abre o relatório', 'vai à página 2', 'mostra o primeiro erro', 'converte para cmyk']) {
      for (const a of perguntar(f, base).resposta.acoes) expect(permitidas.has(a.tipo), `${f} → ${a.tipo}`).toBe(true);
    }
  });
});

describe('assistente: conversa mais solta', () => {
  it.each([
    ['mete isso em cmyk', 'corrigir'],
    ['podes tratar do overprint?', 'corrigir'],
    ['arruma isto tudo', 'corrigir'],
    ['prepara isto para imprimir', 'corrigir'],
    ['limpa o ficheiro', 'corrigir'],
    ['resolve os problemas todos', 'corrigir'],
    ['gera sangria de 5mm', 'corrigir'],
    ['faz uma sangria de 4,5 mm', 'corrigir'],
  ])('«%s» → %s', (frase, tipo) => {
    expect(primeira(frase)?.tipo).toBe(tipo);
  });

  it('a sangria pedida em mm vai no pedido; um valor absurdo é recusado', () => {
    const a = primeira('gera sangria de 5mm');
    expect(a?.tipo === 'corrigir' && a.pedido.sangria).toEqual({ mm: 5 });
    const b = primeira('faz uma sangria de 4,5 mm');
    expect(b?.tipo === 'corrigir' && b.pedido.sangria).toEqual({ mm: 4.5 });
    const c = perguntar('gera sangria de 40 mm');
    expect(c.resposta.acoes).toEqual([]);
    expect(c.resposta.texto).toContain('entre 1 e 10');
  });

  it.each(['tudo bem com o ficheiro?', 'o que está mal?', 'o que tenho de corrigir?', 'o que falta?'])('«%s» resume', (frase) => {
    expect(perguntar(frase).resposta.texto).toContain('cartaz.pdf');
  });

  it('"como converto…" e "tenho de…" explicam e propõem, sem executar logo', () => {
    for (const f of ['como converto para cmyk?', 'tenho de passar isto para CMYK?', 'posso imprimir em RGB?']) {
      const r = perguntar(f);
      expect(r.resposta.acoes, f).toEqual([]);
      expect(r.resposta.texto, f).toContain('CMYK');
      expect(r.memoria.pendente?.[0].tipo, f).toBe('corrigir');
    }
  });

  it('um novo pedido a meio de uma proposta apaga a proposta antiga', () => {
    const prop = perguntar('o que é sangria?');
    const r = perguntar('abre as separações', comFicheiro, prop.memoria);
    expect(r.memoria.pendente).toBeNull();
  });

  it('frases do dia a dia de quem trabalha em gráfica', () => {
    expect(perguntar('isto vai dar bronca na gráfica?').resposta.texto).toBeTruthy();
    expect(perguntar('tá pronto para a gráfica?').resposta.texto).toContain('cartaz.pdf');
  });
});
