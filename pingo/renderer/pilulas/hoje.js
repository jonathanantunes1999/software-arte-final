/**
 * Hoje — o que apanhaste durante o dia.
 * É a pílula que justifica a app: às 10h da manhã, na secretária da M2, lembras-te
 * de uma coisa para o site de um cliente, Control+Alt+N, escreves, Enter. À noite está lá.
 */

const horas = (ms) => new Date(ms).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const pilulaHoje = {
  id: 'hoje',
  titulo: 'Hoje',
  cor: '#14b8d4',

  resumo(estado) {
    const porFazer = estado.capturas.filter((c) => !c.feitaEm).length;
    if (!porFazer) return 'nada por fazer';
    return `${porFazer} por fazer`;
  },

  render(estado, api) {
    const caixa = document.createElement('div');
    caixa.className = 'conteudo';

    const forma = document.createElement('form');
    forma.className = 'captura';
    const campo = document.createElement('input');
    campo.type = 'text';
    campo.placeholder = 'O que é que te lembraste? (Enter guarda)';
    campo.maxLength = 500;
    campo.autocomplete = 'off';
    campo.dataset.foco = 'captura';
    forma.append(campo);
    forma.addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = campo.value.trim();
      if (!texto) return;
      campo.value = '';
      await api.acao('captura:nova', { texto });
      api.festejar();
    });
    caixa.append(forma);

    const porFazer = estado.capturas.filter((c) => !c.feitaEm);
    const feitas = estado.capturas.filter((c) => c.feitaEm);

    if (!estado.capturas.length) {
      const vazio = document.createElement('p');
      vazio.className = 'vazio';
      vazio.textContent = 'Ainda não apanhaste nada. Control+Alt+N em qualquer sítio do Mac.';
      caixa.append(vazio);
    }

    const lista = (itens, classe) => {
      const ul = document.createElement('ul');
      ul.className = `lista ${classe}`;
      for (const c of itens) {
        const li = document.createElement('li');

        const marca = document.createElement('button');
        marca.type = 'button';
        marca.className = 'marca';
        marca.setAttribute('aria-label', c.feitaEm ? 'Pôr outra vez por fazer' : 'Marcar como feita');
        marca.textContent = c.feitaEm ? '✓' : '';
        marca.addEventListener('click', () => api.acao('captura:alternar', { id: c.id }));

        const texto = document.createElement('span');
        texto.className = 'texto';
        texto.textContent = c.texto;

        const quando = document.createElement('time');
        quando.className = 'quando';
        quando.textContent = horas(c.criadaEm);

        const apagar = document.createElement('button');
        apagar.type = 'button';
        apagar.className = 'apagar';
        apagar.setAttribute('aria-label', 'Apagar');
        apagar.textContent = '×';
        apagar.addEventListener('click', () => api.acao('captura:apagar', { id: c.id }));

        li.append(marca, texto, quando, apagar);
        ul.append(li);
      }
      return ul;
    };

    if (porFazer.length) caixa.append(lista(porFazer, 'por-fazer'));

    if (feitas.length) {
      const rodape = document.createElement('div');
      rodape.className = 'rodape';
      const quantas = document.createElement('span');
      quantas.textContent = `${feitas.length} ${feitas.length === 1 ? 'feita' : 'feitas'}`;
      const limpar = document.createElement('button');
      limpar.type = 'button';
      limpar.className = 'ligacao';
      limpar.textContent = 'Limpar';
      limpar.addEventListener('click', () => api.acao('captura:limpar-feitas'));
      rodape.append(quantas, limpar);
      caixa.append(lista(feitas.slice(0, 5), 'feitas'), rodape);
    }

    return caixa;
  },
};
