import type { ResumoCorrecoes } from './aplicar';

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** O que uma correção fez, em frases curtas (o painel e a mascote mostram o mesmo) */
export function descreverResumo(resumo: ResumoCorrecoes): string[] {
  const l: string[] = [];
  if (resumo.overprintBranco) l.push(`${resumo.overprintBranco} ${plural(resumo.overprintBranco, 'branco deixou', 'brancos deixaram')} de estar em overprint`);
  if (resumo.overprintPreto) l.push(`${resumo.overprintPreto} ${plural(resumo.overprintPreto, 'preto passou', 'pretos passaram')} a overprint`);
  if (resumo.overprintSpots) l.push(`${resumo.overprintSpots} ${plural(resumo.overprintSpots, 'spot técnica passou', 'spots técnicas passaram')} a overprint`);
  if (resumo.spotsRenomeradas) l.push(`${resumo.spotsRenomeradas} ${plural(resumo.spotsRenomeradas, 'espaço de cor mudou', 'espaços de cor mudaram')} de nome`);
  const t = resumo.texto;
  if (t?.operadores) l.push(`${t.operadores} ${plural(t.operadores, 'texto convertido', 'textos convertidos')} em curvas (${t.glifos} glifos)`);
  if (t?.substituidas.length) l.push(`desenhado com fontes instaladas no computador: ${t.substituidas.map((x) => `${x.fonte} → ${x.por}`).join(', ')}`);
  if (t?.fontesRemovidas.length) l.push(`${t.fontesRemovidas.length} ${plural(t.fontesRemovidas.length, 'fonte retirada', 'fontes retiradas')} do ficheiro`);
  const rgb = resumo.rgb;
  if (rgb?.vetores) l.push(`${rgb.vetores} ${plural(rgb.vetores, 'cor RGB passou', 'cores RGB passaram')} a CMYK`);
  if (rgb?.imagens?.convertidas) l.push(`${rgb.imagens.convertidas} ${plural(rgb.imagens.convertidas, 'imagem passou', 'imagens passaram')} a CMYK${rgb.imagens.indexadas ? ` (${rgb.imagens.indexadas} só na paleta)` : ''}`);
  for (const s of rgb?.imagens?.saltadas ?? []) l.push(`${s.n} ${plural(s.n, 'imagem ficou', 'imagens ficaram')} em RGB: ${s.motivo}`);
  if (resumo.sangria?.geradas.length) l.push(`sangria de ${resumo.sangria.mm} mm gerada em ${resumo.sangria.geradas.length} ${plural(resumo.sangria.geradas.length, 'página', 'páginas')}`);
  const ed = resumo.edicoes;
  if (ed) {
    const partes = [ed.apagados && `${ed.apagados} ${plural(ed.apagados, 'objeto apagado', 'objetos apagados')}`, ed.movidos && `${ed.movidos} ${plural(ed.movidos, 'movido', 'movidos')}`, ed.redimensionados && `${ed.redimensionados} ${plural(ed.redimensionados, 'mudou de tamanho', 'mudaram de tamanho')}`, ed.recoloridos && `${ed.recoloridos} ${plural(ed.recoloridos, 'mudou de cor', 'mudaram de cor')}`].filter(Boolean);
    if (partes.length) l.push(`edição: ${partes.join(', ')}`);
  }
  const lm = resumo.limpeza;
  if (lm) {
    const r = lm.removidos;
    const partes = [r.caminhos && `${r.caminhos} ${plural(r.caminhos, 'forma', 'formas')}`, r.textos && `${r.textos} ${plural(r.textos, 'texto', 'textos')}`, r.imagens && `${r.imagens} ${plural(r.imagens, 'imagem', 'imagens')}`, r.formas && `${r.formas} ${plural(r.formas, 'grupo', 'grupos')}`].filter(Boolean);
    if (partes.length) l.push(`limpeza: ${partes.join(', ')} fora da sangria retirados em ${lm.paginas.length} ${plural(lm.paginas.length, 'página', 'páginas')}`);
    if (lm.refeitas.geradas.length) l.push(`recortado à sangria e marcas de corte refeitas (${lm.refeitas.comprimentoMm} mm, a ${lm.refeitas.afastamentoMm} mm do corte) em ${lm.refeitas.geradas.length} ${plural(lm.refeitas.geradas.length, 'página', 'páginas')}`);
  }
  const mc = resumo.marcas;
  if (mc?.geradas.length) {
    const nome = `${mc.geradas.length} ${plural(mc.geradas.length, 'página', 'páginas')}`;
    l.push(`marcas de corte (${mc.comprimentoMm} mm, a ${mc.afastamentoMm} mm do corte) em ${nome}${mc.ampliadas.length ? `; ${mc.ampliadas.length === mc.geradas.length ? 'a página cresceu' : `${mc.ampliadas.length} cresceram`} para ter espaço (a medida final não mudou)` : ''}`);
    if (mc.encurtadas.length) l.push(`marcas mais curtas em ${mc.encurtadas.length} ${plural(mc.encurtadas.length, 'página', 'páginas')}, para caberem na margem`);
  }
  if (mc?.semEspaco.length) l.push(`sem marcas em ${mc.semEspaco.length} ${plural(mc.semEspaco.length, 'página', 'páginas')}: não há margem e a página não podia crescer`);
  if (resumo.coresConvertidas) l.push(`${resumo.coresConvertidas} ${plural(resumo.coresConvertidas, 'cor convertida', 'cores convertidas')} em spot`);
  return l;
}
