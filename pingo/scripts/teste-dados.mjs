import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Dados } from '../electron/dados.mjs';

/** Testes do que guarda os dados, que é a única parte onde se pode perder trabalho. node scripts/teste-dados.mjs */

const pasta = mkdtempSync(path.join(tmpdir(), 'pingo-'));
const d = new Dados(pasta);

assert.deepEqual(d.ler(), { versao: 1, capturas: [], clientes: [] }, 'arranca vazio');

d.acao('captura:nova', { texto: '  Trocar o logo no site da tasca  ' });
assert.equal(d.estado.capturas.length, 1);
assert.equal(d.estado.capturas[0].texto, 'Trocar o logo no site da tasca', 'corta os espaços');
assert.equal(d.estado.capturas[0].feitaEm, null);

d.acao('captura:nova', { texto: '' });
assert.equal(d.estado.capturas.length, 1, 'captura vazia não entra');

d.acao('captura:nova', { texto: 'Segunda' });
assert.equal(d.estado.capturas[0].texto, 'Segunda', 'a mais recente fica em cima');

const id = d.estado.capturas[1].id;
d.acao('captura:alternar', { id });
assert.ok(d.estado.capturas[1].feitaEm, 'marca como feita');
d.acao('captura:alternar', { id });
assert.equal(d.estado.capturas[1].feitaEm, null, 'volta a por fazer');

d.acao('captura:alternar', { id });
d.acao('captura:limpar-feitas');
assert.equal(d.estado.capturas.length, 1, 'limpa só as feitas');

// Sobrevive a uma releitura: é isto que garante que nada se perde ao fechar a app
const outro = new Dados(pasta);
assert.equal(outro.ler().capturas.length, 1, 'o que se guardou lê-se outra vez');

// Ficheiro estragado: aproveita-se o que for válido
const escrito = JSON.parse(readFileSync(path.join(pasta, 'dados.json'), 'utf8'));
escrito.capturas.push({ texto: 'sem id nem data' }, { texto: '' }, null);
escrito.clientes = [
  { nome: 'Tasca', mensalidade: 20, diaPagamento: 99, pagoAte: 'lixo' },
  { nome: '' },
];
writeFileSync(path.join(pasta, 'dados.json'), JSON.stringify(escrito));

const saneado = new Dados(pasta).ler();
assert.equal(saneado.capturas.length, 2, 'descarta as capturas sem texto, aproveita a boa');
assert.ok(saneado.capturas[1].id, 'inventa id a quem não tem');
assert.equal(saneado.clientes.length, 1, 'cliente sem nome fora');
assert.equal(saneado.clientes[0].diaPagamento, 28, 'dia de pagamento preso a 1..28');
assert.equal(saneado.clientes[0].pagoAte, '', 'mês inválido fica vazio');

// Ação desconhecida não estraga nada (mesma instância: os ids inventados na leitura mantêm-se)
const dd = new Dados(pasta);
dd.ler();
const antes = JSON.stringify(dd.estado);
dd.acao('nao:existe', {});
assert.equal(JSON.stringify(dd.estado), antes, 'ação desconhecida não mexe no estado');
assert.equal(readFileSync(path.join(pasta, 'dados.json'), 'utf8').includes('nao:existe'), false, 'nem escreve no ficheiro');

console.log('todos os testes passaram');
