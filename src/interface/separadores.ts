/**
 * Os separadores (vários PDFs abertos ao mesmo tempo). Aqui só a lógica pura: que separador fica ativo depois de
 * fechar um, para onde levam os atalhos, e onde se abre um ficheiro novo. O estado de cada PDF vive no seu próprio
 * componente (Documento.svelte); isto só guarda o que a barra precisa de mostrar.
 */
export interface Separador {
  id: number;
  /** Nome do ficheiro ('' enquanto o separador está vazio, no ecrã inicial) */
  nome: string;
  /** Caminho no disco (só na versão desktop), para não abrir o mesmo ficheiro duas vezes */
  caminho: string;
  temFicheiro: boolean;
  aCarregar: boolean;
  erros: number;
  avisos: number;
  /** Quanto da análise já está feita (0…1), para a barra da notch */
  progresso: number;
}

/** Cada PDF aberto guarda a sua análise e o seu preview em memória: um limite evita encher o computador */
export const MAX_SEPARADORES = 12;

export const separadorVazio = (id: number): Separador => ({ id, nome: '', caminho: '', temFicheiro: false, aCarregar: false, erros: 0, avisos: 0, progresso: 0 });

/** O separador está por usar (ecrã inicial, nada aberto nem a abrir)? */
export const estaVazio = (s: Separador) => !s.temFicheiro && !s.aCarregar;

/** O que fica ativo depois de fechar `fechado`: se era o ativo, o da direita (ou o da esquerda se era o último) */
export function ativoAoFechar(ids: number[], fechado: number, ativo: number): { ids: number[]; ativo: number | null } {
  const i = ids.indexOf(fechado);
  if (i < 0) return { ids, ativo };
  const restantes = ids.filter((x) => x !== fechado);
  if (!restantes.length) return { ids: restantes, ativo: null };
  if (fechado !== ativo) return { ids: restantes, ativo };
  return { ids: restantes, ativo: restantes[Math.min(i, restantes.length - 1)] };
}

/** Ctrl+Tab e companhia: o seguinte (+1) ou o anterior (−1), dando a volta */
export function vizinho(ids: number[], ativo: number, delta: 1 | -1): number {
  if (!ids.length) return ativo;
  const i = ids.indexOf(ativo);
  return ids[(i + delta + ids.length) % ids.length];
}

/** Cmd/Ctrl+1…9: o 9 é sempre o último, como nos browsers */
export function porNumero(ids: number[], n: number): number | null {
  if (n < 1 || n > 9 || !ids.length) return null;
  return n === 9 ? ids[ids.length - 1] : (ids[n - 1] ?? null);
}

/** Onde abrir um ficheiro: um separador que já o tenha (só se há caminho), o ativo se está vazio, ou um novo */
export function ondeAbrir(seps: Separador[], ativo: number, caminho: string): { tipo: 'existente'; id: number } | { tipo: 'ativo' } | { tipo: 'novo' } | { tipo: 'cheio' } {
  if (caminho) {
    const ja = seps.find((s) => s.caminho === caminho && s.temFicheiro);
    if (ja) return { tipo: 'existente', id: ja.id };
  }
  const atual = seps.find((s) => s.id === ativo);
  if (atual && estaVazio(atual)) return { tipo: 'ativo' };
  return seps.length >= MAX_SEPARADORES ? { tipo: 'cheio' } : { tipo: 'novo' };
}

/** A barra só aparece quando há o que mostrar: com o ecrã inicial sozinho, fica limpo */
export const mostrarBarra = (seps: Separador[]) => seps.length > 1 || seps.some((s) => !estaVazio(s));

/** Põe `id` na posição `destino` (0 = primeiro), mantendo a ordem dos outros. Posição fora do alcance fica nas pontas. */
export function mover(ids: number[], id: number, destino: number): number[] {
  const de = ids.indexOf(id);
  if (de < 0) return ids;
  const para = Math.min(Math.max(destino, 0), ids.length - 1);
  if (para === de) return ids;
  const r = ids.filter((x) => x !== id);
  r.splice(para, 0, id);
  return r;
}

/** Um passo para a esquerda (−1) ou para a direita (+1); nas pontas fica onde está */
export const moverPorPasso = (ids: number[], id: number, delta: 1 | -1): number[] => {
  const i = ids.indexOf(id);
  return i < 0 ? ids : mover(ids, id, i + delta);
};

/**
 * Onde fica o separador que se está a arrastar: quantos dos outros têm o centro antes do centro dele.
 * `centrosOutros` são os centros (px) dos separadores que não se arrastam, por ordem; `centro` o de quem se arrasta.
 */
export function posicaoAoArrastar(centrosOutros: number[], centro: number): number {
  let n = 0;
  for (const c of centrosOutros) if (c < centro) n++;
  return n;
}
