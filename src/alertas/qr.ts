import { formatarPaginas } from '../analise/resumo';
import { descreverConteudoQr, type QrEncontrado } from '../analise/qr';
import { formatarMm, mmParaPt } from '../comum/unidades';
import type { Alerta, ConfigAlertas, Local } from './tipos';

const LIMITE_LINHAS = 6;
const LIMITE_LOCAIS = 400;

function local(q: QrEncontrado): Local {
  // um pouco de folga à volta, para o destaque não colar ao QR code
  const f = mmParaPt(1.5);
  return { pagina: q.pagina, caixa: { x0: q.caixa.x0 - f, y0: q.caixa.y0 - f, x1: q.caixa.x1 + f, y1: q.caixa.y1 + f } };
}

function linhas(qrs: QrEncontrado[]): string[] {
  const todas = qrs.map((q) => `Pág. ${q.pagina + 1}: ${descreverConteudoQr(q.texto)} (${formatarMm(q.larguraMm)} × ${formatarMm(q.alturaMm)} mm)`);
  return todas.length > LIMITE_LINHAS ? [...todas.slice(0, LIMITE_LINHAS), `…e mais ${todas.length - LIMITE_LINHAS}`] : todas;
}

/**
 * QR codes lidos no ficheiro: diz para onde levam e avisa dos que são pequenos demais para ler
 * com segurança (menos de 20 mm de lado por omissão, configurável).
 */
export function alertasQr(qrs: QrEncontrado[], cfg: ConfigAlertas): Alerta[] {
  if (!qrs.length) return [];
  const ordenados = [...qrs].sort((a, b) => a.pagina - b.pagina || b.caixa.y1 - a.caixa.y1 || a.caixa.x0 - b.caixa.x0);
  const minimo = Math.round(cfg.qrTamanhoMinimoMm * 10);
  // compara-se ao tamanho mostrado, e conta o lado mais pequeno
  const pequenos = ordenados.filter((q) => Math.round(Math.min(q.larguraMm, q.alturaMm) * 10) < minimo);

  const alertas: Alerta[] = [];
  if (pequenos.length) {
    const m = formatarMm(cfg.qrTamanhoMinimoMm);
    alertas.push({
      id: 'qr-pequeno',
      gravidade: 'aviso',
      titulo: pequenos.length === 1 ? 'QR code pequeno demais' : `${pequenos.length} QR codes pequenos demais`,
      detalhe: [`Abaixo de ${m} × ${m} mm pode não ler-se bem quando impresso.`, ...linhas(pequenos)].join('\n'),
      locais: pequenos.slice(0, LIMITE_LOCAIS).map(local),
    });
  }
  alertas.push({
    id: 'qr-codes',
    gravidade: 'info',
    titulo: ordenados.length === 1 ? 'QR code encontrado' : `${ordenados.length} QR codes encontrados`,
    detalhe: ['Confirma que levam ao sítio certo.', ...linhas(ordenados)].join('\n'),
    locais: ordenados.slice(0, LIMITE_LOCAIS).map(local),
  });
  return alertas;
}
