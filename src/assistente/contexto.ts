import { correcaoDoAlerta } from '../alertas/correcao-sugerida';
import type { Alerta } from '../alertas/tipos';
import type { Inventario } from '../correcoes/inventario';
import type { PerfilMascote } from '../mascote/personalizacao';
import type { AlertaResumo, ContextoAssistente } from './tipos';

export interface EntradaContexto {
  nome: string;
  /** Total de páginas (0 se não há ficheiro) */
  paginas: number;
  /** Página atual, 0-based */
  pagina: number;
  alertas: Alerta[];
  inventario: Inventario | null;
  paginasSemSangria: number;
  paginasSemMarcas?: number;
  sangriaMm: number;
  corrigido: boolean;
  desktop: boolean;
  mascote: PerfilMascote;
  temFicheiro: boolean;
}

/** Páginas (1-based, sem repetidas, por ordem) em que está um alerta */
export function paginasDoAlerta(a: Alerta): number[] {
  const ps = new Set<number>();
  for (const l of a.locais ?? []) ps.add(l.pagina + 1);
  if (!ps.size && a.pagina !== undefined) ps.add(a.pagina + 1);
  return [...ps].sort((x, y) => x - y);
}

/** Junta o que a interface sabe numa fotografia só de leitura para o assistente */
export function montarContexto(e: EntradaContexto): ContextoAssistente {
  const resumos: AlertaResumo[] = e.alertas.map((a) => ({
    id: a.id,
    gravidade: a.gravidade,
    titulo: a.titulo,
    detalhe: a.detalhe ?? '',
    paginas: paginasDoAlerta(a),
    correcao: correcaoDoAlerta(a.id)?.tipo ?? null,
  }));
  const inv = e.inventario;
  return {
    ficheiro: e.temFicheiro ? { nome: e.nome, paginas: e.paginas, pagina: e.pagina + 1 } : null,
    alertas: resumos,
    inventario: inv
      ? {
          rgbVetores: inv.rgb.vetores,
          rgbImagens: inv.rgb.imagens,
          overprint: { ...inv.overprint },
          spots: inv.spots.length,
          juncoes: inv.juncoesSugeridas.map((j) => ({ ...j })),
          facas: inv.coresDeTraco.length,
          fontesConvertiveis: inv.fontes.filter((f) => f.convertivel).map((f) => f.id),
          fontesTotal: inv.fontes.length,
          fontesNaoIncorporadas: inv.fontes.filter((f) => !f.convertivel && (f.substituivel || f.motivo?.includes('não incorporada'))).length,
        }
      : null,
    paginasSemSangria: e.paginasSemSangria,
    paginasSemMarcas: e.paginasSemMarcas ?? 0,
    sangriaMm: e.sangriaMm,
    corrigido: e.corrigido,
    desktop: e.desktop,
    mascote: e.mascote,
  };
}
