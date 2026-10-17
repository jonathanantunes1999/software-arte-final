import { describe, expect, it } from 'vitest';
import type { Cerebro } from '../../src/assistente/cerebro';
import { tempoDePensar, tratar, type Dependencias, type ResultadoAcao } from '../../src/assistente/conversa';
import { MEMORIA_VAZIA, type Acao, type ContextoAssistente, type Memoria } from '../../src/assistente/tipos';
import type { EstadoMascote } from '../../src/mascote/expressoes';
import { PERFIL_OMISSAO } from '../../src/mascote/personalizacao';

const ctx: ContextoAssistente = { ficheiro: null, alertas: [], inventario: null, paginasSemSangria: 0, sangriaMm: 3, corrigido: false, desktop: false, mascote: PERFIL_OMISSAO };

function montar(cerebro: Cerebro, executar: Dependencias['executar'] = async () => undefined) {
  const eventos: string[] = [];
  const mensagens: { texto: string; sugestoes?: string[] }[] = [];
  let memoria: Memoria | null = null;
  const esperas: number[] = [];
  const d: Dependencias = {
    cerebro,
    contexto: () => ctx,
    executar,
    espera: async (ms) => void esperas.push(ms),
    saida: {
      mensagem: (m) => (mensagens.push(m), eventos.push('msg')),
      expressao: (e: EstadoMascote) => eventos.push(`cara:${e}`),
      pensando: (b) => eventos.push(`pensa:${b}`),
      memoria: (m) => (memoria = m),
    },
  };
  return { d, eventos, mensagens, esperas, memoria: () => memoria };
}

const acaoPagina: Acao = { tipo: 'pagina', pagina: 1 };
const cerebroFixo = (acoes: Acao[] = []): Cerebro => ({
  responder: () => ({ resposta: { texto: 'resposta', expressao: 'feliz', acoes, sugestoes: ['a'] }, memoria: { pendente: null, ultimoTema: 'x' } }),
});

describe('assistente: tratar uma mensagem', () => {
  it('pensa, responde, e guarda a memória', async () => {
    const t = montar(cerebroFixo());
    await tratar('olá', MEMORIA_VAZIA, t.d);
    expect(t.eventos).toEqual(['pensa:true', 'cara:pensa', 'pensa:false', 'cara:feliz', 'msg']);
    expect(t.mensagens).toEqual([{ texto: 'resposta', sugestoes: ['a'] }]);
    expect(t.memoria()?.ultimoTema).toBe('x');
    expect(t.esperas).toEqual([tempoDePensar('olá')]);
  });

  it('o tempo de pensar cresce com a mensagem mas tem teto', () => {
    expect(tempoDePensar('a')).toBeLessThan(tempoDePensar('uma mensagem bastante mais comprida do que a outra'));
    expect(tempoDePensar('x'.repeat(5000))).toBe(900);
  });

  it('executa as ações por ordem e mostra o que cada uma diz', async () => {
    const feitas: string[] = [];
    const t = montar(cerebroFixo([acaoPagina, { tipo: 'comparar' }]), async (a): Promise<ResultadoAcao> => {
      feitas.push(a.tipo);
      return a.tipo === 'comparar' ? { texto: 'comparado', expressao: 'orgulhosa', sugestoes: ['b'] } : undefined;
    });
    await tratar('x', MEMORIA_VAZIA, t.d);
    expect(feitas).toEqual(['pagina', 'comparar']);
    expect(t.mensagens.map((m) => m.texto)).toEqual(['resposta', 'comparado']);
    expect(t.eventos.at(-2)).toBe('cara:orgulhosa');
  });

  it('uma ação que rebenta pára as seguintes e diz que o ficheiro ficou como estava', async () => {
    const feitas: string[] = [];
    const t = montar(cerebroFixo([acaoPagina, { tipo: 'comparar' }]), async (a) => {
      feitas.push(a.tipo);
      throw new Error('boom');
    });
    const log = console.error;
    console.error = () => {};
    await tratar('x', MEMORIA_VAZIA, t.d);
    console.error = log;
    expect(feitas).toEqual(['pagina']);
    expect(t.mensagens.at(-1)?.texto).toContain('ficou como estava');
    expect(t.eventos.at(-1)).toBe('msg');
    expect(t.eventos).toContain('cara:erro');
  });

  it('um cérebro que rebenta não deixa a mascote presa a pensar', async () => {
    const t = montar({
      responder: () => {
        throw new Error('x');
      },
    });
    const log = console.error;
    console.error = () => {};
    await tratar('x', MEMORIA_VAZIA, t.d);
    console.error = log;
    expect(t.eventos).toContain('pensa:false');
    expect(t.mensagens[0].texto).toContain('baralhada');
  });

  it('lê o contexto no momento de responder (não o de quando se abriu a conversa)', async () => {
    let chamadas = 0;
    const t = montar({ responder: (_m, c) => ((chamadas += c.sangriaMm), { resposta: { texto: 't', expressao: 'repouso', acoes: [], sugestoes: [] }, memoria: MEMORIA_VAZIA }) });
    await tratar('a', MEMORIA_VAZIA, t.d);
    expect(chamadas).toBe(3);
  });
});
