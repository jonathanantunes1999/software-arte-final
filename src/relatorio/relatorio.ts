import type { Alerta, Gravidade } from '../alertas/tipos';
import type { DocumentoInfo } from '../analise/documento';
import { formatarPaginas } from '../analise/resumo';
import { formatarMm } from '../comum/unidades';
import type { ResumoCorrecoes } from '../correcoes/aplicar';
import type { Inventario } from '../correcoes/inventario';

/**
 * Relatório para o cliente: uma página HTML autónoma (sem scripts nem ficheiros externos), pensada
 * para imprimir ou guardar em PDF. Diz o que se encontrou em linguagem simples, não o que a app fez.
 */

export interface DadosRelatorio {
  nomeFicheiro: string;
  geradoEm: Date;
  info: DocumentoInfo;
  alertas: Alerta[];
  inventario?: Inventario | null;
  /** O que se verificou (para o cliente ver que "sem alertas" não é "não verificámos") */
  verificacoes: readonly string[];
  correcoes?: ResumoCorrecoes | null;
  /** Quem assina o relatório (ex.: "Blank Studios") */
  autor?: string;
  /** Nota livre no fim */
  nota?: string;
}

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const ROTULO: Record<Gravidade, string> = { erro: 'Erro', aviso: 'Aviso', info: 'Nota' };
const ICONE: Record<Gravidade, string> = { erro: '✕', aviso: '!', info: 'i' };

export function veredito(alertas: Alerta[]): { texto: string; classe: Gravidade | 'ok'; detalhe: string } {
  const erros = alertas.filter((a) => a.gravidade === 'erro').length;
  const avisos = alertas.filter((a) => a.gravidade === 'aviso').length;
  const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;
  if (erros) return { texto: 'Precisa de correções antes de ir para produção', classe: 'erro', detalhe: `${plural(erros, 'erro', 'erros')}${avisos ? ` e ${plural(avisos, 'aviso', 'avisos')}` : ''}` };
  if (avisos) return { texto: 'Pode ir para produção, com pontos a rever', classe: 'aviso', detalhe: plural(avisos, 'aviso', 'avisos') };
  return { texto: 'Sem problemas encontrados', classe: 'ok', detalhe: 'nenhum erro nem aviso' };
}

/** Agrupa páginas seguidas com a mesma medida: "págs. 1–8: 210 × 297 mm, sangria 3 mm" */
export function resumoDasPaginas(info: DocumentoInfo): { paginas: string; medida: string; sangria: string }[] {
  const grupos: { paginas: number[]; medida: string; sangria: string }[] = [];
  for (const p of info.paginas) {
    const medida = `${formatarMm(p.larguraMm)} × ${formatarMm(p.alturaMm)} mm`;
    const s = p.sangriaMm;
    const sangria = p.origemSangria === 'nenhuma' ? 'sem BleedBox' : s.esquerda === s.direita && s.direita === s.cima && s.cima === s.baixo ? `sangria ${formatarMm(s.esquerda)} mm` : `sangria ${formatarMm(s.esquerda)}/${formatarMm(s.direita)}/${formatarMm(s.cima)}/${formatarMm(s.baixo)} mm`;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.medida === medida && ultimo.sangria === sangria) ultimo.paginas.push(p.indice);
    else grupos.push({ paginas: [p.indice], medida, sangria });
  }
  return grupos.map((g) => ({ paginas: formatarPaginas(g.paginas, 12), medida: g.medida, sangria: g.sangria }));
}

const dataPt = (d: Date) =>
  new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1b1f24; margin: 0; background: #f4f5f7; }
  main { max-width: 800px; margin: 0 auto; padding: 32px 28px 48px; background: #fff; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #5b6370; margin: 32px 0 10px; border-bottom: 1px solid #d9dce1; padding-bottom: 6px; }
  .sub { color: #5b6370; margin: 0 0 20px; }
  .veredito { border-radius: 10px; padding: 14px 18px; margin: 18px 0; border: 1px solid; }
  .veredito strong { display: block; font-size: 17px; }
  .veredito.ok { background: #e1f4ea; border-color: #1a7f4b; color: #12532f; }
  .veredito.aviso { background: #fdf0d5; border-color: #9a6200; color: #6b4300; }
  .veredito.erro { background: #fde7e4; border-color: #b42318; color: #7a130b; }
  .veredito.info { background: #e4ecfc; border-color: #2457d6; color: #163a8f; }
  .alerta { display: grid; grid-template-columns: 28px 1fr; gap: 10px; padding: 12px 0; border-bottom: 1px solid #eceef1; break-inside: avoid; }
  .icone { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 13px; color: #fff; }
  .erro .icone { background: #b42318; } .aviso .icone { background: #c27c00; } .info .icone { background: #2457d6; }
  .alerta h3 { margin: 0; font-size: 15px; }
  .alerta .rotulo { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #5b6370; margin-left: 8px; font-weight: 400; }
  .alerta p { margin: 3px 0 0; color: #3b424c; }
  table { border-collapse: collapse; width: 100%; }
  td, th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eceef1; vertical-align: top; }
  th { font-size: 12px; color: #5b6370; font-weight: 600; }
  ul { margin: 6px 0; padding-left: 20px; }
  .nota-final { margin-top: 28px; padding: 12px 14px; background: #f4f5f7; border-radius: 8px; white-space: pre-wrap; }
  footer { margin-top: 32px; color: #5b6370; font-size: 12px; }
  @media print { body { background: #fff; } main { padding: 0; max-width: none; } h2 { break-after: avoid; } }
`;

function blocoAlerta(a: Alerta): string {
  const linhas = (a.detalhe ?? '').split('\n').filter(Boolean).map((l) => `<p>${escapar(l)}</p>`).join('');
  return `<div class="alerta ${a.gravidade}"><span class="icone" aria-hidden="true">${ICONE[a.gravidade]}</span><div><h3>${escapar(a.titulo)}<span class="rotulo">${ROTULO[a.gravidade]}</span></h3>${linhas}</div></div>`;
}

export function gerarRelatorio(d: DadosRelatorio): string {
  const v = veredito(d.alertas);
  const ordem: Gravidade[] = ['erro', 'aviso', 'info'];
  const alertas = ordem.flatMap((g) => d.alertas.filter((a) => a.gravidade === g));
  const nPag = d.info.paginas.length;

  const paginas = resumoDasPaginas(d.info)
    .map((g) => `<tr><td>${escapar(g.paginas)}</td><td>${escapar(g.medida)}</td><td>${escapar(g.sangria)}</td></tr>`)
    .join('');

  const inv = d.inventario;
  const spots = inv?.spots.length
    ? `<h2>Cores especiais</h2><table><tr><th>Nome</th><th>Objetos</th></tr>${inv.spots.map((s) => `<tr><td>${escapar(s.nome)}</td><td>${s.objetos}</td></tr>`).join('')}</table>`
    : '';
  const fontes = inv?.fontes.length
    ? `<h2>Fontes</h2><ul>${[...new Set(inv.fontes.map((f) => f.nome))].map((n) => `<li>${escapar(n)}</li>`).join('')}</ul>`
    : '';

  const c = d.correcoes;
  const feitas: string[] = [];
  if (c) {
    if (c.overprintBranco) feitas.push(`${c.overprintBranco} brancos deixaram de estar em overprint`);
    if (c.overprintPreto) feitas.push(`${c.overprintPreto} pretos passaram a overprint`);
    if (c.overprintSpots) feitas.push(`${c.overprintSpots} objetos em spots técnicas passaram a overprint`);
    if (c.spotsRenomeradas) feitas.push(`${c.spotsRenomeradas} spots com o nome mudado ou juntadas`);
    if (c.coresConvertidas) feitas.push(`${c.coresConvertidas} cores de processo convertidas em spot`);
    if (c.rgb?.vetores) feitas.push(`${c.rgb.vetores} cores RGB convertidas em CMYK (conversão simples, sem perfil ICC)`);
    if (c.rgb?.imagens?.convertidas) feitas.push(`${c.rgb.imagens.convertidas} imagens RGB convertidas em CMYK`);
    if (c.sangria?.geradas.length) feitas.push(`sangria de ${c.sangria.mm} mm gerada em ${c.sangria.geradas.length} páginas (espelhando a arte junto ao corte)`);
    if (c.texto?.operadores) feitas.push(`${c.texto.operadores} textos convertidos em curvas (${c.texto.glifos} glifos)`);
  }
  const correcoes = feitas.length ? `<h2>Correções feitas</h2><ul>${feitas.map((f) => `<li>${escapar(f)}</li>`).join('')}</ul>` : '';

  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório · ${escapar(d.nomeFicheiro)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
  <h1>Relatório de verificação</h1>
  <p class="sub">${escapar(d.nomeFicheiro)} · ${nPag} ${nPag === 1 ? 'página' : 'páginas'} · ${escapar(dataPt(d.geradoEm))}</p>
  <div class="veredito ${v.classe}"><strong>${escapar(v.texto)}</strong>${escapar(v.detalhe)}</div>

  <h2>O que encontrámos</h2>
  ${alertas.length ? alertas.map(blocoAlerta).join('') : '<p>Não encontrámos nada a assinalar.</p>'}

  <h2>Medidas</h2>
  <table><tr><th>Páginas</th><th>Medida final</th><th>Sangria</th></tr>${paginas}</table>
  ${spots}
  ${fontes}
  ${correcoes}

  <h2>O que se verificou</h2>
  <p>${d.verificacoes.map(escapar).join(' · ')}.</p>
  ${d.nota ? `<div class="nota-final">${escapar(d.nota)}</div>` : ''}
  <footer>${d.autor ? `${escapar(d.autor)} · ` : ''}Verificação automática com o Arte Final. Não substitui a revisão visual da prova.</footer>
</main>
</body>
</html>
`;
}
