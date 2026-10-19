import { pilulaHoje } from './hoje.js';
import { pilulaClientes } from './clientes.js';

/**
 * Fonte única de verdade das pílulas, à maneira do PillCatalog do Coucou.
 * Os `id` são contrato: entram em definições e em dados guardados, por isso
 * acrescentam-se, nunca se renomeiam.
 *
 * Uma pílula é só isto:
 *   id       — estável, para sempre
 *   titulo   — o que aparece no cabeçalho da secção
 *   cor      — a tinta que a identifica
 *   resumo   — uma linha curta para a barra fechada (ou '' para não aparecer lá)
 *   render   — devolve um elemento; recebe (estado, api)
 *
 * Acrescentar uma pílula = um ficheiro novo aqui ao lado + uma linha nesta lista.
 */
export const PILULAS = [pilulaHoje, pilulaClientes];
