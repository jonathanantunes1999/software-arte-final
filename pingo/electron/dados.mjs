import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Tudo o que o Pingo sabe vive num único ficheiro JSON na pasta de dados da app.
 * Sem base de dados, sem servidor, sem contas: no dia em que um JSON não bastar,
 * é sinal de que isto deixou de ser um ajudante e passou a ser um produto.
 */

const VAZIO = () => ({ versao: 1, capturas: [], clientes: [] });

/** Aproveita o que for válido de um ficheiro estragado, em vez de perder tudo */
function sanear(bruto) {
  const d = VAZIO();
  if (!bruto || typeof bruto !== 'object') return d;
  if (Array.isArray(bruto.capturas)) {
    d.capturas = bruto.capturas
      .filter((c) => c && typeof c.texto === 'string' && c.texto.trim())
      .map((c) => ({
        id: typeof c.id === 'string' && c.id ? c.id : randomUUID(),
        texto: c.texto.trim().slice(0, 500),
        cliente: typeof c.cliente === 'string' ? c.cliente.slice(0, 80) : '',
        criadaEm: Number.isFinite(c.criadaEm) ? c.criadaEm : Date.now(),
        feitaEm: Number.isFinite(c.feitaEm) ? c.feitaEm : null,
      }));
  }
  if (Array.isArray(bruto.clientes)) {
    d.clientes = bruto.clientes
      .filter((c) => c && typeof c.nome === 'string' && c.nome.trim())
      .map((c) => ({
        nome: c.nome.trim().slice(0, 80),
        site: typeof c.site === 'string' ? c.site.trim() : '',
        mensalidade: Number.isFinite(c.mensalidade) ? c.mensalidade : 0,
        diaPagamento: Number.isFinite(c.diaPagamento) ? Math.min(28, Math.max(1, Math.trunc(c.diaPagamento))) : 1,
        /** 'AAAA-MM' do último mês já pago */
        pagoAte: /^\d{4}-\d{2}$/.test(c.pagoAte) ? c.pagoAte : '',
        notas: typeof c.notas === 'string' ? c.notas.slice(0, 300) : '',
      }));
  }
  return d;
}

export class Dados {
  constructor(pasta) {
    this.ficheiro = path.join(pasta, 'dados.json');
    this.estado = VAZIO();
  }

  ler() {
    try {
      this.estado = sanear(JSON.parse(readFileSync(this.ficheiro, 'utf8')));
    } catch {
      // Primeira vez, ou ficheiro ilegível: começa-se vazio e só se escreve quando houver algo
      this.estado = VAZIO();
    }
    return this.estado;
  }

  /** Escreve para um ficheiro ao lado e só depois troca, para nunca ficar um JSON a meio */
  guardar() {
    mkdirSync(path.dirname(this.ficheiro), { recursive: true });
    const tmp = `${this.ficheiro}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(this.estado, null, 2)}\n`, 'utf8');
    renameSync(tmp, this.ficheiro);
    return this.estado;
  }

  /**
   * As ações são o único caminho para mudar o estado: o renderer nunca escreve o ficheiro,
   * manda uma ação e recebe o estado novo. Uma pílula nova = uma ação nova aqui.
   */
  acao(nome, carga = {}) {
    const d = this.estado;
    switch (nome) {
      case 'captura:nova': {
        const texto = String(carga.texto ?? '').trim();
        if (!texto) return d;
        d.capturas.unshift({
          id: randomUUID(),
          texto: texto.slice(0, 500),
          cliente: String(carga.cliente ?? '').slice(0, 80),
          criadaEm: Date.now(),
          feitaEm: null,
        });
        break;
      }
      case 'captura:alternar': {
        const c = d.capturas.find((x) => x.id === carga.id);
        if (c) c.feitaEm = c.feitaEm ? null : Date.now();
        break;
      }
      case 'captura:apagar':
        d.capturas = d.capturas.filter((x) => x.id !== carga.id);
        break;
      case 'captura:limpar-feitas':
        d.capturas = d.capturas.filter((x) => !x.feitaEm);
        break;
      case 'cliente:pago': {
        const c = d.clientes.find((x) => x.nome === carga.nome);
        if (c && /^\d{4}-\d{2}$/.test(carga.mes)) c.pagoAte = carga.mes;
        break;
      }
      default:
        return d;
    }
    return this.guardar();
  }
}
