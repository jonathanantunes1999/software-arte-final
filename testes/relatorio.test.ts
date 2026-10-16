import { describe, expect, it } from 'vitest';
import type { Alerta } from '../src/alertas/tipos';
import type { DocumentoInfo, PaginaInfo } from '../src/analise/documento';
import { gerarRelatorio, resumoDasPaginas, veredito, type DadosRelatorio } from '../src/relatorio/relatorio';

const pagina = (i: number, l = 210, a = 297, sangria = 3, tem = true): PaginaInfo =>
  ({ indice: i, larguraMm: l, alturaMm: a, origemSangria: tem ? 'BleedBox' : 'nenhuma', sangriaMm: { esquerda: sangria, direita: sangria, cima: sangria, baixo: sangria } }) as PaginaInfo;
const alerta = (id: string, g: Alerta['gravidade'], titulo = id, detalhe?: string): Alerta => ({ id, gravidade: g, titulo, detalhe });
const dados = (extra: Partial<DadosRelatorio> = {}): DadosRelatorio => ({
  nomeFicheiro: 'cartaz.pdf',
  geradoEm: new Date('2026-10-16T09:30:00'),
  info: { paginas: [pagina(0)] },
  alertas: [],
  verificacoes: ['sangria', 'RGB'],
  ...extra,
});

describe('veredito', () => {
  it('erros mandam; depois avisos; senão, tudo bem', () => {
    expect(veredito([alerta('a', 'erro'), alerta('b', 'aviso')])).toMatchObject({ classe: 'erro', detalhe: '1 erro e 1 aviso' });
    expect(veredito([alerta('a', 'erro'), alerta('b', 'erro')]).detalhe).toBe('2 erros');
    expect(veredito([alerta('b', 'aviso'), alerta('c', 'aviso')])).toMatchObject({ classe: 'aviso', detalhe: '2 avisos' });
    expect(veredito([alerta('i', 'info')])).toMatchObject({ classe: 'ok', texto: 'Sem problemas encontrados' });
    expect(veredito([]).classe).toBe('ok');
  });
});

describe('resumo das páginas', () => {
  it('páginas seguidas com a mesma medida juntam-se', () => {
    const info: DocumentoInfo = { paginas: [pagina(0), pagina(1), pagina(2), pagina(3, 100, 100), pagina(4)] };
    expect(resumoDasPaginas(info)).toEqual([
      { paginas: 'págs. 1–3', medida: '210,0 × 297,0 mm', sangria: 'sangria 3,0 mm' },
      { paginas: 'pág. 4', medida: '100,0 × 100,0 mm', sangria: 'sangria 3,0 mm' },
      { paginas: 'pág. 5', medida: '210,0 × 297,0 mm', sangria: 'sangria 3,0 mm' },
    ]);
  });

  it('sem BleedBox e sangria desigual', () => {
    const p2 = { ...pagina(1), sangriaMm: { esquerda: 3, direita: 5, cima: 3, baixo: 3 } } as PaginaInfo;
    const r = resumoDasPaginas({ paginas: [pagina(0, 210, 297, 0, false), p2] });
    expect(r[0].sangria).toBe('sem BleedBox');
    expect(r[1].sangria).toBe('sangria 3,0/5,0/3,0/3,0 mm');
  });
});

describe('relatório HTML', () => {
  it('é um documento autónomo em PT-PT, com título, nome, páginas e data', () => {
    const h = gerarRelatorio(dados());
    expect(h.startsWith('<!doctype html>')).toBe(true);
    expect(h).toContain('<html lang="pt-PT">');
    expect(h).toContain('Relatório · cartaz.pdf');
    expect(h).toContain('cartaz.pdf · 1 página · ');
    expect(h).toContain('2026');
    expect(h).not.toMatch(/<script|<link|src=/);
  });

  it('alertas por gravidade (erros primeiro), com título e detalhe por parágrafo', () => {
    const h = gerarRelatorio(dados({ alertas: [alerta('n', 'info', 'Uma nota'), alerta('e', 'erro', 'Um erro', 'linha 1\nlinha 2'), alerta('a', 'aviso', 'Um aviso')] }));
    expect(h.indexOf('Um erro')).toBeLessThan(h.indexOf('Um aviso'));
    expect(h.indexOf('Um aviso')).toBeLessThan(h.indexOf('Uma nota'));
    expect(h).toContain('<p>linha 1</p><p>linha 2</p>');
    expect(h).toContain('Precisa de correções antes de ir para produção');
  });

  it('sem alertas diz que não há nada a assinalar', () => {
    expect(gerarRelatorio(dados())).toContain('Não encontrámos nada a assinalar.');
  });

  it('escapa HTML em tudo o que vem do ficheiro', () => {
    const h = gerarRelatorio(dados({ nomeFicheiro: '<img src=x onerror=alert(1)>.pdf', alertas: [alerta('x', 'erro', '<b>titulo</b>', 'a & "b"')], nota: '<script>x</script>', autor: 'A&B' }));
    expect(h).not.toContain('<img');
    expect(h).not.toContain('<b>titulo');
    expect(h).not.toContain('<script>x');
    expect(h).toContain('&lt;img src=x onerror=alert(1)&gt;.pdf');
    expect(h).toContain('a &amp; &quot;b&quot;');
    expect(h).toContain('A&amp;B ·');
  });

  it('nº de páginas no plural, tabela de medidas, verificações e nota', () => {
    const h = gerarRelatorio(dados({ info: { paginas: [pagina(0), pagina(1)] }, nota: 'Ver prova em papel.' }));
    expect(h).toContain('2 páginas');
    expect(h).toContain('<td>págs. 1, 2</td><td>210,0 × 297,0 mm</td><td>sangria 3,0 mm</td>');
    expect(h).toContain('sangria · RGB.');
    expect(h).toContain('<div class="nota-final">Ver prova em papel.</div>');
  });

  it('spots, fontes e correções entram quando existem', () => {
    const h = gerarRelatorio(
      dados({
        inventario: { spots: [{ nome: 'Verniz', objetos: 3, paginas: [0] }], juncoesSugeridas: [], coresDeTraco: [], overprint: { branco: 0, pretoTexto: 0, pretoLinha: 0, spotsTecnicas: 0 }, fontes: [{ id: '1 0 R', nome: 'Garamond', convertivel: true }, { id: '2 0 R', nome: 'Garamond', convertivel: true }] },
        correcoes: { overprintBranco: 1, overprintPreto: 2, overprintSpots: 0, spotsRenomeradas: 0, coresConvertidas: 0, paginas: [0], avisos: [], texto: { operadores: 5, glifos: 20, fontesConvertidas: [], fontesRemovidas: [], naoConvertido: [] } },
      }),
    );
    expect(h).toContain('<td>Verniz</td><td>3</td>');
    expect(h.match(/<li>Garamond<\/li>/g)).toHaveLength(1);
    expect(h).toContain('1 brancos deixaram de estar em overprint');
    expect(h).toContain('2 pretos passaram a overprint');
    expect(h).toContain('5 textos convertidos em curvas (20 glifos)');
    expect(gerarRelatorio(dados())).not.toContain('Correções feitas');
  });
});
