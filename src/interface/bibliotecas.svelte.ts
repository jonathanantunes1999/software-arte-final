import { lerBiblioteca, type Biblioteca } from '../cores/bibliotecas';

/** Bibliotecas de cores carregadas pelo utilizador. Ficam guardadas só neste browser. */
const CHAVE = 'arte-final:bibliotecas:v1';

/** Formato compacto: [nome, [[nome da cor, L, a, b], ...]] */
type Guardado = [string, [string, number, number, number][]][];

function carregar(): Biblioteca[] {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return [];
    const g = JSON.parse(bruto) as Guardado;
    if (!Array.isArray(g)) return [];
    return g
      .filter((b) => Array.isArray(b) && typeof b[0] === 'string' && Array.isArray(b[1]))
      .map(([nome, cores]) => ({
        nome,
        cores: cores
          .filter((c) => Array.isArray(c) && typeof c[0] === 'string' && c.slice(1).every((v) => Number.isFinite(v)))
          .map((c) => ({ nome: c[0], lab: [c[1], c[2], c[3]] as [number, number, number] })),
      }));
  } catch {
    return [];
  }
}

export const bibliotecas: { lista: Biblioteca[]; guardado: boolean } = $state({ lista: carregar(), guardado: true });

function guardar() {
  const g: Guardado = $state.snapshot(bibliotecas.lista).map((b) => [b.nome, b.cores.map((c) => [c.nome, Math.round(c.lab[0] * 100) / 100, Math.round(c.lab[1] * 100) / 100, Math.round(c.lab[2] * 100) / 100])]);
  try {
    localStorage.setItem(CHAVE, JSON.stringify(g));
    bibliotecas.guardado = true;
  } catch {
    // quota cheia ou sem armazenamento: a biblioteca vale só até fechar a página
    bibliotecas.guardado = false;
  }
}

/** Lê um ficheiro .acb/.ase e junta-o. Devolve o nome da biblioteca ou lança erro com mensagem para mostrar. */
export async function adicionarBiblioteca(ficheiro: File): Promise<string> {
  const b = lerBiblioteca(new Uint8Array(await ficheiro.arrayBuffer()), ficheiro.name);
  bibliotecas.lista = [...bibliotecas.lista.filter((x) => x.nome !== b.nome), b];
  guardar();
  return b.nome;
}

export function removerBiblioteca(nome: string) {
  bibliotecas.lista = bibliotecas.lista.filter((b) => b.nome !== nome);
  guardar();
}
