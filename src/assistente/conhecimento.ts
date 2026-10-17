import type { TipoCorrecao } from '../alertas/correcao-sugerida';
import type { ContextoAssistente } from './tipos';

/**
 * O que a mascote sabe explicar. Cada entrada responde em poucas linhas, em português de Portugal e sem
 * rodeios, e quando faz sentido acrescenta o que isso significa no ficheiro aberto.
 * `chaves`: radicais de palavra (match por início, com uma gralha tolerada); com "=" a palavra tem de ser exata.
 */
export interface Topico {
  id: string;
  titulo: string;
  chaves: string[];
  texto: string;
  /** Correção da app que resolve o assunto, para propor a seguir */
  correcao?: TipoCorrecao;
  /** O que isto quer dizer no ficheiro aberto (null se nada a dizer) */
  noFicheiro?: (c: ContextoAssistente) => string | null;
}

const n = (x: number, um: string, varios: string) => `${x} ${x === 1 ? um : varios}`;

export const TOPICOS: Topico[] = [
  {
    id: 'sangria',
    titulo: 'Sangria',
    chaves: ['sangri', 'bleed'],
    texto:
      'A **sangria** é a margem de arte que passa para lá da linha de corte, normalmente 3 mm. Serve para o caso de o corte falhar uns décimos: sem ela, aparece um fio branco na beira. Tudo o que toca no corte (fundos, fotos, cor) tem de continuar até à sangria.',
    correcao: 'sangria',
    noFicheiro: (c) => (c.inventario && c.paginasSemSangria > 0 ? `No teu ficheiro faltam ${c.sangriaMm} mm de sangria em ${n(c.paginasSemSangria, 'página', 'páginas')}. Posso gerá-la espelhando a arte junto ao corte.` : null),
  },
  {
    id: 'marcas',
    titulo: 'Marcas de corte',
    chaves: ['marca', 'registo', 'crop'],
    texto:
      'As **marcas de corte** são pequenos traços fora da área final que dizem à gráfica onde cortar e dobrar. Ficam afastadas da sangria, por isso a página tem de ter espaço à volta. Em offset costumam levar cor de registo; em digital basta preto. Se a gráfica põe as marcas, não as incluas tu.',
  },
  {
    id: 'rgb',
    titulo: 'RGB e CMYK',
    chaves: ['rgb', 'cmyk', 'cmik', 'quadricromia', 'tricromia', 'modo de cor', 'espaco de cor'],
    texto:
      '**RGB** é luz (ecrãs); **CMYK** é tinta (impressão). As cores muito vivas do RGB, como azuis elétricos ou verdes néon, não existem em CMYK e ficam mais apagadas ao converter. Para impressão, o ficheiro deve ir em CMYK. A conversão que faço é simples e sem perfis ICC: serve para despachar, mas num trabalho crítico converte no Illustrator ou no Photoshop com o perfil da gráfica.',
    correcao: 'rgb-cmyk',
    noFicheiro: (c) => {
      const i = c.inventario;
      if (!i || i.rgbVetores + i.rgbImagens === 0) return c.inventario ? 'Neste ficheiro não encontrei nada em RGB.' : null;
      return `No teu ficheiro há ${n(i.rgbVetores, 'cor de vetor', 'cores de vetores')} e ${n(i.rgbImagens, 'imagem', 'imagens')} em RGB.`;
    },
  },
  {
    id: 'overprint',
    titulo: 'Overprint',
    chaves: ['overprint', 'sobreimpress', 'sobrepress', 'sobreimpr'],
    texto:
      '**Overprint** (sobreimpressão) quer dizer que uma tinta imprime por cima da que está por baixo, em vez de a "furar". É bom no preto de texto e linhas finas, porque evita fios brancos se o registo falhar. Mas num objeto **branco** é um desastre: com overprint o branco desaparece, porque o branco não é tinta. E tintas técnicas (faca, vincos, verniz) normalmente devem estar em overprint.',
    noFicheiro: (c) => {
      const o = c.inventario?.overprint;
      if (!o) return null;
      const partes = [
        o.branco ? `${n(o.branco, 'branco', 'brancos')} em overprint (vão desaparecer)` : '',
        o.pretoTexto + o.pretoLinha ? `${n(o.pretoTexto + o.pretoLinha, 'preto', 'pretos')} sem overprint` : '',
        o.spotsTecnicas ? `${n(o.spotsTecnicas, 'spot técnica', 'spots técnicas')} sem overprint` : '',
      ].filter(Boolean);
      return partes.length ? `No teu ficheiro: ${partes.join(', ')}.` : 'No teu ficheiro o overprint está em ordem.';
    },
  },
  {
    id: 'spots',
    titulo: 'Cores spot',
    chaves: ['spot', 'pantone', 'direta', 'diretas', 'tinta especial', 'tintas especiais', 'tinta direta'],
    texto:
      'Uma **spot** (cor direta, como as Pantone) é uma tinta especial misturada à parte: cada uma é uma chapa extra e custa dinheiro. O erro clássico é a mesma cor com nomes diferentes ("PANTONE 185 C" e "Pantone 185C"), que a gráfica vê como duas tintas. Se a cor não tem de ser especial, é melhor converter em CMYK.',
    correcao: 'juntar-spots',
    noFicheiro: (c) => {
      const i = c.inventario;
      if (!i) return null;
      if (!i.spots) return 'Neste ficheiro não há spots.';
      return `No teu ficheiro há ${n(i.spots, 'spot', 'spots')}${i.juncoes.length ? `, e ${n(i.juncoes.length, 'está duplicada', 'estão duplicadas')} com outro nome` : ''}.`;
    },
  },
  {
    id: 'faca',
    titulo: 'Faca e vincos',
    chaves: ['faca', 'vinco', 'cortante', 'cutcontour', 'dieline', 'quebra'],
    texto:
      'A **faca** (e os vincos) é o desenho do corte e do vinco da peça: deve estar numa cor spot com nome próprio (Faca, Cortante, CutContour…), em overprint, numa chapa à parte que não imprime. Se vier em cor de processo, ela imprime como tinta no produto final.',
    correcao: 'faca-em-spot',
    noFicheiro: (c) => (c.inventario?.facas ? `Há ${n(c.inventario.facas, 'cor de processo', 'cores de processo')} usadas em traços que podem ser a faca. Diz-me qual é e converto-a em spot.` : null),
  },
  {
    id: 'resolucao',
    titulo: 'Resolução das imagens',
    chaves: ['resolucao', 'ppi', 'dpi', 'pixel', 'pixeis', 'pixelizad', 'qualidade da imagem'],
    texto:
      'A **resolução efetiva** é os pixéis da imagem a dividir pelo tamanho a que está colocada. Para impressão, 300 ppi é o habitual e abaixo de 150 ppi nota-se. Esticar uma imagem pequena baixa a resolução; e aumentá-la no Photoshop não ganha detalhe, só a disfarça. Em cartazes e lonas, vistos de longe, aceita-se menos.',
  },
  {
    id: 'tinta',
    titulo: 'Tinta total',
    chaves: ['tinta total', 'cobertura', 'soma de tintas', 'carga de tinta', 'tac'],
    texto:
      'A **tinta total** é a soma de C+M+Y+K numa zona, em %. Demasiada tinta não seca, repassa para a folha seguinte e racha. O limite depende do papel: à volta de 240% em papel de jornal, 300% como valor habitual e até 330% em couché. O limite que uso é o das Definições (300% por defeito).',
  },
  {
    id: 'preto',
    titulo: 'Preto e preto rico',
    chaves: ['preto', 'k100', 'preto rico', 'black'],
    texto:
      'Texto pequeno e linhas finas devem ir a **K 100% só**, sem C, M ou Y por baixo: com quatro tintas, se o registo falhar uma décima, as letras ficam com franjas coloridas. Já os fundos grandes de preto levam um pouco de C, M e Y por baixo do K (o "preto rico") para ficarem mais profundos, e aí a tinta total conta.',
  },
  {
    id: 'fontes',
    titulo: 'Fontes',
    chaves: ['fonte', 'tipo de letra', 'tipografia', 'incorporad', 'embedded', 'letra'],
    texto:
      'Num PDF para impressão as **fontes** devem vir incorporadas: se não vierem, a gráfica vê a letra de outro sítio, com outro desenho e outras larguras, e o texto muda ou parte. Há duas saídas: exportar com as fontes incorporadas, ou converter o texto em curvas.',
    correcao: 'curvas',
    noFicheiro: (c) => {
      const i = c.inventario;
      if (!i || !i.fontesTotal) return i ? 'Neste ficheiro não há texto em fontes.' : null;
      return `No teu ficheiro há ${n(i.fontesTotal, 'fonte', 'fontes')} em uso, ${i.fontesConvertiveis.length} a converter em curvas sem ajuda${i.fontesNaoIncorporadas ? ` e ${n(i.fontesNaoIncorporadas, 'não incorporada', 'não incorporadas')}` : ''}.`;
    },
  },
  {
    id: 'curvas',
    titulo: 'Texto em curvas',
    chaves: ['curva', 'vetoriz', 'outline', 'contorn', 'converter texto', 'converter o texto'],
    texto:
      '**Texto em curvas** é transformar as letras em desenhos (formas), por isso já não dependem de nenhuma fonte. Vantagem: aparece igual em qualquer lado. Desvantagem: o texto deixa de ser editável e pesquisável, por isso faz isso só numa cópia, e guarda o original com texto. Nas fontes que não vêm no ficheiro, só consigo desenhar se a mesma fonte estiver instalada no computador (app desktop).',
    correcao: 'curvas',
  },
  {
    id: 'linhas',
    titulo: 'Linhas finas',
    chaves: ['linha fina', 'linhas finas', 'espessura', 'filete', 'filetes', 'tracos finos'],
    texto:
      'Os **traços muito finos** podem falhar ou sair irregulares: abaixo de cerca de 0,25 pt (0,1 mm) o risco é grande, e em negativo (branco sobre fundo escuro) convém ir mais grosso, à volta de 0,5 pt. O limite que uso é o das Definições.',
  },
  {
    id: 'seguranca',
    titulo: 'Margem de segurança',
    chaves: ['seguranca', 'margem', 'zona de seguranca'],
    texto:
      'A **zona de segurança** é a distância mínima entre o texto (ou a arte importante) e o corte, normalmente 3 a 5 mm. Se o corte desviar um bocadinho, nada essencial é cortado. O valor que uso é o das Definições.',
  },
  {
    id: 'formato',
    titulo: 'Formato e caixas',
    chaves: ['formato', 'trimbox', 'bleedbox', 'mediabox', 'caixa', 'caixas', 'tamanho da pagina'],
    texto:
      'O PDF tem "caixas": a **MediaBox** (a página inteira), a **TrimBox** (o formato final, já cortado) e a **BleedBox** (com sangria). Quando a TrimBox falta, uso a MediaBox e aviso-te. O tamanho é comparado com a lista de formatos conhecidos (A4, A5…) das Definições, com uma pequena tolerância.',
  },
  {
    id: 'qr',
    titulo: 'QR codes',
    chaves: ['qr'],
    texto:
      'Os **QR codes** precisam de contraste, de uma margem branca à volta e de tamanho: abaixo de uns 20 mm de lado começam a falhar em impressão (o limite é configurável). Leio os QR codes do ficheiro e mostro para onde levam, para teres a certeza de que o link está certo antes de imprimir.',
  },
  {
    id: 'camadas',
    titulo: 'Layers',
    chaves: ['layer', 'layers', 'camada', 'camadas', 'ocg'],
    texto:
      'As **layers** do PDF podem estar ligadas ou desligadas. Uma layer escondida não deve imprimir, mas convém confirmar, porque alguns fluxos tratam isso de formas diferentes. No painel Layers podes ligar e desligar para ver o que há em cada uma.',
  },
  {
    id: 'caderno',
    titulo: 'Cadernos e páginas',
    chaves: ['caderno', 'cadernos', 'multiplo', 'lombada', 'paginacao', 'imposicao'],
    texto:
      'Em livros e revistas as páginas imprimem-se em folhas dobradas, por isso o total tem de ser **múltiplo de 4** (e muitas vezes de 8 ou 16, conforme a dobra). Se faltar, a gráfica acrescenta páginas em branco e convém decidires onde. O múltiplo que verifico é o das Definições.',
  },
  {
    id: 'pdfx',
    titulo: 'PDF/X',
    chaves: ['pdf x', 'pdfx', 'x 1a', 'x1a', 'x 4', 'x4', 'norma'],
    texto:
      '**PDF/X** é uma norma para trocar ficheiros de impressão: fontes incorporadas, sem cores ambíguas, com caixas definidas. Eu verifico muitos desses pontos (fontes, cor, caixas, sangria), mas **ainda não valido a norma PDF/X em si**. Se a gráfica exige PDF/X-1a ou X-4, exporta com essa predefinição e usa-me para conferir o resto.',
  },
  {
    id: 'copia',
    titulo: 'Cópia corrigida',
    chaves: ['copia', 'original', 'alterar', 'sobrescrev', 'substitui'],
    texto:
      'Eu **nunca altero o teu original**. Cada correção cria uma cópia nova (`_corrigido.pdf`) e podes compará-la com o original antes de descarregar. Na app desktop, ao gravar, não deixo escolher o mesmo nome do original.',
  },
  {
    id: 'privacidade',
    titulo: 'Privacidade',
    chaves: ['privacidade', 'privad', 'cloud', 'nuvem', 'internet', 'servidor', 'sai do computador', 'sai do meu computador', 'sai daqui', 'fica no computador', 'e enviado', 'e seguro', 'os meus dados'],
    texto:
      'O teu ficheiro **não sai do teu computador**. A análise, as correções e as minhas respostas correm todas aqui, sem servidores nem contas. Não preciso de internet para nada disto.',
  },
  {
    id: 'relatorio',
    titulo: 'Relatório',
    chaves: ['relatorio'],
    texto:
      'O **relatório** é uma página limpa para entregares ao cliente, com o resultado das verificações, o que foi corrigido e o que ainda fica por rever. Podes pôr o nome da tua agência nas Definições. Abre num separador novo, de onde imprimes ou guardas em PDF.',
  },
  {
    id: 'comparar',
    titulo: 'Comparar',
    chaves: ['comparar', 'compara', 'diferenca entre antes'],
    texto:
      'O **Comparar** mostra o original e a cópia corrigida lado a lado: Antes, Depois ou Diferença (os píxeis que mudaram). É a forma de confirmares que a correção fez só o que devia.',
  },
  {
    id: 'separacoes',
    titulo: 'Separações',
    chaves: ['separacao', 'separacoes', 'chapa', 'chapas', 'placas', 'placa'],
    texto:
      'As **separações** são as chapas de tinta (C, M, Y, K e cada spot) que a gráfica vai gravar. No painel Separações vês cada uma à parte, e podes simular o overprint para ver o resultado real. É aí que se percebe, por exemplo, que um branco em overprint desaparece.',
  },
];

const porId = new Map(TOPICOS.map((t) => [t.id, t]));
export const topico = (id: string): Topico | undefined => porId.get(id);

/** Que tópico explica melhor um alerta (por id do alerta)? */
const ALERTA_PARA_TOPICO: [RegExp, string][] = [
  [/sangria/, 'sangria'],
  [/marcas/, 'marcas'],
  [/^rgb/, 'rgb'],
  [/overprint/, 'overprint'],
  [/spots/, 'spots'],
  [/faca/, 'faca'],
  [/resolucao/, 'resolucao'],
  [/tinta/, 'tinta'],
  [/preto/, 'preto'],
  [/linhas/, 'linhas'],
  [/fonte/, 'fontes'],
  [/seguranca/, 'seguranca'],
  [/tamanhos|formato/, 'formato'],
  [/^qr/, 'qr'],
  [/cadernos/, 'caderno'],
];
export function topicoDoAlerta(idAlerta: string): Topico | undefined {
  const id = idAlerta.toLowerCase();
  for (const [re, t] of ALERTA_PARA_TOPICO) if (re.test(id)) return porId.get(t);
  return undefined;
}
