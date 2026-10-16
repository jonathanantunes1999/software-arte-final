import { describe, expect, it } from 'vitest';
import { revisarTexto, type ItemTexto, type PaginaTexto } from '../src/revisao/revisar';

/** Uma linha de texto por item, de cima para baixo */
function pagina(linhas: string[], n = 0): PaginaTexto {
  return { pagina: n, itens: linhas.map((str, i): ItemTexto => ({ str, x: 20, y: 700 - 14 * i, w: str.length * 5, h: 10, eol: true })) };
}
const ids = (p: PaginaTexto[]) => revisarTexto(p).map((a) => a.id);
const alerta = (p: PaginaTexto[], id: string) => revisarTexto(p).find((a) => a.id === id);

describe('revisão de texto PT-PT', () => {
  it('texto bem escrito não dá alertas (falsos positivos)', () => {
    const limpo = pagina([
      'A nossa equipa está a preparar o novo catálogo, com muito cuidado.',
      'Contacte-nos por telemóvel ou pelo correio eletrónico.',
      'Horário: das 9h às 18h. Preço: 19,90 € (IVA incluído).',
      'Os vossos pedidos de orçamento chegam em menos de 24 horas…',
      'O vocês, o arquivo e o garoto existem em Portugal e não são marcados.',
      'Está lindo, está bonito e está brando; o comando funciona.',
      'Muito muito obrigado. Bem bem.',
    ]);
    expect(ids([limpo])).toEqual([]);
  });

  it('vocabulário do Brasil, com a sugestão e o sítio', () => {
    const a = alerta([pagina(['Baixe no seu celular o aplicativo da equipe.', 'Tome o café da manhã no ônibus.'])], 'texto-brasileirismo')!;
    expect(a.gravidade).toBe('aviso');
    expect(a.detalhe).toContain('«celular» → telemóvel');
    expect(a.detalhe).toContain('«equipe» → equipa');
    expect(a.detalhe).toContain('«café da manhã» → pequeno-almoço');
    expect(a.detalhe).toContain('«ônibus» → autocarro');
    expect(a.locais).toHaveLength(4);
    expect(a.locais![0]).toMatchObject({ pagina: 0, caixa: { x0: 20, y0: 700 } });
  });

  it('palavras acentuadas não se apanham dentro de outras', () => {
    expect(ids([pagina(['Os celulares, a celularidade e o nosso equipement.'])])).toEqual(['texto-brasileirismo']);
    expect(alerta([pagina(['Os celulares, a celularidade e o nosso equipement.'])], 'texto-brasileirismo')!.detalhe).not.toContain('equip');
    expect(ids([pagina(['equipes'])])).toEqual(['texto-brasileirismo']);
    expect(ids([pagina(['superequipe'])])).toEqual([]);
  });

  it('gerúndio: «estou fazendo» → «estou a fazer»', () => {
    const a = alerta([pagina(['Estamos trabalhando nisso e ele está vendendo muito.', 'Elas estão partindo.'])], 'texto-gerundio')!;
    expect(a.detalhe).toContain('Estamos a trabalhar');
    expect(a.detalhe).toContain('está a vender');
    expect(a.detalhe).toContain('estão a partir');
  });

  it('formatos do Brasil: R$, CEP, CPF, CNPJ e telefones', () => {
    const a = alerta([pagina(['Por apenas R$ 19,90.', 'Indique o CEP e o CPF.', 'Ligue (21) 99999-9999.', 'CNPJ 12.345.678/0001-90'])], 'texto-formatos-br')!;
    expect(a.detalhe).toContain('euro (€)');
    expect(a.detalhe).toContain('código postal');
    expect(a.detalhe).toContain('NIF');
    expect(a.detalhe).toContain('NIPC');
    expect(a.detalhe).toContain('telefone');
    // um telefone português e códigos postais portugueses não se marcam
    expect(ids([pagina(['Telefone 912 345 678, 1000-001 Lisboa, NIF 123 456 789'])])).toEqual([]);
  });

  it('expressões: afim de, a nível de, haja visto, houveram', () => {
    const a = alerta([pagina(['Afim de melhorar, a nível de custos, houveram problemas, haja visto o prazo.'])], 'texto-expressoes')!;
    expect(a.detalhe).toContain('«Afim de» → "a fim de"');
    expect(a.detalhe).toContain('"em termos de"');
    expect(a.detalhe).toContain('«houveram» → "houve"');
    expect(a.detalhe).toContain('"haja em vista"');
    expect(ids([pagina(['A fim de melhorar, houve problemas, ao nível do bairro.'])])).toEqual([]);
  });

  it('tipografia: espaço antes da pontuação, falta de espaço, reticências, palavra repetida', () => {
    const p = pagina(['Olá , mundo ! Isto é um um erro.', 'Sem espaço,aqui e três pontos...']);
    const r = ids([p]);
    expect(r).toContain('texto-espaco-antes');
    expect(r).toContain('texto-falta-espaco');
    expect(r).toContain('texto-reticencias');
    expect(r).toContain('texto-repetida');
    expect(alerta([p], 'texto-reticencias')!.gravidade).toBe('info');
    // dois pontos não são reticências; o caráter … também não se marca
    expect(ids([pagina(['Acabou.. e depois… fim'])])).toEqual([]);
    // decimais e endereços não contam como "falta de espaço"
    expect(ids([pagina(['1,5 kg, 3.14, www.exemplo.pt/a,b'])])).toEqual([]);
  });

  it('o espaço entre itens depende da distância: «Hel»+«lo» não separa, palavras afastadas sim', () => {
    const itens: ItemTexto[] = [
      { str: 'est', x: 0, y: 700, w: 15, h: 10, eol: false },
      { str: 'ou fazendo', x: 15, y: 700, w: 50, h: 10, eol: false },
    ];
    expect(ids([{ pagina: 0, itens }])).toContain('texto-gerundio'); // "estou fazendo", a palavra reconstruiu-se
    const separados: ItemTexto[] = [
      { str: 'estou', x: 0, y: 700, w: 25, h: 10, eol: false },
      { str: 'fazendo', x: 31, y: 700, w: 35, h: 10, eol: false },
    ];
    expect(ids([{ pagina: 0, itens: separados }])).toContain('texto-gerundio');
  });

  it('mistura de ortografias: só avisa quando as duas formas aparecem', () => {
    const misto = [pagina(['A nossa ação e o projeto.']), pagina(['A acção de hoje.'], 1)];
    const a = alerta(misto, 'texto-acordo-misto')!;
    expect(a.detalhe).toContain('«ação» (pág. 1) e «acção» (pág. 2)');
    expect(a.locais![0].pagina).toBe(1);
    // só uma grafia, qualquer que seja: nada a dizer
    expect(ids([pagina(['A nossa ação e o projeto.'])])).toEqual([]);
    expect(ids([pagina(['A nossa acção e o projecto.'])])).toEqual([]);
  });

  it('agrupa por palavra e junta as páginas', () => {
    const a = alerta([pagina(['O celular.'], 0), pagina(['Outro celular.'], 3)], 'texto-brasileirismo')!;
    expect(a.detalhe!.match(/«celular»/g)).toHaveLength(1);
    expect(a.detalhe).toContain('págs. 1, 4');
  });

  it('páginas sem texto não dão erro', () => {
    expect(revisarTexto([{ pagina: 0, itens: [] }])).toEqual([]);
    expect(revisarTexto([])).toEqual([]);
  });
});
