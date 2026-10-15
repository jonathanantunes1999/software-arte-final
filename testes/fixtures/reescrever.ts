import type { PaginaRaw } from './gerar';
import { observar } from './observar';
import { contagensVazias, reescreverFluxo, RegistoAlfa, type Contagens } from '../../src/separacoes/reescrever';
import { idSpot, PLACAS_PROCESSO, type Placa } from '../../src/separacoes/placas';

export const PLACA = {
  C: PLACAS_PROCESSO[0],
  M: PLACAS_PROCESSO[1],
  Y: PLACAS_PROCESSO[2],
  K: PLACAS_PROCESSO[3],
  spot: (nome: string): Placa => ({ id: idSpot(nome), tipo: 'spot', nome, rgb: [255, 0, 0] }),
};

/** Reescreve todos os fluxos da página para uma placa; devolve o texto de cada um e as opacidades criadas */
export async function reescrever(spec: Partial<PaginaRaw> & { conteudo: string | string[] }, placa: Placa, simularOverprint = true) {
  const { registos, fluxos } = await observar(spec);
  const alfa = new RegistoAlfa();
  const contagens: Contagens = contagensVazias();
  const textos: Record<string, string> = {};
  for (const [id, f] of fluxos) {
    textos[id] = reescreverFluxo(
      f.texto,
      registos.filter((r) => r.fluxo === id),
      { placa, simularOverprint, alfa, contagens, eDaPagina: id === 'pagina' },
    );
  }
  return { pagina: textos.pagina, textos, alfa: alfa.entradas(), contagens, originais: fluxos };
}
