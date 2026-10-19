/**
 * Clientes — quem paga, quanto, e quem está a vencer.
 * O número que importa é o total recorrente confirmado: é a distância, em euros,
 * entre onde estás e poder sair do 9-5. Por isso está no cabeçalho e não escondido.
 *
 * Os clientes editam-se no ficheiro de dados (botão "Dados" no fim do painel).
 * Formato de cada um:
 *   { "nome": "Tasquinha do Zé", "site": "https://…", "mensalidade": 20,
 *     "diaPagamento": 8, "pagoAte": "2026-10", "notas": "" }
 */

const euros = (n) => `${n.toFixed(2).replace('.', ',').replace(/,00$/, '')} €`;
const mesDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** 'por pagar' quando o mês corrente ainda não está pago; 'atrasado' se o dia já passou */
function estadoDe(cliente, agora = new Date()) {
  const mes = mesDe(agora);
  if (cliente.pagoAte >= mes) return { chave: 'pago', texto: 'pago' };
  if (agora.getDate() >= cliente.diaPagamento) return { chave: 'atrasado', texto: `atrasado desde dia ${cliente.diaPagamento}` };
  return { chave: 'por-pagar', texto: `vence dia ${cliente.diaPagamento}` };
}

export const pilulaClientes = {
  id: 'clientes',
  titulo: 'Clientes',
  cor: '#e0218a',

  resumo(estado) {
    if (!estado.clientes.length) return '';
    const total = estado.clientes.reduce((s, c) => s + c.mensalidade, 0);
    const aVencer = estado.clientes.filter((c) => estadoDe(c).chave !== 'pago').length;
    return aVencer ? `${euros(total)}/mês · ${aVencer} a receber` : `${euros(total)}/mês`;
  },

  render(estado, api) {
    const caixa = document.createElement('div');
    caixa.className = 'conteudo';

    if (!estado.clientes.length) {
      const vazio = document.createElement('p');
      vazio.className = 'vazio';
      vazio.textContent = 'Sem clientes no ficheiro de dados. Abre-o em "Dados" e acrescenta o primeiro.';
      caixa.append(vazio);
      return caixa;
    }

    const agora = new Date();
    const mes = mesDe(agora);
    const total = estado.clientes.reduce((s, c) => s + c.mensalidade, 0);

    const topo = document.createElement('div');
    topo.className = 'recorrente';
    const valor = document.createElement('strong');
    valor.textContent = euros(total);
    const etiqueta = document.createElement('span');
    etiqueta.textContent = `por mês, ${estado.clientes.length} ${estado.clientes.length === 1 ? 'cliente' : 'clientes'}`;
    topo.append(valor, etiqueta);
    caixa.append(topo);

    const ul = document.createElement('ul');
    ul.className = 'lista clientes';

    // Primeiro quem falta receber: é o que precisa de ação
    const ordem = { atrasado: 0, 'por-pagar': 1, pago: 2 };
    const ordenados = [...estado.clientes].sort((a, b) => ordem[estadoDe(a, agora).chave] - ordem[estadoDe(b, agora).chave]);

    for (const c of ordenados) {
      const est = estadoDe(c, agora);
      const li = document.createElement('li');
      li.className = est.chave;

      const nome = document.createElement('span');
      nome.className = 'texto';
      nome.textContent = c.nome;
      if (c.site) {
        nome.classList.add('clicavel');
        nome.title = c.site;
        nome.addEventListener('click', () => api.abrirLigacao(c.site));
      }

      const quanto = document.createElement('span');
      quanto.className = 'quanto';
      quanto.textContent = euros(c.mensalidade);

      const estadoEl = document.createElement('span');
      estadoEl.className = 'estado';
      estadoEl.textContent = est.texto;

      li.append(nome, quanto, estadoEl);

      if (est.chave !== 'pago') {
        const recebido = document.createElement('button');
        recebido.type = 'button';
        recebido.className = 'ligacao';
        recebido.textContent = 'Recebi';
        recebido.addEventListener('click', () => api.acao('cliente:pago', { nome: c.nome, mes }));
        li.append(recebido);
      }

      ul.append(li);
    }

    caixa.append(ul);
    return caixa;
  },
};
