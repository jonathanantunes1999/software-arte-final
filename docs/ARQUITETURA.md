# Arte Final — Proposta de arquitetura

Documento de decisão técnica. Versão 1, à espera de aprovação.

---

## 1. A decisão que define o projeto

Tens razão na tua nota técnica: o pdf.js converte tudo para RGB antes de nos
entregar os operadores. Mas o problema é mais fundo do que isso. Além do CMYK,
o pdf.js também não nos dá o overprint, não distingue uma spot do seu alternate,
e não nos diz em que Optional Content Group é que cada objeto vive. Nada disto é
contornável com uma opção — a informação é descartada por desenho.

Portanto a app tem **dois motores a ler o mesmo ficheiro, para fins diferentes**:

**Motor A — pdf.js.** Só para o preview normal: rápido, fiel, lida com gradientes,
transparências e blend modes que eu não vou querer reimplementar. É o que o
utilizador vê quando abre o ficheiro.

**Motor B — analisador próprio.** Abre o PDF com o pdf-lib, percorre a árvore de
objetos e **interpreta os content streams à mão**. Produz uma lista de eventos de
desenho com a informação toda preservada. É daqui que saem os alertas, o leitor de
cor, as separações e as correções.

Não há biblioteca permissiva que faça o Motor B. As que fazem são AGPL (MuPDF,
Ghostscript) ou GPL (Poppler) e estão fora de questão para software fechado vendido.
O pdfium é BSD e seria legal, mas é um binário nativo que também não expõe CMYK nem
overprint pela API pública — teria o mesmo problema com mais complexidade de build.

Escrever o interpretador não é tão assustador como parece. Um content stream é
notação pós-fixa simples: números, nomes com barra, strings, arrays, dicionários e
operadores de duas ou três letras. São umas 500 linhas de tokenizador mais uma
máquina de estado gráfico. É código chato mas determinístico, e é 100% nosso.

## 2. A representação intermédia (IR)

Esta é a peça central. O Motor B não produz uma imagem nem uma lista de problemas:
produz uma **lista plana de eventos de desenho**, um por cada coisa que o PDF manda
pintar. Cada evento guarda a geometria já transformada para coordenadas da página, a
cor no espaço de cor original, e o estado gráfico em que foi desenhado.

```ts
type EventoDesenho = {
  id: number;
  pagina: number;
  tipo: 'preenchimento' | 'traco' | 'texto' | 'imagem' | 'shading';
  caminho: Subcaminho[];          // coordenadas de página, em pt
  bbox: [x0, y0, x1, y1];
  cor: Cor;                        // no espaço ORIGINAL
  corTraco?: Cor;
  espessuraTraco?: number;         // em pt, já com a escala da CTM aplicada
  overprintPreenchimento: boolean; // operador op
  overprintTraco: boolean;         // operador OP
  modoOverprint: 0 | 1;            // OPM
  ocg?: string;                    // layer, se estiver dentro de BDC/EMC
  texto?: { fonte: RefFonte; tamanho: number; conteudo: string };
  imagem?: { larguraPx, alturaPx, espacoCor, bitsPorComponente, filtro };
  recorte?: bbox;
};

type Cor =
  | { espaco: 'DeviceCMYK'; valores: [c, m, y, k] }
  | { espaco: 'DeviceRGB';  valores: [r, g, b] }
  | { espaco: 'DeviceGray'; valores: [k] }
  | { espaco: 'Separation'; nome: string; tinta: number; alternate: Cor }
  | { espaco: 'DeviceN';    nomes: string[]; tintas: number[] }
  | { espaco: 'ICCBased';   nComponentes: number; valores: number[] }
  | { espaco: 'Indexed' | 'Lab' | 'Pattern'; /* ... */ };
```

Tudo o que a app faz é uma leitura deste IR. Cada alerta é uma função pura
`(ir, definicoes) => Alerta[]`, o que os torna triviais de testar e de desligar.
O leitor de cor é um hit-test geométrico no IR. As separações são uma rasterização
do IR, canal por canal.

É a diferença entre uma oficina que desmonta o motor uma vez e põe as peças na
bancada etiquetadas, e uma que o abre de novo a cada pergunta. Quase tudo o que
está na tua lista de "fora de âmbito agora" cai depois no IR sem refactor: o
excesso de tinta é somar canais por região, as sugestões de Pantone leem a cor do
evento debaixo do cursor, a sangria automática identifica os eventos que tocam a
TrimBox.

## 3. Bibliotecas e licenças

Nenhuma dependência AGPL ou GPL. Nada que impeça venda como software fechado.

### Núcleo

| Biblioteca | Versão | Licença | Para que serve |
|---|---|---|---|
| Electron | 44.x | MIT | Shell da app, Mac e Windows do mesmo código |
| pdf.js (`pdfjs-dist`) | 6.x | Apache-2.0 | Motor A: preview, zoom, navegação |
| pdf-lib | 1.17.x | MIT | Abrir a árvore de objetos, descomprimir streams, e escrever as correções |
| pako | 3.x | MIT AND Zlib | Flate. Vem com o pdf-lib, não é instalação separada |
| fontkit | 2.x | MIT | Ler fontes incorporadas: nome real, se tem glifos, e os contornos para a Fase 4 |
| jsQR | 1.4.x | Apache-2.0 | Ler QR codes de uma região rasterizada |

### Interface

| Biblioteca | Versão | Licença | Para que serve |
|---|---|---|---|
| TypeScript | 7.x | Apache-2.0 | Tipos |
| Svelte | 5.x | MIT | Componentes da UI |
| Vite | 8.x | MIT | Build e hot reload |
| electron-store | 12.x | MIT | Definições em JSON: formatos, limites, tema |

### Desenvolvimento e distribuição

| Biblioteca | Versão | Licença | Para que serve |
|---|---|---|---|
| Vitest | 5.x | MIT | Testes |
| electron-builder | 26.x | MIT | `.dmg` assinado e notarizado, `.exe` com instalador |

### Guardado para depois, já verificado

O **Little CMS (lcms2)** é MIT e compila para WASM. É o que vamos precisar no dia em
que houver conversões reais de RGB para CMYK com perfis ICC. Para a Fase 2 não é
preciso: detetar que um objeto está em RGB é ler o espaço de cor, não é converter nada.

### Rejeitadas por licença

MuPDF e Ghostscript (AGPL), Poppler (GPL), `pdf2json` e companhia (wrappers de
binários GPL). O pdfium é BSD-3 e legalmente servia, mas não resolve o problema
central e traria build nativo por plataforma.

## 4. Estrutura do projeto

```
arte-final/
├── src/
│   ├── principal/                 # processo main do Electron
│   │   ├── main.ts
│   │   ├── ipc.ts                 # canais tipados
│   │   └── definicoes.ts
│   ├── analise/                   # MOTOR B — Node puro, zero Electron
│   │   ├── documento.ts           # abre o PDF, páginas, caixas, OCProperties
│   │   ├── lexer.ts               # tokenizador de content stream
│   │   ├── interpretador.ts       # máquina de estado gráfico -> IR
│   │   ├── espacos-cor.ts         # resolução de ColorSpace e tint transforms
│   │   ├── fontes.ts              # incorporação, nomes, subsets
│   │   ├── imagens.ts             # dimensões, espaço de cor, PPI efetivo
│   │   └── ir.ts                  # os tipos acima
│   ├── alertas/                   # um ficheiro por alerta, função pura
│   │   ├── registo.ts             # lista de alertas ativos + metadados
│   │   ├── sangria.ts
│   │   ├── marcas-corte.ts
│   │   ├── rgb.ts
│   │   ├── resolucao.ts
│   │   ├── fontes.ts
│   │   ├── overprint-branco.ts
│   │   ├── overprint-ausente.ts
│   │   ├── zona-seguranca.ts
│   │   ├── preto.ts
│   │   ├── linhas-finas.ts
│   │   ├── spots-duplicadas.ts
│   │   └── qr-codes.ts
│   ├── correcoes/                 # FASE 4 — nunca toca no original
│   │   ├── gravar-copia.ts
│   │   ├── criar-spot.ts
│   │   ├── corrigir-overprint.ts
│   │   ├── juntar-spots.ts
│   │   ├── texto-em-curvas.ts
│   │   └── comparar-versoes.ts
│   ├── separacoes/                # rasterizador por canal com overprint
│   │   └── rasterizador.ts
│   ├── interface/                 # Svelte
│   │   ├── App.svelte
│   │   ├── painel-alertas/
│   │   ├── visualizador/
│   │   ├── leitor-cor/
│   │   ├── layers/
│   │   ├── separacoes/
│   │   └── definicoes/
│   └── comum/
│       ├── unidades.ts            # pt <-> mm, uma casa decimal
│       └── formatos.ts            # A0-A7, DL, cartao de visita, + os do utilizador
├── testes/
│   ├── fixtures/gerar/            # geradores de PDFs de teste
│   └── alertas/                   # um .test.ts por alerta
└── docs/ARQUITETURA.md
```

Repara que `src/analise/` e `src/alertas/` não importam nada do Electron nem do
Svelte. São Node puro. Isto significa que correm nos testes sem abrir uma janela, e
que no dia em que quiseres uma versão web ou uma ferramenta de linha de comando,
este código vem inteiro.

## 5. Processos e desempenho

O interpretador corre num `utility process` do Electron, não no main. Um PDF de
800 páginas de catálogo não pode congelar a janela. O fluxo:

1. O utilizador larga o ficheiro. O renderer manda o caminho para o main.
2. O main confirma o acesso, lê as caixas da primeira página e devolve logo a medida
   final, a etiqueta de formato e a sangria. **Isto aparece em menos de 100 ms** —
   é a informação que se consulta cinquenta vezes por dia e não pode esperar.
3. Em paralelo, o pdf.js começa a renderizar a página 1.
4. O utility process constrói o IR, página a página, e emite alertas à medida que os
   encontra. O painel da esquerda preenche-se progressivamente, com uma barra de
   progresso em vez de um modal bloqueante.

## 6. Decisões que valem discussão

**TypeScript, não JavaScript.** Sei que dominas JS e que o TS é mais um degrau. Mas
este projeto são dezenas de formas diferentes de representar uma cor, e quase todos
os bugs vão ser "achei que esta cor era CMYK e era uma Separation com alternate em
Lab". Em JS descobres isso quando um cliente imprimir 5000 flyers errados. Em TS o
editor avisa-te enquanto escreves. É a diferença entre medir a chapa antes de cortar
e cortar primeiro. O resto do código é JavaScript com anotações — não precisas de
aprender TS avançado para começar.

**Svelte em vez de React.** Um componente Svelte é um ficheiro com HTML, CSS e JS
dentro, que é literalmente o que já sabes fazer. O React obriga-te a aprender JSX,
hooks e regras de re-render antes de pintares o primeiro pixel. Numa app com quatro
painéis que têm de estar sincronizados, o Svelte chega lá com metade do código.

**O rasterizador de separações é código nosso, e não vai ficar igual ao Acrobat.**
Para ligar e desligar canais individualmente com simulação de overprint, tenho de
pintar cada separação à mão a partir do IR: para cada canal, desenho a geometria num
canvas em tons de cinzento com a intensidade dessa tinta, e depois componho os canais
ativos. O overprint sai naturalmente — em overprint, um objeto só escreve nos canais
onde tem tinta, em vez de zerar os outros. Vai funcionar bem para vetores, texto e
imagens simples, que é 95% do que entra numa gráfica. Gradientes com transparência,
padrões e blend modes vão ficar aproximados. Prefiro dizer-te isto agora do que
prometer paridade com o Acrobat e falhar na Fase 3.

**O texto em curvas é a coisa mais difícil da lista e devia ser o último.** Tenho de
extrair os contornos dos glifos da fonte incorporada com o fontkit, converter para
caminhos, e reescrever o content stream a substituir os operadores de texto por
geometria, com a matriz de texto certa em cada caso — incluindo kerning, modos de
render, texto em Type 3 e fontes CID. Proponho tirá-lo da Fase 4 e tratá-lo como
Fase 5, depois de o resto estar sólido. A comparação lado a lado que pedes deixa de
ser um extra e passa a ser a rede de segurança obrigatória.

**Falsos positivos nas marcas de corte e na zona de segurança.** As marcas de corte
não são um objeto de PDF, são só linhas. Vou detetá-las por heurística: traços
curtos, em cor de registo ou com os quatro canais iguais, perto dos cantos da
TrimBox e fora da BleedBox. Um ficheiro com marcas feitas de forma invulgar pode
escapar. Na zona de segurança tenho de distinguir conteúdo de fundo, senão qualquer
fundo sangrado dispara o alerta. A regra que proponho: um objeto que cubra mais de
90% da TrimBox é fundo e não conta. Vamos ter de afinar isto com ficheiros reais
teus.

**Segurança do ficheiro original.** Abre-se em leitura e nunca se reescreve no sítio.
Cada correção grava uma cópia nova. Vou pôr um teste automático que calcula o SHA-256
do original antes e depois de cada correção e falha a suite se mudar um único byte.

## 7. Estratégia de testes

Para cada alerta, um gerador em `testes/fixtures/gerar/` que produz dois PDFs com o
pdf-lib: um que tem o problema e um que não tem, igual em todo o resto. O teste
confirma que o alerta dispara no primeiro e fica calado no segundo. O segundo é tão
importante como o primeiro — um verificador que grita a cada ficheiro é um
verificador que se desliga.

O pdf-lib deixa-nos escrever operadores crus no content stream, o que é exatamente
o que precisamos: um PDF com branco 0/0/0/0 em overprint não se faz com uma API de
alto nível, faz-se a escrever `/GS0 gs 0 0 0 0 k`.

## 8. Antes de vender

Duas coisas que não são código e que convém saberes já. Para distribuir no Mac sem
o Gatekeeper bloquear, é preciso uma conta Apple Developer, 99 dólares por ano, para
assinar e notarizar — o electron-builder faz o resto. E uma app Electron é
JavaScript dentro de um ficheiro `.asar` que qualquer pessoa consegue abrir; se a
proteção do código importar, falamos disso na altura, mas não vale a pena resolver
agora.

## 9. Ordem de trabalho proposta

Fase 1 como está no teu briefing. Fase 2 por ordem de valor: sangria, RGB,
resolução e fontes primeiro, porque são 80% do que rejeita um ficheiro; overprint,
preto, linhas finas, zona de segurança e spots duplicadas depois; marcas de corte e
QR codes por último, que são os mais heurísticos. Fase 3. Fase 4 sem o texto em
curvas. Fase 5, o texto em curvas com a comparação lado a lado.

Cada fase entrega-se a funcionar, com testes a passar, antes de começar a seguinte.

---

## 10. Ajustes feitos durante a Fase 1

**O analisador recebe bytes, não caminhos de ficheiro.** Assim corre igual no
browser (File API) e no Electron. A app desenvolve-se e testa-se primeiro no
browser com o Vite, e o Electron entra depois como casca fina (abrir ficheiros do
disco, guardar cópias, empacotar).

**pdf.js em build "legacy".** A build normal da versão 6 usa
`Map.prototype.getOrInsertComputed`, que Safari e Chrome desatualizados não têm, e
a página fica em branco. A build legacy traz os polyfills. Foi apanhado a abrir a
app num browser a sério, não nos testes unitários.

**TypeScript 6 e não 7.** O `svelte-check` ainda não suporta o TypeScript 7 sozinho.
Mesma licença (Apache-2.0). Revisitar mais à frente.

**Sangria sem BleedBox.** Quando o ficheiro não define BleedBox a app diz
"Sem BleedBox" em vez de inventar 0 mm. Medir a sangria real pelo conteúdo é
trabalho da Fase 2.

**Alertas como funções puras.** Já existe `src/alertas/tipos.ts` e o primeiro alerta
(`tamanhos-diferentes.ts`), no formato que os restantes vão seguir.

---

## 11. O que a Fase 2 trouxe até agora

**Interpretador de content streams (o Motor B).** `src/analise/`: tokenizador
(`lexer.ts`), espaços de cor (`cores.ts`), fontes com larguras de glifos
(`fontes.ts`) e o interpretador (`interpretador.ts`), que percorre cada página e
produz a lista de eventos de desenho descrita na secção 2. Trata matrizes,
recortes, curvas de Bézier com extremos exatos, Forms aninhados, imagens inline,
overprint, layers e texto. Validado com os ficheiros reais: o cortante dá exatamente
os mesmos números que uma contagem à mão.

**Layers desligadas por omissão não contam.** O primeiro protótipo ignorava isto e
dizia que o azeite tinha 38 traços pretos sem overprint. Estavam em layers
desligadas (`/OCProperties/D/OFF`), por isso não imprimem. O interpretador respeita
a visibilidade, e há teste para isso.

**A sangria mede-se pelo conteúdo.** Uma BleedBox de 3 mm não prova nada se o fundo
pára no corte. O alerta olha para o que realmente toca na linha de corte e vê quanto
passa dela. O limite é a área de produção: a BleedBox se existe (é por onde o RIP
recorta), senão a CropBox (o default da especificação). Ignora branco, texto, registo
e spots técnicas.

**Análise num Web Worker.** `trabalhador.ts` abre o PDF, mede e analisa fora da thread
da interface, e guarda a análise. Mudar um limite nas Definições recalcula só os
alertas, sem reler o PDF.

**Limitações conhecidas desta fase:**

- "Toca no corte" usa a caixa envolvente do objeto. Uma forma redonda ou inclinada
  encostada ao corte num só ponto é apanhada, e o destaque cobre a aresta toda. A fase
  3 (leitor de cor) precisa de guardar os caminhos, e aí afina-se.
- Padrões (Pattern) e Type3 não são lidos por dentro. A app avisa quando os encontra.
- Fontes compostas assumem códigos de 2 bytes (certo para Identity-H, aproximado para
  CMaps antigos). Só afeta a caixa do texto, não se a fonte está incorporada.
- Degradés (`sh`) contam como ocupando toda a área de recorte.
- As anotações e campos de formulário não são analisados.

---

## 12. RGB e resolução

**Resolução efetiva.** Pixels da imagem a dividir pelo tamanho a que está colocada, calculado
pelo comprimento dos lados da imagem (por isso uma imagem rodada dá o valor certo). Usa-se o
pior dos dois eixos e diz-se "esticada" quando diferem mais de 15%. Compara-se ao valor
arredondado: 299,7 ppi diz-se 300 e não alerta. Sem isto, uma imagem rodada 45° dava 299,9999
por erro de vírgula flutuante e disparava o aviso. Imagens todas fora da área de produção (na
zona das marcas) ou recortadas não contam.

**RGB.** Conta vetores, texto e imagens (DeviceRGB, CalRGB e ICCBased de 3 componentes). RGB
branco puro não conta, porque converte para papel. RGB preto conta, porque converte para um
preto de quatro cores. Texto invisível (camada de OCR) e layers desligadas ficam de fora. O
destaque junta objetos a menos de 5 mm numa só mancha (`alertas/geometria.ts`), em vez de
marcar a página inteira.

**Gravidade do RGB.** Está como aviso, não erro: numa impressão digital RGB é aceitável. Se a
gráfica trabalha só em offset, passa a erro com uma linha.

**Limites que ficam por afinar com ficheiros reais:** imagens a 1 bit (traço, scans) seguem os
mesmos 300/150 ppi das fotos, mas o habitual para traço é 600 a 1200 ppi.

---

## 13. Linhas finas e preto

**Área real do preenchimento.** Para saber se um fundo é "grande" a caixa do objeto não
serve: uma moldura preta tem a caixa da página inteira e quase nenhuma tinta. O interpretador
calcula agora a área de cada preenchimento pelo contorno (fórmula do cordão, com cinco pontos
por curva de Bézier, erro de cerca de 1% num círculo). Os buracos descontam-se por contenção e
conforme a regra de preenchimento: `f*` (par-ímpar) alterna a cada nível, `f` (enrolamento) só
faz buraco quando o contorno interior tem sentido contrário. Isto apanhou um erro meu a meio:
somar as áreas com sinal dava 16400 em vez de 3600 numa moldura feita com dois `re` e `f*`.
A área reduz-se pela fração da caixa que fica visível depois do recorte.

**Linhas finas.** Traços abaixo de 0,25 pt (configurável), já com a escala da matriz.
Espessura 0 conta. Não contam faca, vincos, registo e tintas a 0%, nem o que está fora da
área de produção (marcas de corte). Compara-se em milésimos de ponto: 0,25 pt escritos como
0,0881944 mm davam 0,2499999999999999 em bruto e disparavam o aviso.

**Preto de quatro cores.** K ≥ 70% com C, M e Y todos acima de 5%. Um preto de duas ou três
tintas (por exemplo 30/0/0/100) não conta, porque a definição é a de quatro cores. O texto só
é apanhado abaixo do limite (12 pt, configurável), pelo corpo efetivo com a escala. O RGB preto
é assunto do alerta de RGB.

**Fundo só em K.** CMYK 0/0/0/100 ou cinzento 0, com área dentro do corte a partir de 25% da
página (configurável). Conta objeto a objeto: vários fundos pretos adjacentes que somem mais de
25% não são apanhados. Só a parte dentro do corte conta, não a sangria.

**Fica por afinar com ficheiros reais:** o limite dos 25% e o dos 12 pt são palpites razoáveis,
não regras. Os valores que a gráfica usa podem ser outros.

---

## 14. Spots duplicadas

**O que conta como a mesma cor.** Compara-se por uma chave (`chaveSpot` em `analise/cores.ts`):
maiúsculas, espaços e pontuação não contam. Nas Pantone, o sufixo CV e CVC (as versões
"color bridge" da cor revestida) conta como C, e CVU como U. Revestido (C) e não revestido (U)
ficam como cores diferentes, porque são tintas de referência diferentes. "Verniz" e "Verniz 2"
também ficam diferentes: não se adivinha que um número no fim é uma cópia.

**Só conta o que se usa.** A análise parte dos objetos visíveis, não dos espaços de cor
declarados nos recursos. Uma amostra esquecida na paleta que nunca é pintada não gera chapa, por
isso não alerta. Layers desligadas e objetos recortados também ficam de fora. Contam
preenchimentos, traços, texto e imagens (Separation e DeviceN).

**Tintas de processo e de sistema não são spots.** Cyan, Magenta, Yellow, Black, All e None (que
aparecem em DeviceN, ou como registo) ficam fora, para que `Black` e `BLACK` não sejam apontadas.

**O que se destaca.** O nome mais usado fica como a referência e os objetos dos outros nomes são
os apontados, porque é isso que se corrige. Em empate, fica o primeiro.

**Fica de fora:** duas spots com o mesmo nome mas valores alternativos diferentes (a mesma tinta
definida de duas maneiras), e duas spots com nomes diferentes que têm o mesmo valor de CMYK ou
Lab. A primeira é um problema parecido mas não está na lista.

---

## 15. Zona de segurança

É o alerta mais exposto a falsos positivos, por isso as regras são estas:

- **Texto** conta sempre, mesmo que passe o corte (e então diz quanto passa). Texto branco conta:
  numa caixa escura é igualmente cortado. Não conta texto invisível, recortado, numa layer
  desligada ou todo fora do corte (legendas de marcas).
- **Imagens e gráficos** só contam se estiverem dentro do corte **sem lhe tocar**. O que toca ou
  passa o corte é fundo ou tem sangria, e isso é assunto do alerta de sangria. Um painel que cobre
  90% ou mais do corte também é tratado como fundo, mesmo sem lhe tocar.
- Não contam branco, faca, vincos, verniz e registo (spots técnicas), nem degradés (a caixa de um
  `sh` é a do recorte, não a do degradé).
- Distância medida à TrimBox, comparada ao valor arredondado a uma casa decimal.

**A caixa do texto é aproximada.** Muitas fontes declaram um Ascent perto de 1 em, bem acima das
letras, e isso fazia aparecer texto "a 2,4 mm" que na verdade estava a 3,2 mm. O Ascent limita-se
a 0,8 em e o Descent a 0,25 em (`analise/fontes.ts`), o que aproxima a caixa da tinta. Está
testado com uma fonte de Ascent 1000.

**Limitação importante: a medida é contra o retângulo da TrimBox.** Numa peça cortada à faca com
forma (uma etiqueta redonda, por exemplo) a linha de corte verdadeira é a forma, não o retângulo.
O texto que segue o contorno aparece como "perto do corte" nos pontos em que a forma toca o
retângulo. A forma real está no ficheiro (a linha da faca), por isso pode medir-se contra ela.
Não está feito.

**Por afinar:** o limiar dos 90% para "é fundo" é um palpite. Um painel que cubra, por exemplo,
85% do corte conta como conteúdo.

---

## 16. Marcas de corte

**O que o interpretador passou a guardar.** Os traços feitos só de segmentos retos (até 16)
guardam a lista `[x0, y0, x1, y1]`. Sem isto não dava: muitos exportadores desenham as marcas
de um canto, ou as oito, num só caminho (`m l m l ... S`), e a caixa disso é um retângulo, não uma
linha. Curvas, ou mais de 16 segmentos, e o campo fica vazio.

**Como se reconhece uma marca.** Uma linha reta horizontal ou vertical, com 1,5 a 30 mm, de
espessura até 2 pt, a menos de 40 mm do corte, com o centro do lado de fora de um canto e
alinhada com a aresta correspondente (até 2 mm de desvio; acima de 0,35 mm diz-se "desalinhada").
Procuram-se oito por página, duas por canto. Marcas a 0% de tinta ou em layers desligadas não contam.

**Como se avalia.** Para cada marca encontrada: está fora do corte (senão "entra X mm no corte"),
fora da sangria (a da BleedBox se existe, senão a de referência das definições), alinhada, e em
cor de registo (a tinta `All`). Quando há duas marcas no mesmo sítio, por exemplo uma em preto e outra
em registo, conta a que tem menos defeitos.

**Quatro alertas:** sem marcas (aviso), incompletas (aviso), mal colocadas (aviso), e sem
espaço para elas (informação, quando a página não tem margem além da sangria). Há um interruptor
nas Definições para trabalhos sem marcas.

**Validado com um ficheiro real.** O cortante da M2 tem exatamente as oito marcas padrão (9,5 mm,
a 5 mm do corte, em registo a 0,25 pt) e a verificação leu-as todas sem alertar. Tem também uma
linha fantasma de 1,25 pt a 0% de tinta, que se ignora.

**O que não se deteta:**
- Marcas desenhadas como retângulos preenchidos finíssimos, em vez de traços.
- Marcas na diagonal, marcas de centro e alvos de registo.
- Marcas de corte feitas de texto ou de imagens.

Num ficheiro sem marcas e sem espaço para elas, como o azeite (a página acaba na sangria), o
alerta é só informação. Num documento sem TrimBox mas com margem, como o livro, dá aviso em todas
as páginas: o interruptor das Definições existe para isso.

**Marcas só a preto para impressão digital:** feito (opção das Definições). **Criar as marcas** num
ficheiro que não as tem: ver §35.

---

## 17. QR codes

**Como se lêem.** Renderiza-se cada página com o pdf.js, a 200 dpi, e procura-se o QR code na
imagem com o jsQR (Apache-2.0). Lê o que se vê, por isso trata da mesma maneira os QR codes
vetoriais (os mais comuns, feitos no Illustrator) e os em bitmap, sem descodificar JPEG, JBIG2 e
afins à mão. A renderização corre no thread principal (é o que o pdf.js faz) e a leitura num
worker próprio (`qr-trabalhador.ts`), em segundo plano e depois da análise do PDF.

**O jsQR não aguenta vários QR codes na mesma imagem.** Medi: com um lê sempre, com dois lê um ou
nenhum, com três não lê nenhum, e cada um sozinho lê sempre. Em vez de varrer a página aos
mosaicos, procura-se primeiro as zonas candidatas (`encontrarCandidatos`): manchas de 7 a 150 mm
de lado, aproximadamente quadradas (proporção entre 0,7 e 1,43) e quase cheias depois de dilatar
(densidade acima de 70%). Lê-se cada zona em separado. A densidade mede-se depois de dilatar
porque, com módulos do tamanho de uma célula de 4 px, só metade das células tem tinta antes
(foi um erro meu, apanhado por um QR de 14 mm).

**Porque não varrer tudo.** O jsQR demora ~190 ms numa página A4 vazia, mas **2,4 s** numa
página com muita mancha escura (texto, fotografia). A procura por candidatos custa uma fração
disso e é o que torna possível ler dezenas de páginas.

**Páginas.** Só se procuram as páginas com gráficos ou imagens (uma página só de texto não pode ter
um QR code) e no máximo as primeiras 60. Se há mais, o painel diz-o. O livro de 473 páginas
(60 lidas) fica pronto em ~9 s no total, com a interface a responder.

**O tamanho** mede-se pelos lados do símbolo (sem a zona de silêncio), a partir dos cantos que o
jsQR devolve, e funciona com o QR rodado. Medi 25,0 e 12,0 mm em QR codes desenhados com esses
tamanhos, e 23,6 contra 23,5 num bitmap. Compara-se ao valor arredondado, pelo lado mais pequeno.

**O que diz.** O conteúdo descreve-se em português simples: ligação (com o endereço), email,
telefone, SMS, localização, cartão de contacto e texto. Num QR de Wi-Fi diz o nome da rede e nunca
a palavra-passe.

**Limitações:**

- **Só avisa de um QR pequeno se o conseguir ler.** Um QR tão pequeno ou tão degradado que nem se
  lê aqui não aparece. A 200 dpi, abaixo de uns 10 mm já não é fiável.
- **QR codes sobre um fundo escuro ou uma fotografia** não são encontrados como candidatos. Um QR
  invertido (branco sobre um quadrado preto) lê-se; um QR preto sobre um fundo escuro não.
- QR codes escondidos numa layer desligada não se veem, e por isso não contam.
- Só se procura nas primeiras 60 páginas com gráficos.

---

## 18. Overprint

**O modo de overprint decide se funciona.** Ligar o overprint não chega. Em CMYK, com o modo 0
(o valor por omissão), os zeros de C, M e Y também "pintam" e apagam o que está por baixo, por isso
um `0 0 0 1 k` em overprint continua a fazer knockout. Só com o modo 1 é que o zero deixa a tinta
de baixo em paz. O Illustrator escreve sempre o modo 1, mas outros programas não. Nas spots o modo
não conta. `overprintEfetivo` aplica isto, e o alerta diz quando o overprint está ligado em modo 0
("parece certo e não funciona").

**Três verificações:**

1. **Branco com overprint** (erro). CMYK 0/0/0/0 em overprint no modo 1 desaparece. Só se alerta se
   houver algo pintado antes e por baixo (pela ordem de pintura e pela caixa), porque branco em
   overprint sobre papel não faz diferença. No modo 0 o branco apaga e mostra-se, por isso não conta.
   O cinzento 100% e o RGB branco não entram: o overprint não os afeta da mesma maneira.
2. **Preto sem overprint** (aviso): texto, e linhas até 1 pt (configurável), em K 100% (CMYK
   0/0/0/100 ou cinzento 0), sobre cor, sem overprint efetivo. "Sobre cor" quer dizer que por baixo há
   algo com C, M ou Y, uma spot, uma imagem a cores ou um degradé. K, cinzento e branco por baixo
   não contam, porque não há cor para apagar.
3. **Spots técnicas sem overprint** (erro): faca, vincos, verniz, branco e o que estiver na lista
   das Definições. Sem overprint apagam a arte por baixo. Tintas a 0% e o registo (All) ficam fora.

**A gravidade é um juízo meu.** Faca e branco são erro (estragam o trabalho); o preto é aviso
(risco de halo, não certeza). Se na M2 for diferente, muda-se numa linha.

**Validado com:** o cortante real da M2, que tem overprint feito à mão (faca, vincos e K 100%
ligados, modo 1) e dá zero alertas de overprint; e com PDFs fabricados para cada caso. **Não foi
validado com um ficheiro de cliente com o erro verdadeiro.** Falta um.

**Limitações:**
- "Por baixo" mede-se pelas caixas dos objetos, não pelo contorno. Um texto ao lado de um fundo com
  buraco pode contar como sobre cor.
- Só se consideram texto e linhas finas. **Os preenchimentos K 100% grandes (uma barra preta, um
  fundo) não entram**, embora muitas gráficas também os queiram em overprint. Não está na lista
  pedida, e o azeite tem dois: não é apanhado.
- Não se simula o resultado (isso é a pré-visualização de saída, da Fase 3).

## 19. Inspeção visual (Fase 3)

Três partes: leitor de cor, layers e separações.

### Leitor de cor
A IR só guardava caixas. Com `geometria: true` o interpretador guarda também os contornos das formas
(pontos em pt, curvas aproximadas por segmentos, regra de preenchimento, e se cada contorno foi
fechado). Só se pede para a página que se está a ver: o worker interpreta-a a pedido
(`inspecionar`), por isso não há custo de memória em documentos grandes. `objetosEm()` faz o
hit-test de cima para baixo: ponto-no-polígono (enrolamento ou par-ímpar, conforme `f` ou `f*`),
distância ao traço (com tolerância de 3 px de ecrã para linhas finas) e, para texto, imagens e
degradés, a caixa. Não conhece opacidades.

### Layers
O interpretador regista as layers (OCGs) que a página referencia, mesmo as desligadas. O estado
escolhido pelo utilizador viaja como `sobreposicoes` (etiqueta → visível) e é aplicado nos dois
motores: ao pdf.js por `optionalContentConfigPromise` (o id é `12R`, não `12 0 R`), e ao
interpretador (`ocgOcultos`). A lista de layers de uma página não encolhe quando se desliga uma
layer que contém outras.

### Separações
**Em vez de escrever um rasterizador** (que obrigaria a desenhar texto, ou seja, a ler contornos das
fontes), reescreve-se o content stream **uma vez por placa** e deixa-se o pdf.js desenhar tudo.
- O interpretador ganhou um **observador**: para cada operador de cor e de pintura diz a posição no
  stream (`inicio`/`fim`, que o lexer passou a dar), a cor, o overprint, o modo, as opacidades e se
  está numa layer desligada.
- `reescreverFluxo` troca cada cor por um cinzento (0 = tinta a 100%) e põe, antes de cada pintura,
  uma opacidade: **0 se o objeto deixa a placa em paz** (overprint em placas que não marca), a
  original se a marca. Branco e zero apagam (knockout). Num caminho a opacidade vai antes de ele
  começar, porque entre a construção e a pintura não se podem pôr operadores gráficos.
- `marcaPlaca` tem as regras: sem overprint tudo marca tudo; CMYK marca as quatro (modo 0) ou as
  componentes não nulas (modo 1); cinzento só o K; spot só a sua placa; All todas; None nenhuma;
  RGB, Lab e padrões ignoram o overprint.
- `separarPagina` monta, no worker, um PDF novo com **uma página por placa**, copiando para ele só
  o necessário (fontes partilhadas entre placas). O original não é tocado: só se criam objetos novos.
- Imagens: cinzento fica como está na placa K (e uma imagem branca de 1×1, com as mesmas máscaras,
  nas outras: apaga o que está por baixo). CMYK, RGB (conversão ingénua), Indexed, Separation e
  DeviceN descodificam-se e cada placa recebe o seu plano (255 − tinta) como imagem de cinzentos.
  JPEG por um descodificador próprio (`src/vendor/jpeg-decoder.js`, vindo do jpeg-js/pdf.js, que
  devolve os 4 componentes sem inverter: quem inverte é o `/Decode`). Imagens com mais de 16 MP
  reduzem-se por saltos.
- Degradés axiais e radiais (e padrões de degradé): a função de cor passa a uma função amostrada
  (256 pontos) com a tinta da placa. Spots que só aparecem em imagens ou degradés também ganham placa.
- No ecrã (`compor`), as placas multiplicam-se sobre o papel, cada uma com a cor da sua tinta (as
  spots, a cor do espaço alternativo, avaliada a partir da função de tinta).

**Limitações assumidas:**
- Não é igual ao Acrobat: transparências, modos de mistura e perfis ICC não se simulam. Opacidades
  originais (ca/CA) mantêm-se, mas grupos de transparência e máscaras suaves só valem o que o pdf.js
  faz com cinzentos.
- Um Form usado com overprint diferente em sítios diferentes só se simula pelo primeiro uso (avisa).
- Não separados: JPEG 2000, CCITT e JBIG2 a cores, Lab, imagens inline, malhas de degradé, funções
  de degradé por função, padrões de mosaico.
- Um objeto em overprint com tinta a 0% de uma spot deixa a placa em paz (assumido).
- O leitor de cor lê o objeto, não o resultado nas placas.

**Verificado em Chromium** com o cortante real (8 placas: arte K, PANTONE 2728 C com a arte
recortada, fluorescente, vincos e faca), o azeite, uma página do livro, e PDFs fabricados para
overprint, imagens CMYK/RGB em JPEG e degradés. Mutation testing nas partes puras.

## 20. Correções (Fase 4)

**Princípio:** nunca se toca no original. O worker guarda os bytes do ficheiro aberto e cada pedido
de correção carrega uma **cópia nova** com o pdf-lib, mexe nela e devolve bytes novos
(`nome_corrigido.pdf`). A cópia é analisada num segundo worker, para mostrar os alertas depois.

**Motor** (`src/correcoes/aplicar.ts`). Reutiliza o observador do interpretador (§19), que dá a
posição de cada operador no content stream e, com o gancho `evento`, a que evento da IR corresponde.
Assim o que o alerta aponta (`acharOverprint`, extraído de `alertasOverprint`) é exatamente o que se
corrige, e há uma só definição de "mal".
- **Overprint:** antes do objeto (no início do caminho, não entre a construção e a pintura) põe-se
  um `gs` com o estado novo (`OP`, `op`, `OPM`) e **depois** um `gs` que repõe o que lá estava. Os
  estados têm nomes deterministas (`ArtOv<OP><op><OPM>`) e juntam-se ao `/ExtGState` de cada fluxo
  mexido. Brancos: desliga o overprint só na parte (preenchimento ou traço) afetada. Pretos e spots:
  liga-o e põe o modo 1.
- **Spots:** `renomearSpots` percorre todos os objetos do ficheiro e muda o nome em arrays
  `Separation`, listas de `DeviceN` e chaves de `/Colorants`. Dois nomes iguais passam a uma chapa.
- **Cor de processo → spot:** troca-se o operador de cor (`k`, `K`, `sc`, `scn`...) por
  `/ArtSp<n> cs 1 scn` (ou `CS`/`SCN`), e acrescenta-se aos recursos o `Separation` com a cor
  alternativa escolhida. Compara com tolerância de 0,5%. A cor inicial de um espaço (`cs` sem `scn`)
  não se converte.
- Os Forms são reescritos no próprio Form; páginas e Forms sem `/Resources` próprios recebem os
  recursos novos nos da página, que é de onde os herdam. Layers desligadas por omissão não se mexem.
  Aplicar duas vezes não faz nada.

**Inventário** (`inventario.ts`): spots usadas (com sugestão de junção), cores de processo em
traços (candidatas a faca) e contagens de overprint por tipo. Alimenta o painel.

**Comparação** (`interface/comparar.ts`): desenha o original e a cópia e junta-os pixel a pixel. O
mapa de diferenças pinta a magenta onde a soma das diferenças de R, G e B passa de 40 (para ignorar
anti-aliasing) e mostra o resto esbatido. **No modo normal quase nunca há diferenças, porque o pdf.js
ignora o overprint**: é com as separações ligadas que se vê o efeito (a cópia monta-se no worker
da cópia).

**Limitações:**
- Um Form usado em vários sítios com estados diferentes é corrigido no Form: vale para todos os usos.
- A conversão de cor só trata CMYK; RGB e cinzento não entram.
- Não há correção para: RGB → CMYK, resolução. A sangria (§23) e o texto em curvas (§21) têm a sua.
- Não valida o PDF corrigido noutros leitores; verificado com o pdf.js e com a nossa análise.

## 21. Texto em curvas (Fase 5)

**O problema:** trocar `Tj`/`TJ` por contornos exige duas coisas: onde fica cada glifo e que desenho
tem. A primeira já existia (o interpretador simula o estado do texto); a segunda é ler o programa da fonte.

**Posições.** O interpretador passou a dar ao observador, por cada operador de texto, a lista de
códigos com o deslocamento de cada glifo (já com Tc, Tw, Th e os ajustes do TJ), mais tamanho,
elevação, modo e a matriz do texto. Cada glifo vira `[corpo×Th 0 0 corpo x rise] × Tm`, aplicado aos
pontos do contorno (normalizado a 1 em). As coordenadas ficam no mesmo espaço do operador que se
substitui, por isso `cm` à volta não interfere. `'` e `"` mantêm os seus efeitos (`T*`, `Tw`, `Tc`).

**Fontes** (`src/texto/`):
- `programa.ts`: opentype.js (MIT) para TrueType e OpenType. O CFF "nu" do PDF (FontFile3 Type1C e
  CIDFontType0C) é embrulhado num OpenType mínimo (CFF, head, hhea, hmtx, maxp, name, cmap), com o
  nº de glifos e a FontMatrix lidos do Top DICT. As subtabelas `cmap` (formatos 0, 4, 6 e 12) lêem-se
  à mão, porque o opentype.js só expõe uma. Curvas quadráticas passam a cúbicas.
- `fonte-pdf.ts`: código → glifo. Simples: codificação base + /Differences → nome → Unicode (lista AGL,
  `uniXXXX`) → cmap (3,1); depois (1,0) com MacRoman, nome no `post`; fontes simbólicas pela (3,0) com
  F000/F100/F200. CFF: pelo nome do glifo ou pela codificação própria. Compostas: Identity-H com
  CIDToGIDMap (Identity ou stream) em TrueType, e CID → glifo pelo charset em CFF com CIDs.
- `tabelas.ts`: codificações e AGL, **geradas** a partir do pdf.js (Apache-2.0) por script.

**Regras do motor** (`converter.ts`):
- Só se converte um **bloco BT…ET inteiro**: as curvas não avançam a matriz do texto, por isso misturar
  desalinharia o que vem a seguir. Um bloco com uma fonte que não se converte fica todo como estava.
- Um código sem glifo trava o bloco (nunca se perde uma letra). O espaço conta como glifo vazio.
- Texto invisível (Tr 3) desaparece ao converter; modos 4–7 (recorte) não se convertem.
- Com todas as layers visíveis, para converter também o que está escondido e saber que fontes
  continuam em uso. As que já ninguém usa saem dos recursos, com os `Tf` que as escolhiam.
- Forms partilhados convertem-se uma só vez. O conteúdo antigo das páginas **apaga-se** (o pdf-lib
  grava tudo o que está no documento): `substituirConteudo`, que só apaga streams que mais nenhuma
  página usa. Isto também se aplica às outras correções.

**Custo:** o ficheiro cresce (400 bytes por glifo, comprimido). Um livro de 40 páginas de texto denso
(79 mil glifos) demorou 34 s e passou de 11 MB para 43 MB; um cartaz com 99 textos, 0,8 s.

**Limitações:**
- Não há fontes Type 1 (FontFile): precisavam de um descodificador de charstrings Type 1.
- CMaps que não sejam Identity-H/V, e escrita vertical, ficam como estão.
- **CFF com CIDs não foi testado com um ficheiro real** (só por nome, com CID = índice do glifo): a
  leitura do charset vem do opentype.js. Falta um PDF com CIDFontType0C a sério.
- Sem hinting nem Type 3 (que já é vetorial). Texto convertido deixa de ser pesquisável.
- O mapa de diferenças marca as arestas dos glifos (anti-aliasing diferente): serve para ver se algo
  se deslocou, não para exigir píxeis iguais.


## 22. Mais alertas e relatório para o cliente

**Alertas** (todos funções puras `(analise, cfg) => Alerta[]`, registados em `alertas/registo.ts`):
- `tinta-total`: soma C+M+Y+K de cada objeto vetorial acima do limite (300% por omissão). Spots não contam.
- `tinta-total-imagens`: mede-se nas imagens CMYK (e Indexed/DeviceN que acabem em CMYK) por amostragem
  dos pixéis (`tinta-imagens.ts`). Corre depois do primeiro `publicar` do worker, que volta a publicar
  quando acaba: a lista de alertas aparece logo e este junta-se. Imagens com mais de 16 MP são
  decimadas. `InfoImagem.id` (a etiqueta do XObject) liga a medida à imagem.
- `cadernos-multiplo`: nº de páginas que não é múltiplo de N (4 por omissão; 0 desliga; só avisa com mais de N páginas).
- `faca-em-processo`: traços CMYK finos, de cor pura, em torno do corte e sem spot a acompanhar: a faca
  feita em magenta ou ciano. Sugere o painel Correções → "Cor de processo → spot".
- Marcas de corte: opção `registo` (offset) ou `preto` (digital, só K 100%).

**Relatório** (`relatorio/relatorio.ts`): `gerarRelatorio(dados): string` devolve um HTML completo
(sem dependências, `lang="pt-PT"`, tudo escapado, CSS de impressão). O App cria um Blob e abre-o numa
janela nova; imprime-se ou guarda-se em PDF a partir daí. O veredito vem da gravidade mais alta.
Se houve correções, entram no relatório com as contagens. Não substitui a revisão visual da prova: diz-se no fim.

**Decisão:** não há alerta de "grandes preenchimentos K 100% sem overprint". Depende do trabalho
(às vezes o knockout é o pretendido) e daria falsos alarmes; o alerta de preto já cobre fundos.

## 23. Sangria automática

`correcoes/sangria.ts`, chamada por último em `aplicarCorrecoes` (depois disto o conteúdo é só um Form).
1. Páginas: as que o alerta de sangria aponta (`paginasSemSangria` corre `alertasSangria` sobre a cópia).
2. A página antiga passa a **Form XObject** `ArtSangria` (BBox = CropBox, recursos da página,
   conteúdos concatenados). A página nova só tem esse Form nos recursos.
3. Conteúdo novo: oito recortes à volta do corte (quatro lados e quatro cantos), cada um
   `q <retângulo> re W n <espelho> cm /ArtSangria Do Q`, e por cima o Form sem recorte. O espelho do lado
   esquerdo é `[-1 0 0 1 2·x0 0]`, o do canto superior direito `[-1 0 0 -1 2·x1 2·y1]`.
4. Caixas: MediaBox e CropBox crescem até ao corte + sangria (nunca encolhem: marcas de corte ficam),
   TrimBox fixa-se onde estava, BleedBox = corte + sangria. `UserUnit` conta.
5. **O alerta de sangria sabe disto**: cada objeto mede-se por si e o original toca no corte, por
   isso o alerta diria "sem sangria" para sempre. `temSangriaGerada` (o Form `ArtSangria` existe nos
   recursos) faz com que `alertasSangria` salte essas páginas. Corrigir outra vez não faz nada.

**Limites:** espelhar serve para fundos, cores lisas e fotografias que acabam no corte. Texto ou
elementos junto ao corte aparecem espelhados na sangria (cortam-se fora, mas confirma). Páginas com
transparência em grupo na própria página ficam como estavam (o Form não herda o `/Group`).

## 24. Sugestões de spots (bibliotecas de cor)

`src/cores/`: `cie.ts` (sRGB↔Lab D50, **ΔE 2000** verificado com os pares de Sharma, Wu e Dalal 2005),
`bibliotecas.ts` (leitores e pesquisa). O utilizador carrega os seus `.acb` e `.ase` nas Definições;
guardam-se em `localStorage` (Lab compacto), só neste computador. A app **não traz dados de cor de
nenhuma marca** e não usa nomes de marcas na interface.

- **.acb** (Adobe Color Book): `8BCB`, versão u16, id u16; título, prefixo, sufixo e descrição como
  u32 (nº de caracteres) + UTF-16BE; nº de cores u16, tamanho de página u16, seletor u16, espaço de cor
  u16 (0 RGB, 2 CMYK, 7 Lab); depois, por cor: nome (u32 + UTF-16BE), código de 6 bytes ASCII e 3 ou 4
  bytes. CMYK vem invertido (255 − v). Lab: L = b0·100/255, a = b1 − 128, b = b2 − 128. Nomes
  `$$$/Chave=Nome` ficam só com o nome.
- **.ase** (Swatch Exchange): `ASEF`, versão, nº de blocos u32; blocos u16 tipo + u32 tamanho. `0xC001`
  grupo (nome), `0x0001` cor: nome (u16 + UTF-16BE com terminador), modelo de 4 letras (`CMYK`, `RGB `,
  `LAB `, `Gray`), floats big-endian, tipo u16.
- Cores CMYK convertem-se **sem perfil ICC** (ingénuo), por isso é "parecida", nunca "igual". O painel
  diz isto e rotula o ΔE (menos de 2 quase igual, 2–5 muito parecida, 5–10 parecida, acima diferente).
- Integração: Correções → "Cor de processo → spot": ao escolher a cor mostram-se as 5 mais próximas;
  clicar põe o nome no campo da spot.

**Aviso:** os leitores foram escritos a partir da descrição do formato e testados com ficheiros
construídos nos testes; **não foram testados com bibliotecas reais da Adobe**.

## 25. Revisão de texto (PT-PT)

`src/revisao/`. `extrair.ts` lê o texto com o pdf.js (`getTextContent`: posição, largura, fim de
linha) na página principal, em segundo plano e depois da análise. `revisar.ts` é puro: junta os itens
de cada página (espaço só se a distância o justifica), corre regras e devolve `Alerta[]` com locais
(o primeiro item de cada ocorrência), agrupados por palavra e com as páginas.

Regras: vocabulário do Brasil (lista curta, sem palavras que também existem em Portugal), «estar +
gerúndio» com lista de exceções (lindo, findo…), moeda e documentos do Brasil (R$, CEP, CPF, CNPJ,
telefones), expressões feitas (afim de, a nível de, haja visto, houveram, a cerca de), palavra
repetida, espaço antes de pontuação, falta de espaço depois de vírgula, três pontos em vez de «…» e
**duas grafias** no mesmo ficheiro (pares com e sem AO1990: ação/acção…). A mistura só avisa quando as
duas formas aparecem; não opina sobre qual usar.

**O que não é:** não tem dicionário, não encontra gralhas dentro das palavras («voce» sem acento não
aparece) nem percebe frases. Por isso as notas usam «confirma». Desliga-se nas Definições.

## 26. Casca desktop (Electron)

Casca fina, sem lógica de negócio: `electron/main.mjs` (processo principal), `electron/preload.cjs`
(ponte), `electron/caminhos.mjs` (funções puras, testadas). A análise, as correções e o relatório são
o mesmo código da versão web.
- A página serve-se por um protocolo `arte://app/…` que lê a pasta `dist` (com proteção contra `../`,
  barras invertidas e `%2e%2e`), com o tipo correto para `.wasm` e uma CSP sem rede. Assim o `base` do
  Vite não muda e os workers e o pdf.js funcionam como no browser.
- `contextIsolation`, `sandbox` e sem `nodeIntegration`. A ponte (`window.arteFinal`) só tem: abrir
  (diálogo nativo), guardar (diálogo nativo), PDF inicial e evento de ficheiro aberto. A página nunca
  escolhe um caminho para escrever: quem escolhe é o utilizador, no diálogo. O processo principal
  recusa gravar sobre o original (volta a perguntar) e só grava bytes que começam por `%PDF-`.
- Abrir pelo explorador: argumentos da linha de comandos, `second-instance` (uma só janela) e
  `open-file` no macOS. Associação a `.pdf` em `electron-builder.yml`.
- Janelas novas: só `blob:` (o relatório). Ligações http(s) abrem no browser do sistema.
- `npm run empacotar` (electron-builder: NSIS, dmg, AppImage). O instalador leva só `dist/`, `electron/`
  e `package.json`: o Vite já juntou as bibliotecas.

**Verificado** com o Playwright em modo Electron sob Xvfb, em modo de desenvolvimento e na versão
empacotada em Linux (`--dir`): carrega por `arte://`, abre o PDF dado na linha de comandos, aplica as
correções, grava pela ponte, recusa o original, abre o relatório e recusa caminhos fora do `dist`.
**Não testado:** Windows e macOS, os instaladores (só o Linux em pasta), assinatura de código e
atualizações automáticas.

## 27. Interface por camadas (redesenho)

**Alertas → ação.** `alertas/correcao-sugerida.ts` liga o id de cada alerta a uma correção
(`sangria`, `overprint-*`, `juntar-spots`, `faca-em-spot`, `curvas`). O botão "Corrigir" chama
`pedirCorrecao(tipo)` no App: abre a secção Correções do painel lateral (ver §34: `irParaSeccao('correcoes')`) e passa `{tipo, n}` ao `PainelCorrecoes`, que marca a opção, destaca a
secção e faz scroll (`n` muda a cada pedido, para repetir o mesmo pedido funcionar). O botão só aparece
se o ficheiro tem algo para corrigir (`podeCorrigir` lê o inventário). O botão Aplicar é `sticky`.
Um filtro sem resultados (ex.: "Avisos" noutro ficheiro) cai em "Todos" em vez de esconder tudo.

**Marcadores.** O App junta os locais de **todos** os alertas da página (limite de 150, os maiores
primeiro para os pequenos ficarem por cima). Notas (`info`) só se mostram ao passar o rato ou ao
selecionar. O Visualizador desenha-os em SVG (cor pela gravidade, selo com o número do alerta). Clicar
seleciona o alerta **sem** zoom: o foco (zoom) só existe depois de um pedido na lista (`versaoFoco > 0`).
Passar o rato na lista (`alertaHover`) realça os locais. O cartão selecionado faz scroll na lista.

**Tira de páginas** (`TiraPaginas.svelte`): miniaturas desenhadas com o pdf.js, em fila e só quando
entram no ecrã (IntersectionObserver), com a altura certa desde o início. Emblema por página com o
alerta mais grave (`alertasPorPagina`, contado uma vez por alerta). Só aparece com mais de uma página.

**Ferramentas** (Visualizador): `cor` (leitor, por omissão), `mao` (arrastar; espaço segurado é uma mão
temporária) e `regua`. As medidas fazem-se em px do ecrã e convertem-se com a escala: `mm = px / escala × 25,4/72`.
As coordenadas têm origem no canto superior esquerdo do corte, como se vê no ecrã (já com rotação). A régua
ignora `/UserUnit`. `definicoes.mostrarLeitor` acompanha a ferramenta, por isso o que o utilizador escolhe fica guardado.

**Painéis** com largura em `definicoes` (220 a 560 px), arrastáveis por divisores com `role="separator"`,
setas do teclado e duplo clique para repor. **Atalhos:** V, H, M, espaço, Esc, ← →, Ctrl +/−/0 (visualizador);
N, P, Ctrl O, ? (App). A ajuda (`AjudaAtalhos.svelte`) lista-os.

**Não feito:** painéis recolhíveis com um clique, várias medidas ao mesmo tempo, guias arrastadas das réguas.

## 28. RGB → CMYK

**Conversão** (`cores/conversao.ts`): sem perfis ICC (não há dados de perfis no projeto). Com C′ = 1−R, M′ = 1−G,
Y′ = 1−B: `K = min(C′,M′,Y′) × (1 − croma)`, croma = max − min. O eixo neutro (croma 0) fica só em K, o que
dá K 100% ao preto RGB e cinzentos sem CMY; as cores saturadas quase não levam K. C, M e Y saem de
`(X′ − K) / (1 − K)`. A soma das tintas é limitada (por omissão 300%, das Definições): acima disso reduzem-se
C, M e Y na mesma proporção, sem mexer no K. `rgbParaCmykBytes` garante o limite **depois de arredondar** a
bytes (sem isso, 300,4% e o alerta de tinta total disparava); nos vetores, que levam 3 casas decimais, a conta
usa 0,003 de folga.

**Vetores e texto** (`aplicar.ts`, no mesmo percurso que o overprint): cada operador de cor observado
(`rg`, `RG`, `sc`, `scn`, `SC`, `SCN`) cuja cor é RGB (DeviceRGB, CalRGB ou ICC de 3 canais) passa a
`c m y k k` (preenchimento) ou `K` (traço). Como `k` define o espaço, o `cs` anterior fica inofensivo.
Corre em páginas e Forms, com as mesmas regras de partilha das outras correções. Corre antes do texto em curvas e da sangria.

**Imagens** (`correcoes/rgb-cmyk.ts`): percorre todos os objetos do ficheiro. DeviceRGB/CalRGB/ICC de 3
canais com 8 bits passam a DeviceCMYK em Flate (`ctx.assign` sobre a mesma referência, o resto do dicionário
mantém-se: SMask, Interpolate…); o `/Decode`, se não for o normal, aplica-se antes. **Indexed sobre RGB**: só
se converte a paleta (4 bytes por entrada) e os índices não mudam. Reusa os descodificadores das separações
(`amostrasBrutas`, `desempacotar`; JPEG com o descodificador do projeto).

**Não converte** (fica como estava e o painel diz porquê): máscara por cor (`/Mask` em array), 16 bits e
outros, JPEG 2000, CCITT/JBIG2, imagens enormes, paleta ilegível. Também **não** converte: degradés
(Shading) e padrões em RGB, imagens inline, e a cor inicial de um espaço RGB antes de qualquer `sc`.

**Custos e avisos:** uma JPEG RGB passa a CMYK Flate sem perdas e o ficheiro cresce (a de teste, 20 kB → 370 kB;
não há codificador JPEG CMYK). O resultado não é o de um perfil de impressão (as cores vivas mudam um pouco); o
painel recomenda converter no Illustrator ou no Photoshop, com o perfil da gráfica, em trabalho crítico.
Possível melhoria: ler um perfil ICC CMYK do utilizador (tabelas B2A) e converter com ele.

## 29. Visual futurista

**Princípios:** um só objeto de cada vez a pedir atenção, uma cor de destaque em gradiente, movimento lento,
e o produto a mostrar-se a funcionar em vez de ser explicado.

- **Tokens** (`estilos.css`): escuro por omissão (`definicoes.tema = 'escuro'`; quem já tinha `auto` ou `claro`
  guardado mantém a escolha). Fundo quase preto, painéis `#0f1117`, bordas a 9% de branco, e a zona à volta da
  página em cinzento **neutro** (`--area-visualizador`) para não enviesar a perceção de cor. Destaque
  `--brilho` (ciano → violeta) e `--brilho-sombra` (brilho no hover). O tema claro mantém-se, com o mesmo
  gradiente em azul/violeta. `prefers-reduced-motion` desliga todas as animações.
- **Ecrã de entrada** (`Inicio.svelte`): ilustração própria em SVG (uma página com corte e sangria a
  desenharem-se, um feixe que desce e marcadores que aparecem quando o feixe lá chega, só com animações CSS, sem
  bibliotecas), título em gradiente, "Abrir PDF" e "Experimentar com um exemplo".
- **Pílula de estado** (`PilulaEstado.svelte`) no cabeçalho: Pronto, A analisar (anel de progresso, ou a rodar se
  ainda não há total), N erros · N avisos (vermelho/âmbar, com brilho) ou Tudo em ordem (verde). Clicar leva ao
  primeiro alerta.
- **Exemplo** (`demo/exemplo.ts`): um cartaz de 100 × 150 mm gerado com o pdf-lib no momento (nada para
  descarregar), com sete problemas postos de propósito (sangria, RGB, imagem de baixa resolução, fonte não
  incorporada, preto de quatro cores em texto pequeno, linha fina, branco em overprint). O teste garante que
  cada um é apanhado. Serve para experimentar os botões Corrigir sem ter um ficheiro à mão.
- **Logótipo:** marcas de corte num quadrado em gradiente, também no favicon.

**Voltar atrás:** o ramo `base-estavel` guarda a versão anterior ao redesenho (`010fd1e`).

## 30. Modo notch (desktop)

**A ideia:** a app não se vê. Aproximas um PDF que estás a arrastar do topo do ecrã e sai ao teu encontro uma
janelinha escura ("Coloca aqui o PDF", na notch dos Macs que a têm ou como pílula solta nos outros); ao largar, a
janela principal nasce dali e a janelinha desaparece. Fora dos arrastos não há **nenhuma janela à vista nem à
escuta**.

**Porque é que não é uma janela invisível à espera** (a primeira versão, que se abandonou): uma faixa no topo
obriga a acertar ao milímetro, rouba os cliques desses píxeis e choca com os gestos do sistema (arrastar algo
para o topo do ecrã no macOS abre o seletor de janelas). O Electron também não sabe de arrastos vindos de outras
aplicações, e uma janela com `setIgnoreMouseEvents` não os recebe.

**Como se deteta o gesto:**
- Um temporizador de 50 ms lê a posição do cursor (`screen.getCursorScreenPoint`, barato) e o estado do botão
  esquerdo, que o Electron não dá. `rato.mjs` arranca um programa do próprio sistema que fica a correr e escreve
  `B1` ou `B0` quando o botão muda: macOS, JavaScript para Automação (`osascript`), com **duas variantes** que se
  tentam por ordem (`NSEvent.pressedMouseButtons` e, se falhar, `CGEventSourceButtonState`); Windows, PowerShell
  (`GetAsyncKeyState`). A primeira versão do macOS morreu ao arrancar num Mac real (código 1) sem dizer porquê: por
  isso as variantes escrevem os erros (`ERRO …`), dormem com o `NSThread` (sem depender do StandardAdditions) e o aviso
  inclui o que o sistema disse e o que se tentou. Não instala nada nem pede permissões (é o estado do botão, não as
  teclas). Noutros sistemas não há programa e o modo notch fica indisponível.
- `aproximacao.mjs` (puro, com testes) decide: mostra-se a janelinha quando o botão está carregado, o cursor está na
  zona de aproximação (340 × 96 px centrada no topo) há 110 ms, e houve **arrasto**: o botão foi carregado fora da zona
  e o cursor entrou nela, ou foi carregado dentro dela (um ficheiro que já estava lá em cima, no ambiente de trabalho) e
  o cursor se afastou 40 px ou mais do ponto onde se carregou. Um clique sem arrasto não conta. (A primeira regra
  exigia carregar fora da zona e falhava para um ficheiro pousado junto à notch. O custo da regra atual: arrastar uma
  janela pela barra de título, ali em cima, também abre a janelinha.) Esconde-se 700 ms depois de se
  largar o botão sem ficheiro, ou se o cursor sai da zona alargada em 90 px durante 350 ms. Depois de esconder há
  uma pausa de 900 ms, e depois de um ficheiro ser tratado só volta a abrir depois de o botão ser solto.
- **Ver → Diagnóstico do modo notch…**: observa 10 s enquanto o utilizador arrasta um ficheiro e diz o que viu (se o
  programa do sistema está a postos e que linhas escreveu, em quantas amostras o botão estava carregado, em quantas o
  cursor estava na zona, em quantas as duas coisas, quantas vezes a janelinha foi pedida), com uma conclusão (o botão
  nunca é visto, o cursor nunca chega à zona, coincidem mas não abre, ou funcionou). Copia o relatório para a área de
  transferência. Testado com os três casos de falha.
- Se o programa do sistema falha, não responde em 4 s ou o sistema não é suportado, o modo notch desliga-se
  **sem gravar a escolha** e avisa uma vez (a app continua como janela normal). Com `ARTE_FINAL_DIAGNOSTICO=1`
  escreve no terminal o que o programa e o detetor vêem (posição, botão, estado), para depurar num Mac real.

**Janelas:** a janelinha (`?notch=1`, frameless, `enableLargerThanScreen` (senão o macOS empurra-a para baixo da barra de menus), transparente, sempre por cima, nível 27 (`status` + 2: acima da barra de menus, **abaixo da imagem do ficheiro arrastado**, que está no nível 500; em `screen-saver` o ficheiro passava por baixo da janelinha e a largada não lhe chegava), em todos os
espaços e em ecrã inteiro; `type: 'panel'` no macOS) existe criada mas **escondida**; o processo principal mostra-a
com `showInactive()` (não rouba o foco a meio do arrasto) e a página anima a entrada (`notch:mostrar`); para a
esconder envia `notch:esconder`, espera 200 ms pela animação de saída e faz `hide()`. A janela principal é criada
escondida com a app já a carregar. `main.ts` escolhe o componente (`Notch.svelte` ou `App.svelte`) pela query.
Preferências em `userData/preferencias.json` (`modoNotch`, `dicasVistas`). `ARTE_FINAL_NOTCH=0|1` manda sobre elas;
`ARTE_FINAL_SIMULAR_NOTCH=1` desenha a janelinha como se houvesse notch física; `ARTE_FINAL_TESTE=1` deixa o
teste mandar no cursor e no botão (`globalThis.__arteRato`).

**Dica de arranque:** nos 3 primeiros arranques (e só se a app não abriu já com um ficheiro) a janelinha mostra-se
4,8 s com "Arrasta um PDF para o topo do ecrã e ele abre aqui", para se saber que o modo existe.

**Geometria** (`electron/notch.mjs`, funções puras com testes): há notch num Mac se a barra de menus é mais alta que
32 pt (37 contra 24; a API não o diz). A janelinha fica centrada no topo do ecrã principal: encostada a y = 0 na notch,
a 8 px quando flutua. Na notch física os primeiros ≈38 pt são ecrã inexistente: o conteúdo começa por baixo.

**A janelinha cobre a zona de aproximação toda** (360 × 100 px, sempre encostada ao topo; minimalista: o ícone e uma linha, "Coloca aqui o PDF" / "Larga para abrir". Era 540 × 178 com uma segunda linha, que o utilizador achou demasiado grande para a informação): onde quer que o cursor
esteja quando ela abre, está por cima dela. Quando era mais baixa que a zona, o ficheiro era largado por baixo do
bordo e a largada perdia-se (apanhado num print de um Mac real). Se abrir o ficheiro falha, a janelinha **fica à vista
3,5 s a mostrar o motivo** (`notch:segurar` adia o esconder; sem isto desaparecia 700 ms depois de se largar o rato e
o erro não se via): sem permissão de leitura (Privacidade do macOS), "Isto não parece um PDF", etc. O diagnóstico
conta também os eventos de arrasto que a janelinha recebe (`dragenter`, `drop`) e as largadas abertas ou falhadas, e
conclui se o macOS lhe entregou o arrasto ou não.

**Saída suave:** a janelinha não desaparece de repente. Ao esconder-se, o texto esvai-se primeiro (140 ms) e ela
recolhe para o topo (escala 0,78 × 0,22 com a opacidade a 0, 300 ms, `cubic-bezier(.4,0,.2,1)`), como se voltasse para
dentro da notch; o processo principal só a esconde a sério 340 ms depois. Ao largar um PDF, a janela principal
**nasce exatamente do retângulo da janelinha** (mesmo tamanho e posição, medido com `getBounds()`), em 380 ms, e as
duas fundem-se: a janelinha recolhe e esvai-se por cima enquanto a janela cresce e ganha opacidade por baixo (sem
salto de tamanho nem de sítio). Recolher a janela principal faz a viagem inversa, para o mesmo retângulo.

**Largar:** `notch:soltar` com o **caminho** (`webUtils.getPathForFile`; o processo principal lê o ficheiro e fica a
saber a pasta, para propor gravar a cópia ao lado) ou `notch:soltar-bytes` se vem sem caminho (ex.: arrastado de um
browser). O PDF vai para a janela principal, que **nasce do topo**: ~300 ms, `setBounds` interpolado com abrandamento
cúbico e opacidade só quando já tem tamanho para se ver. "Recolher" (⌃) ou fechar a janela fazem a viagem de volta e
escondem-na; clicar no ícone da app (Dock) traz-a de volta com o mesmo ficheiro.

**Segurança:** cada pedido da janelinha confirma quem o faz (`evento.sender` é a janelinha e o frame é da app); só
aceita caminhos `.pdf` e bytes que começam por `%PDF-`. Armadilha encontrada: o valor devolvido por uma função passada
pela ponte atravessa-a também; um objeto reativo do Svelte não se clona, por isso essas funções devolvem vazio.

**Verificado** com o Electron real sob Xvfb (`scripts/e2e-notch.mjs`, 25 verificações, com o cursor e o botão do
rato simulados): a dica só nos primeiros arranques e depois nada à vista, o cursor no topo sem arrastar não faz nada,
atravessar a zona depressa ou carregar dentro dela não abre, aproximar abre, "Larga para abrir" com o ficheiro por cima,
desistir e afastar escondem, largar abre a janela a crescer (≈700×380 → 1376×860 com a opacidade a subir) e a janelinha
desaparece, recolher, voltar pela Dock, ficheiro que não é PDF, e nenhum erro nas páginas. Os programas do sistema
têm testes só do texto que escrevem. **Não verificado** (precisa de um Mac e de um Windows): o programa do sistema
(`osascript` e PowerShell) a funcionar de facto, se o arrasto de um ficheiro vindo do Finder deixa a janelinha
receber o `drop` depois de aparecer por baixo do cursor, o alinhamento com a notch, o nível da janela sobre a barra de
menus, ecrã inteiro, vários espaços e vários monitores.

## 31. Texto em curvas com fontes não incorporadas (desktop)

**Problema.** Um PDF com Helvetica, Verdana ou Century Gothic sem fonte incorporada (faturas de programas de gestão,
por exemplo) não traz o desenho dos glifos: só o nome e as larguras. Não há contornos para converter, e o visualizador
de quem abre o ficheiro desenha com a fonte que tiver. A única saída é ir buscar o desenho a uma fonte instalada no
computador. Isto só pode fazer-se na app desktop (o browser não sabe o que está instalado).

**Como funciona.**
- `inventariarFontes` marca como `substituivel` as fontes simples (Type1/TrueType) sem programa, com `/Widths`, que
  não são de símbolos (Symbol, ZapfDingbats, Wingdings…). Leva `nomeBase` e as pistas do descritor (peso ≥ 600 ou
  ForceBold → negrito; Italic ou ItalicAngle ≠ 0 → itálico).
- O painel pede à casca `fontesDoSistema(pedidos)` (IPC `arte:fontes-sistema`). `electron/fontes-sistema.mjs` lê a
  tabela `name` de cada `.ttf/.otf/.ttc/.otc` nas pastas do sistema (macOS: `/System/Library/Fonts`, `…/Supplemental`,
  `/Library/Fonts`, `~/Library/Fonts`; Windows: `%WINDIR%\Fonts` e a pasta do utilizador; Linux: `/usr/share/fonts`…),
  uma vez por sessão, sem carregar os ficheiros inteiros.
- Escolha da face, por ordem: nome PostScript exato (`Helvetica-BoldOblique`), família + estilo (`Verdana,Bold`,
  `ArialMT`, `TimesNewRomanPS-BoldItalicMT`), nome completo, e só por fim um equivalente de métricas (Helvetica ↔ Arial
  ↔ Liberation Sans/Arimo, Times ↔ Times New Roman, Courier ↔ Courier New), sempre assinalado como "equivalente, não a
  original". O estilo tem de coincidir: sem Arial itálico não se usa o Arial normal. Uma face de uma coleção `.ttc` é
  extraída para um sfnt autónomo (`extrairFace`).
- A página manda `externas` (id da fonte → bytes) em `PedidoTexto`. `converterTexto` só recorre a elas quando o PDF não
  traz o desenho (o que está incorporado ganha sempre) e o resumo diz que fontes foram substituídas e por quê.
- Código → glifo: nome do glifo da codificação (`/Encoding`, `/Differences`; sem `/Encoding`, WinAnsi para TrueType e
  Standard para Type 1) → Unicode → `cmap` da fonte instalada. Sem adivinhar: um código cujo glifo não existe deixa o
  bloco como estava, com o motivo.
- **As posições são sempre as do PDF** (`/Widths`): cada glifo cai onde o original o poria; se a fonte instalada for
  uma versão diferente, as letras podem ser um pouco mais largas ou estreitas dentro do seu espaço. Sem `/Widths` não se
  substitui (as posições já teriam sido calculadas com larguras inventadas).

**Limites.** Só desktop. Só fontes que existam instaladas (Century Gothic costuma vir com o Office, não com o macOS).
Fontes compostas (Type0) não incorporadas e Type 1 incorporadas (`FontFile`) continuam por fazer. `.dfont` (formato
antigo do macOS) não é lido. O aspeto fica tão fiel quanto a fonte instalada for igual à original: por isso o painel
avisa e o **Comparar** mostra a diferença.

**Verificado.** Testes com TTC gerada por código (5 faces com tabelas partilhadas): leitura de nomes, extração,
escolha (PostScript, família+estilo, pistas, equivalentes, estilos que faltam), validação do que vem da página,
conversão com posições dadas pelo PDF, `/Differences`, TrueType sem `/Encoding`, glifo em falta, fonte ilegível,
prioridade da fonte incorporada. No Electron real (`scripts/e2e-fontes.mjs`, Linux sob Xvfb) com uma fatura de quatro
fontes não incorporadas: Helvetica e Helvetica-Bold encontradas (Liberation Sans, equivalente), Verdana e Century
Gothic assinaladas como não instaladas, conversão feita, resumo e Comparar corretos. **Não verificado** num Mac real:
a leitura das pastas do macOS e os `.ttc` da Apple (Helvetica.ttc).

## 32. Mascote

Corpo macio e rechonchudo (superelipse n = 2,55) com volume: gradiente radial de luz/base/sombra, brilho desfocado,
sombra no chão; quatro **bolas brilhantes nas tintas CMYK** (ciano e amarelo atrás do corpo, magenta e preto à frente).
`src/interface/Mascote.svelte`.

**21 expressões** (`src/mascote/expressoes.ts`, só dados: olhos, extras, movimento do
corpo, comportamento das bolas e um tom que lava o corpo): em repouso, a analisar (voa, bolas atrás), a pensar
(balão), a procurar (lupa), a trabalhar (anel, bolas a orbitar), a enviar (seta), dúvida, tudo em ordem, aviso, erro
(lágrimas, bolas no chão), a dormir (zzz, bolha), a bocejar, tonta (olhos em espiral, estrelas a orbitar), olá (a bola
ciano acena), adoro (olhos de coração), surpresa, orgulhosa, piscadela, irritada (vapor), a dançar (notas), contente.
O desenho de cada peça é SVG plano com gradientes; cada movimento é um conjunto de keyframes preso ao chão. Sem boca, sem sobrancelhas e sem bochechas (tiradas a pedido): minimalista, tudo se lê só pelos olhos (grandes, lisos e sem brilho, só uma mancha escura; `espremidos` para o
bocejo, `> <`); a cara está 8px mais abaixo para ficar mais fofa. Em repouso dá um saltinho de 7 em 7 s.

**Ordem das camadas:** cachecol (metade de trás) → bolas de trás (ciano e amarela) → corpo → cara → acessórios → bolas da frente (magenta e preta) → extras. As da frente ficam por cima dos acessórios; as de trás ficam atrás do corpo e do que ela veste (é o que dá profundidade), por isso em repouso estão no flanco do corpo, abaixo da aba dos chapéus, onde nenhum acessório lhes chega. (Tentei desenhá-las por cima dos acessórios com uma máscara do corpo: ficava a meio caminho, à frente do chapéu mas cortadas pelo corpo, e não parecia natural.)

**Acessórios assentes em anéis:** chapéus, coroa e cachecol assentam em elipses à volta da cabeça (`Anel`, em
`personalizacao.ts`): a frente passa por cima da cara curvada como um sorriso, o gorro e a boina cobrem o topo todo
(a cabeça já não aparece por dentro deles), e a coroa tem pontas de trás e da frente. Foi isto que os fez deixar de parecer
autocolantes na testa.

**Acessórios com volume e movimento próprio:** gradientes de luz e sombra, sombra projetada na cara, e cada um balança
um pouco atrasado em relação ao corpo (mais quando ela salta, voa, dança, está tonta ou dorme): pompons e fitas
abanam, o laço esvoaça, a ponta do chapéu de bruxa dá de si, um reflexo passa pela coroa e pelos óculos de sol. O
**cachecol dá a volta ao corpo**: a metade de trás fica atrás e só se vê nas pontas que saem do contorno, a da frente
passa por cima com listras ao longo da curva, e as pontas penduradas abanam.

**Onde se usa:** ecrã inicial (`humor.ts`: cumprimenta ao chegar, boceja ao fim de 45 s sem gestos, adormece, e um
gesto acorda-a e ela cumprimenta; testado com relógio falso), painel de alertas (analisa, procura QR codes, trabalha
ao aplicar correções, depois ok/aviso/erro), e clicar nela faz uma expressão alegre à sorte (nunca erro nem aviso).
Armadilha: `setTimeout` guardado num objeto e chamado como método dá "Illegal invocation" no browser.

**Nas Definições** a mascote voa (só durante o trajeto, com as bolas atrás e linhas de vento: prop `voando`) para um
canto, sem fundo, quando o palco sai do ecrã, e ao chegar fica normal; ao subir volta ao palco. O trajeto (`src/mascote/voo.ts`) é uma curva de Bézier
amostrada em ~60 keyframes: arranca devagar, acelera e abranda, inclina-se para onde vai (como uma ave a virar), estica
consoante a velocidade, balança no ar e aterra com uns saltinhos. O **sentido** manda: a ida é para a direita (bolas e
vento atrás, à esquerda); a volta é para a esquerda e tudo passa para o outro lado (prop `sentido`), com a inclinação,
os olhos e as pontas do cachecol a acompanhar.

**Personalizável** (Definições → separador **Mascote**; o diálogo tem separadores Verificações, Formatos e cores,
Relatório e Mascote; botão direito na mascote abre-o logo aí, via `navegacao.svelte.ts`): galeria com as 21
expressões (miniaturas já com a cor e o acessório escolhidos) e pré-visualização grande; mostrar/esconder; cor do corpo
(pérola, ciano, magenta, amarelo, grafite ou qualquer); com ou sem bolas; 17 acessórios numa galeria de miniaturas
(§42); onde aparece (inicial, alertas); animada ou quieta.
Os olhos mudam para claros se o corpo for escuro. Guardado em `definicoes.mascote`; `sanearPerfil` aproveita o que for
válido de um valor guardado estragado (inclusive de versões antigas) e recusa cores que não sejam `#rrggbb` (a cor
entra no SVG, por isso nada de texto livre). Com `prefers-reduced-motion` ou "quieta", só a pose. As contas de cor e
de forma (superelipse, espiral, estrela, tons) estão em `src/mascote/personalizacao.ts`, com testes.

## 33. A mascote como assistente (conversa) — RETIRADO

O chat com a mascote (um assistente local, de regras, em `src/assistente/`) foi **retirado**: repetia o que o
layout já faz sem perguntar, e a aparência de chatbot prometia mais do que as regras cumpriam (qualquer frase fora do
previsto dava "não percebi"). O que valia a pena, as **explicações dos termos**, passou para dentro do layout (§41); a
mascote ficou como identidade (expressões e balões, §38). Ficou do assistente: o glossário (`src/ajuda/conhecimento.ts`),
a formatação do texto (`formatar.ts`) e a normalização de texto (`texto.ts`, para a pesquisa). Apagaram-se o cérebro, a
conversa, a construção de pedidos, a mudança da mascote por palavras, o contexto, `Assistente.svelte` e Ctrl/Cmd+K.

## 34. Layout "estúdio" (barra · painel · palco)

O layout antigo tinha três colunas de texto ao mesmo tempo (alertas à esquerda, quatro separadores à direita,
barra cheia no topo). Agora há três cartões macios a flutuar sobre um fundo suave, e **só um painel de cada vez**:

- **Barra** (`Barra.svelte`, à esquerda): a marca, as secções (Rever: Alertas, Caixas, Layers, Separações;
  Corrigir: Correções), e em baixo Relatório, Definições, tema e atalhos. A secção ativa é uma pílula escura. Os
  Alertas mostram o número de erros. Clicar na secção ativa **esconde o painel** (o PDF ganha a largura toda).
  Abaixo de 1260 px a barra fica só com ícones. Sem ficheiro aberto só mostra Definições, tema e ajuda.
- **Painel** (`PainelLateral.svelte`): título, uma frase a dizer para que serve a secção e o conteúdo. A secção
  vive no App (`seccao`, `painelAberto`, `escolherSeccao`, `irParaSeccao`); `seccoes.ts` tem a lista. O que
  pede uma secção (corrigir a partir de um alerta, clicar numa marca na página, o assistente) usa `irParaSeccao`.
  A largura arrasta-se (um só divisor; `definicoes.larguraEsquerda`, 340 px por omissão; `larguraDireita` ficou
  nas definições só por compatibilidade).
- **Palco**: cabeçalho sem fundo (nome do ficheiro grande; medida e caixas em chips; estado e "Abrir PDF"), e o
  visualizador num cartão. Os controlos do visualizador flutuam em cima da página: ferramentas (canto superior
  esquerdo), o que mostrar (superior direito), **doca** em baixo ao centro (página, zoom, ajustes e, na
  comparação, Antes/Depois/Diferença) e as coordenadas por cima da doca. O ajuste "Página" desconta a doca
  (`MARGEM_V`).
- **Alertas mais calmos** (`PainelAlertas.svelte`): o cartão da mascote, três números grandes em pastel que são
  os filtros (Erros/Avisos/Notas, um clique filtra, outro tira o filtro) e cartões com o título, duas linhas de
  detalhe e o botão de corrigir. O texto todo só aparece no alerta escolhido; a nota "Sobre esta análise" ficou
  recolhida.
- **Tokens** (`estilos.css`): `--raio`, `--raio-2`, `--sombra-cartao`, `--fundo-brilho`, `--primario*` (tinta
  escura no claro, gradiente da marca no escuro) e os pastéis `--pastel-erro|aviso|info|ok` (+ `-t` para o texto).
  O tema claro passou a papel quente com acento índigo; o escuro mantém o gradiente ciano→violeta.

Para voltar ao layout antigo: `git revert` do commit "Layout estúdio" (a lógica não mudou, só a casca).
**Verificado** no Chromium (claro e escuro, 1440 e 1180 px, uma e várias páginas, painel escondido) e com o e2e do
notch no Electron real (25 verificações). Não verificado no Mac.


## 35. Criar marcas de corte (Correções)

`src/correcoes/marcas.ts`. Um ficheiro sem marcas passa a tê-las numa cópia (o original nunca se toca).

- **Que páginas:** as que o próprio detetor (§16) marca como "sem marcas" ou "sem espaço para marcas". Páginas com
  marcas incompletas ou mal colocadas **não** se mexem (não se sabe qual é a boa, e duplicar seria pior).
- **O desenho:** oito traços retos de 0,25 pt (`m l S`), dois por canto, alinhados com a TrimBox, do lado de fora,
  à distância pedida. Cor: `Separation /All` com tinta 1 (registo, sai em todas as chapas) ou `0 0 0 1 K` (digital),
  conforme `marcasCorteCor`. Como são traços retos, o detetor reconhece-os: depois de criar, os alertas de marcas
  desaparecem (testado).
- **Medidas:** comprimento (9,5 mm) e distância ao corte (5 mm) por omissão, nas Definições (as do cortante da M2 que
  serviu de referência no §16). A distância nunca fica abaixo da sangria (a da BleedBox, a de referência, ou a que se
  gera no mesmo pedido).
- **Sem margem:** com "aumentar a página" (por omissão), MediaBox e CropBox crescem o que for preciso e a **TrimBox
  fica fixada** no que era (sem TrimBox, o corte era a página toda: a medida final não pode mudar). Sem esta opção,
  encurtam-se as marcas até caberem (mínimo 3 mm); se nem assim, a página fica como está e o resumo diz quantas.
- **Como se acrescenta ao conteúdo:** a página antiga passa a um Form (`ArtPagina`, com BBox na CropBox) e a
  página desenha-o e as marcas por cima. Assim um conteúdo com a pilha gráfica em desordem não estraga as marcas.
  As páginas da sangria automática (que já são só um Form) recebem as marcas no fim do conteúdo, para continuarem
  a ser reconhecidas como tal.
- **Ordem:** corre depois da sangria no mesmo pedido, para as marcas ficarem fora dela.
- **Interface:** secção "Marcas de corte" no painel Correções e botão "Criar marcas de corte" nos alertas "Sem marcas"
  e "Sem espaço para marcas". No Comparar, quando a página muda de tamanho cada vista mostra a sua página
  (sem diferença nem marcações do original, que já não batem certo). O assistente abre o painel já preparado
  («cria as marcas de corte»); o «corrige tudo» não as cria, porque mudam o tamanho da página.
- **Preview:** botão "Ver preview" na secção Marcas de corte. Desenha as oito marcas (e, onde a página cresce, a folha
  maior a tracejado) por cima da página, sem alterar nada, e acompanha ao vivo o comprimento, a distância e a opção de
  aumentar a página. Usa `planearMarcas()`, a mesma função que a correção, por isso o preview e o resultado não podem
  divergir. O zoom "Página" ajusta-se à folha maior (`extensaoPt`) e uma nota em baixo diz o que se passa na página à
  vista ("a página cresce 15 mm de cada lado", "encurtadas para caberem", "sem espaço", "já tem marcas"). Desliga-se
  ao aplicar, ao sair do painel ou ao abrir outro ficheiro.
- **Não faz:** marcas de centro, alvos de registo, barras de cor, informação de página; marcas na diagonal.

**Verificado:** 21 testes novos (página com margem, sem margem, sem poder crescer, afastamento abaixo da sangria,
registo e preto, com sangria no mesmo pedido, rodada, MediaBox fora da origem, original intacto) e, no Chromium, o
fluxo completo na app com o PDF de exemplo (botão no alerta → painel → aplicar → comparar). Não verificado no Mac
nem com um cortante real da M2.


## 36. Separações ligadas por omissão

A página abre **por tintas**: `definicoes.verSeparacoes` (guardado) vale `true` por omissão, por isso as quatro
chapas (e as spots que houver) estão sempre listadas no painel Separações, sem ter de as ligar. A vista é a do
rasterizador de separações com o overprint simulado (§ das separações), por isso mostra o que a impressão vai dar,
por exemplo o branco em overprint a desaparecer, e **não** o que o ecrã (pdf.js) desenha.

Não há selo no visualizador (retirado a pedido): quem quer a vista normal desliga "Ver separações" no painel, que também
lista o que não entrou nas placas. O custo é separar cada página ao abri-la.


## 37. Ícone na barra de menus / área de notificação

Um ícone da mascote sempre à mão: clicar abre ou esconde a janela. Serve também onde não há notch (Macs sem ela,
Windows), por isso o modo notch passa a ser um extra.

- **Ícones** (`scripts/gerar-icones.mjs`, desenha o SVG da mascote com o Chromium e grava PNG com transparência; os PNG
  estão no repositório, só se volta a correr ao mudar o desenho):
  - macOS, `electron/icones/bandeja-Template.png` (+`@2x`): só preto e transparência. O sufixo `Template` e
    `setTemplateImage(true)` fazem o sistema pintá-lo de claro ou escuro conforme a barra. É a mascote simplificada:
    corpo cheio com os dois olhos recortados (as bolas CMYK, a 18 px, virariam uma mancha).
  - Windows e Linux, `bandeja-win.png` (+`@2x`): a cores (degradé da marca, olhos escuros e uma bola magenta).
  - `build/icon.png` (1024): o ícone da app, a cores, de onde o electron-builder faz o `.icns` e o `.ico`
    (`electron-builder.yml`). Em desenvolvimento põe-se no Dock (`app.dock.setIcon`) e na janela.
- **Comportamento** (`electron/main.mjs`, funções puras em `electron/bandeja.mjs`):
  - Clique: se a janela está à frente, esconde-a (com o modo notch, recolhe-a para lá); senão traz-a (no macOS passa à
    frente das outras apps, `app.focus({steal})`).
  - Botão direito: menu com Abrir/Esconder, Abrir PDF…, "Fechar a janela deixa a app na bandeja" (caixa de seleção) e
    Sair. Não se usa `setContextMenu` no macOS/Windows porque o macOS abriria o menu no clique normal; no Linux os
    ícones só têm menu e usa-se.
  - macOS: largar um PDF no ícone abre-o (`drop-files`); só se aceitam `.pdf`.
  - Fechar a janela só a esconde (a app continua a correr no ícone) enquanto a opção estiver ligada, que é por omissão
    e fica nas preferências (`manterNaBandeja`). Desligada, fechar fecha a app como antes. Sair, pelo menu do ícone ou
    por ⌘Q, sai mesmo (`before-quit`).
  - Se o ícone não carregar ou o sistema não tiver bandeja, a app corre como antes (sem ele).
- **Windows:** o sistema esconde por omissão os ícones novos atrás da seta "^" junto ao relógio; é o utilizador que o
  fixa na barra. No macOS aparece logo.
- **Verificado:** `scripts/e2e-bandeja.mjs` no Electron real (o ícone cria-se; o clique alterna; fechar a janela só a
  esconde; largar um PDF no ícone abre-o; 14 verificações) e o e2e do notch continua a passar (25). 8 testes unitários.
  **Não verificado no Mac nem no Windows**: o ecrã virtual não tem barra de menus nem relógio, por isso o aspeto do
  ícone (tamanho, nitidez, tema claro/escuro) está visto só em simulação.


## 38. Balões da mascote junto ao chat

Um balãozinho por cima do botão do chat, sem lhe perguntarem nada, **só quando há algo a dizer**
(`src/ajuda/baloes.ts`; o estado e o relógio em `estadoBaloes.svelte.ts`; os disparos no Documento):

- **"Olá!"** uma vez por sessão, quando o botão aparece (ao abrir o primeiro ficheiro). Fica ~4,5 s; clicar abre a Ajuda.
- **Depois da análise** (e dos QR codes): "Encontrei 4 erros e 4 avisos. Queres ver?"; clicar leva aos alertas. Sem erros
  nem avisos diz só o que há ("está tudo em ordem"). Uma vez por ficheiro.
- **Depois de uma correção:** "Pronto: 8 alertas passaram a 5." Só se melhorou, uma vez por cópia.

Regras para não cansar: um balão fica pelo menos 2,8 s antes de outro lhe tomar o
lugar (o resumo da análise espera pelo "Olá!"); desaparecem sozinhos (7 s) ou no ✕; abrir o chat fecha-o. Interruptor
nas Definições da mascote, "Balões junto ao chat" (`mascote.balao`, ligado por omissão), que também respeita a mascote
escondida. Verificado no Chromium com o PDF de exemplo (olá, resumo, clique → chat com a pergunta feita, correção).


## 39. Separadores (vários PDFs abertos)

Como no Acrobat: uma barra de separadores por cima, um por PDF, com o nome, um ponto de estado (a carregar, erros,
avisos, em ordem), ✕ para fechar e + para um novo. **Nota:** o que antes se chamava `App.svelte` (o estado e o ecrã de
um PDF: análise, painéis, correções, visualizador) é agora `Documento.svelte`; o novo `App.svelte` é só a casca dos
separadores. Onde este documento diz "o App" a falar de um PDF (ex.: `pedirCorrecao`, `irParaSeccao`), é o Documento.

- **Um Documento por separador, todos vivos.** Cada PDF tem o seu worker de análise, o seu preview, o seu zoom, a sua
  página, os alertas e a cópia corrigida. Os de trás ficam com `display: none` e **guardam tudo** (mudar de separador
  não perde nada nem volta a analisar). O custo é memória: há um limite de 12 (`MAX_SEPARADORES`).
- **Só o da frente ouve.** Cada Documento recebe `aFrente`; os atalhos de teclado (setas, N/P, ?, V/H/M, zoom), o
  assistente, o "Olá!" e os balões só valem para ele. Os escondidos não redesenham (a área tem tamanho 0).
- **Casca** (`App.svelte`, lógica pura em `separadores.ts`, com testes): abrir ficheiros (diálogo, largar na janela,
  duplo clique no sistema, ícone da bandeja), os atalhos dos separadores, o tema e guardar as definições (que antes
  se faziam por PDF).
  - **Onde abre um ficheiro:** no ecrã inicial vazio, se é onde estás; senão num separador novo. Se o mesmo ficheiro
    (mesmo caminho, só no desktop) já está aberto, passa-se para esse. Largar vários PDFs abre cada um no seu.
  - **A barra só aparece** quando há o que mostrar (com o ecrã inicial sozinho fica limpa).
  - **Fechar** passa ao da direita (ou ao da esquerda, se era o último). Fechar o último deixa o ecrã inicial; fechar o
    ecrã inicial sozinho fecha a janela (vai para a bandeja, se estiver ligada). A cópia corrigida que não
    descarregaste perde-se ao fechar (não há aviso).
  - **Atalhos:** Cmd/Ctrl+O abrir, T novo, W fechar (no desktop vem do menu "Fechar separador"; no browser é do browser),
    Ctrl+Tab / Ctrl+Shift+Tab e Ctrl+PageDown/Up para navegar, Cmd/Ctrl+1…8 para o n.º e 9 para o último. Clique do
    meio fecha.
- **Os balões e a Ajuda** são uns só para a janela: o "Olá!" é uma vez por sessão, não por separador.
- **Não faz:** arrastar para reordenar, separador "Início" fixo, restaurar os separadores ao reabrir a app, avisar ao
  fechar uma cópia corrigida por guardar.

**Verificado:** 14 testes da lógica; no Chromium (abrir dois PDFs, mudar, Ctrl+Tab, as setas só mexem no da frente,
o zoom e a página ficam guardados, Ctrl+T, fechar com ✕ e com o clique do meio, fechar o último) e no Electron real
(`scripts/e2e-separadores.mjs`, 13 verificações, incluindo o Cmd/Ctrl+W do menu; o e2e do notch e o da bandeja continuam
a passar). Não verificado no Mac.


## 40. Animação de entrada pela notch (uma barra com a mascote lá dentro)

Uma "mentira visual" com um fundo verdadeiro: ao largar um PDF na janelinha da notch, em vez de a janela principal
aparecer logo, aparece **uma barra fina que se enche devagar com a mascote lá dentro, na ponta do que já está cheio**, e
só então a janela principal nasce do palco escuro. A barra segue a **análise real** (a janela principal, escondida,
analisa o ficheiro a sério e diz à janelinha quanto já fez); só se acrescenta o que falta para a animação se ver
inteira (mínimo de 2,4 s, `MINIMO_ANIMACAO_MS`). Teto de 15 s: passado isso mostra-se a janela de qualquer maneira.
(Foi mudando: a primeira versão tinha a mascote "a pensar" e a rebentar em partículas; a segunda uma mascote grande a
comer o PDF e a empurrar uma barra de quatro tintas por cima; ficou esta, mais calma. Uma barra mostra trabalho
verdadeiro, o "pensar" era tempo inventado.)

- **Aspeto** (`Notch.svelte`): a janelinha cresce só um pouco, de 360 × 100 para 440 × 130 (`PALCO`, `boundsPalco`; não
  apanha cliques; **nada se vê fora dela**). Ao meio da área útil (por baixo dos 38 pt da notch física, se a há) uma barra de
  260 × 26 px: trilho discreto (branco a 7 %), cheio com um degradé suave ciano → magenta → amarelo **fixo à barra toda**
  (a cor revela-se à medida que enche, não se estica) e um brilho muito leve. A mascote (32 px de largura, sem acessórios
  nem bolas) vai dentro, na ponta do cheio, com a cara "a analisar" (`analisa`); o cheio nunca é mais estreito do que o
  corpo dela, por isso ao início ela já lá cabe. Quando acaba, a barra vai a 100 % e a mascote fica orgulhosa
  (`orgulhosa`, um pulinho) e 650 ms depois a janela principal cresce a partir da pílula (a animação de sempre).
  Sem partículas, sem PDF a voar, sem texto.
- **Sequência** (`electron/main.mjs`, `sequenciaDeEntrada`): fase `encher` → espera pela análise e pelo mínimo →
  fase `concluir` → 650 ms → janela principal.
- **A barra é honesta, mas não nervosa** (`interface/barra-notch.ts`, testado): segue o progresso real (páginas
  analisadas / total) com 92 % de teto até acabar; nunca chega ao teto em menos de 1,5 s (um ficheiro pequeno não salta de
  0 a 100 %); enquanto a análise ainda não deu números (a abrir o ficheiro) avança devagar, no máximo até 12 %; e **nunca
  recua**. O movimento é suavizado (aproximação exponencial por fotograma), por isso a mascote desliza.
- **O progresso real:** `Documento.svelte` já sabia quantas páginas analisou; passou a incluí-lo no estado que dá à casca
  (`progresso`). `App.svelte` junta o de todos os separadores num lote (`progressoDoLote`: média, o que acabou vale 1, ficheiros
  fechados saem da conta) e envia-o por IPC (`arte:progresso` → `notch:progresso`, só enquanto a sequência corre). Com
  vários PDFs largados juntos a barra conta o total.
- **`forma`:** `Mascote.svelte` ainda tem a propriedade `forma` (corpo mais largo e retangular, usada na versão com a
  mascote a "comer" o PDF); já ninguém a usa, mas fica, é pequena e testada visualmente.
- **Desligar:** menu Ver → "Animação ao largar na notch" (guardado nas preferências, `animacaoNotch`); sem ela a janela
  nasce logo, como antes. `ARTE_FINAL_ANIMACAO=0` força-o (testes).
- **Erros** (não é PDF, ficheiro ilegível) continuam a aparecer na janelinha como antes, sem animação.
- A janela principal tem `backgroundThrottling: false`, para analisar à mesma velocidade enquanto está escondida.

**Verificado** no Electron real (`scripts/e2e-notch.mjs`, com e sem animação): a janela principal fica escondida durante
a animação e aparece aos ~3 s (mais, com ficheiros pesados); a janelinha cresce só até 440 × 130; a barra da pílula enche
até 100 %, nunca recua e passa por valores a meio; a janela principal manda o progresso real (valores crescentes, o último
100 %). Fotogramas da sequência (com e sem notch física simulada) mostram a barra e a mascote sempre dentro da pílula.
**Não verificado:** a fluidez num Mac real (aqui o ecrã é virtual, sem GPU), nem o aspeto na notch física verdadeira.


## 41. Ajuda dentro do layout, e as Correções por categorias

Depois de tirar o chat (§33), o que ele sabia passou a estar onde é preciso, e as Correções ficaram arrumadas por
assunto.

- **"O que é isto?"** em cada alerta (só no escolhido): abre a explicação curta do termo (o glossário), com "Ver no
  glossário". `topicoDoAlerta` liga cada alerta ao seu tópico.
- **Ajuda** (`Ajuda.svelte`, botão "?" da barra, a mascote no canto e a tecla `?`): duas abas, **Glossário** com pesquisa
  (`procurarTopicos`: sem acentos, por início de palavra, o título pesa mais que o texto) e **Atalhos**. Os tópicos
  com correção têm "Ver nas Correções".
- **Corrigir tudo o que é seguro**: botão no painel de alertas (quando há 2 ou mais tipos de correção). Não aplica nada
  às escondidas: abre as Correções com cores, overprint, sangria e spots duplicadas já marcados, e só aplicas depois de
  veres. Ficam de fora as marcas de corte (mudam o tamanho da página), o texto em curvas e a faca (pedem uma escolha).
- **Correções por categorias** (`src/correcoes/categorias.ts`): por baixo de "Correções" na barra lateral aparecem
  **Tudo, Cor, Overprint, Página e Texto**, cada uma com o número de coisas por corrigir (os mesmos números do painel).
  Escolher uma mostra só as suas secções (Cor: RGB→CMYK, Spots, Cor de processo→spot; Overprint; Página: Sangria e
  Marcas de corte; Texto: curvas); "Tudo" é a lista inteira. A barra de aplicar diz sempre o que vai ser aplicado
  ("Vai aplicar: RGB → CMYK · Overprint · Sangria"), seja qual for a categoria à vista, porque as opções marcadas
  noutras categorias contam na mesma. O botão "Corrigir" de um alerta leva à categoria certa. Com a barra só com ícones
  (abaixo de 1260 px) as categorias vêm para o topo do painel, em pílulas.
- **A mascote** fica como identidade: o botão do canto abre a Ajuda; o balão leva aos alertas (ou à Ajuda, o "Olá!").

**Verificado** no Chromium com o PDF de exemplo: o chat já não existe (nem Ctrl+K), "O que é isto?" → "Ver no glossário"
abre a Ajuda no tópico, a pesquisa filtra, "Corrigir tudo" abre as Correções com o resumo, cada categoria mostra só as
suas secções, e "Corrigir overprint" de um alerta leva à categoria Overprint.

## 42. Mais acessórios

De 9 passou-se a 17 (`ACESSORIOS` em `personalizacao.ts`; a galeria das Definições mostra cada um numa miniatura, sem bolas,
para se ver bem). Os novos: **auscultadores** (fita por cima da cabeça e dois copos laranja nos flancos), **boné** (cúpula
com gomos que nascem do botão, pala, e um logótipo de quatro pontos CMYK), **capacete de obra** (amarelo, nervura ao
meio, aba), **chapéu de cozinheiro** (cilindro pregueado com bolhas fundidas por cima), **cartola** (copa azul-escura com
fita magenta), **auréola** (dois arcos, o de trás mais fino, com brilho; flutua), **orelhas de gato** e **gravata-borboleta**.

- Seguem as regras dos outros: assentam em anéis (`A` em `Mascote.svelte`), têm sombra na cara, luz e movimento próprio
  (`.acc`, com origem em `--ax/--ay`). As orelhas ficam **atrás do corpo** (que lhes tapa a raiz) e usam a cor do
  corpo, também com a "lavagem" da expressão, e mexem-se de vez em quando.
- Nenhum tapa os olhos: nada passa de y ≈ 121 na cara (os olhos começam a 129), nem as palas do boné e do capacete.
- **Bolas**: os auscultadores ocupam os flancos, onde repousam o ciano e o amarelo; por isso, com eles, essas duas
  repousam nos cantos de cima, fora da fita (`REPOUSO` em `Mascote.svelte`). As da frente ficam como estão.
- **Sombras de arcos finos**: o desfocado de um arco (caixa de 10 px de altura) era cortado em linha reta pela região
  do filtro (200 % da caixa), e via-se uma faixa cinzenta por baixo das abas. As sombras dos arcos usam agora um filtro
  de região fixa (`-bs`), o que corrigiu também a boina, o gorro, a coroa e o cachecol.
- Contornos: o que é branco (cozinheiro) e da cor do corpo (orelhas) leva contorno suave para não desaparecer no
  fundo claro; o cozinheiro faz o contorno com as mesmas formas desenhadas duas vezes (grosso por baixo, enchimento por
  cima), para as bolhas se fundirem sem linhas por dentro.

**Testes:** `testes/mascote/acessorios-desenho.test.ts` desenha a mascote no servidor (`svelte/server`) com cada
acessório e confirma que todos os da lista aparecem, que não há dois com o mesmo desenho, que só aparece um de cada vez
e que os auscultadores mexem nas bolas de trás.

**Verificado** no Chromium: folha com todos nos cinco tons do corpo (claro e escuro), as 21 expressões com boné,
capacete e orelhas (olhos nunca tapados), em voo, e a galeria das Definições; na app, na página inicial.

## 43. Preview da sangria

Botão "Ver preview" na secção **Sangria** das Correções (ao lado do da §35, e os dois podem estar ligados juntos). Mostra a
página como vai ficar com a sangria espelhada, sem alterar nada.

- **A mesma geometria da correção:** `faixasDeSangria()` (em `correcoes/sangria.ts`) devolve as oito faixas (retângulo de
  destino e espelho de cada uma); `conteudoDeSangria()` escreve-as no PDF e o preview desenha-as. Não há duas cópias da conta.
- **Como se desenha** (`Visualizador.svelte`, `desenharPrevia`): a página é desenhada à parte com **fundo transparente**
  (`background: 'rgba(0,0,0,0)'` no pdf.js), para onde não há arte ficar vazio como no PDF. Num canvas que cobre a folha
  (a área visível mais a sangria) pinta-se esta imagem oito vezes, cada uma cortada à sua faixa e espelhada, e depois uma
  vez normal por cima. Assim, onde o original já tinha arte fora do corte, é essa que se vê, tal como na correção
  (`sangria.ts`: "onde já havia sangria, vê-se a original"). As contas de matrizes estão em `interface/sangria-previa.ts`
  (puras, com testes). Os cortes das faixas usam pixeis inteiros: com fracções de pixel aparecia uma risca clara entre faixas vizinhas.
- **A folha cresce:** onde a página não tem margem, o canvas é maior que a página e o zoom "Página" ajusta-se (como no preview
  das marcas). Uma linha tracejada marca até onde vai a arte (a futura BleedBox).
- **Legenda** em baixo: "Sangria de X mm, espelhada à volta do corte · a página cresce Y mm de cada lado", ou "Esta
  página já tem sangria: não se mexe nela". Com os dois previews ligados as legendas ficam empilhadas.
- **Só quem precisa:** as páginas são as dos alertas de sangria (a mesma lista que a correção usa). Desliga-se ao aplicar, ao
  desmarcar a sangria, ao sair do painel, com um valor fora de 0,5–10 mm ou ao abrir outro ficheiro. Não funciona no Comparar
  (que já mostra o resultado real).
- **Cores normais:** com as separações ligadas (por omissão, §36) a página aparece em placas; o preview mostra a página
  em cor normal, porque a sangria vê-se melhor assim e as placas não têm fundo transparente. Isto está dito na nota do painel.

**Verificado:** 16 testes novos (faixas, matrizes, pixeis inteiros, plano com e sem margem). No Chromium, com PDFs de teste
(arte a acabar no corte, com e sem margem à volta): as cores do preview nos lados e nos cantos são as esperadas, e batem
com o que o PDF corrigido dá renderizado à parte (poppler); funciona com o exemplo da app, em conjunto com o preview das
marcas, com zoom, e desliga-se ao aplicar. Não verificado no Mac.

## 44. Reordenar os separadores

Os separadores (§39) deixam de ser fixos: arrastam-se para mudar a ordem, como no Chrome.

- **Rato:** carrega-se num separador e arrasta-se; a partir de 5 px é um arrasto (um clique continua a ser só um clique). O
  separador segue o rato por cima dos outros e, ao passar o centro de um vizinho, trocam de lugar (os outros deslizam com
  `animate:flip`). Perto das pontas a barra rola. Ao largar, assenta no seu lugar. O botão de fechar não inicia arrastos.
- **Teclado:** `Alt+←/→` no separador com foco (mantém o foco) e `Ctrl/Cmd+Shift+PageUp/PageDown` para o separador ativo.
  `Ctrl/Cmd+1…9` e `Ctrl+Tab` passam a seguir a nova ordem.
- **Os documentos não se mexem:** a ordem é só da barra. Os `Documento` continuam desenhados por ordem de criação
  (`documentosPorId` em `App.svelte`); se acompanhassem a barra, o Svelte moveria os seus nós no DOM. Por isso cada PDF
  conserva o zoom, a página, os painéis e as correções quando se reordena (verificado).
- A lógica pura está em `separadores.ts` (`mover`, `moverPorPasso`, `posicaoAoArrastar`), com testes; o arrasto em
  `Separadores.svelte` (pointer events, deslocamento por `transform`, sem HTML5 drag-and-drop, que no Electron é desajeitado).
- Não faz: guardar a ordem entre sessões (nem os separadores se guardam), arrastar um separador para fora para abrir
  outra janela.

**Verificado** no Chromium com quatro PDFs: arrastar o 4.º para o início e o 1.º para o meio, um clique não reordena,
`Alt+←`, `Ctrl+Shift+PageDown`, `Ctrl+2`, e o zoom de cada documento fica igual depois de reordenar. Não verificado no Mac.

## 45. Abrir vários PDFs de uma vez

Arrastar (ou escolher) dois ou mais PDFs só abria um. Havia quatro afunilamentos, todos com "o primeiro e mais nenhum":

- **A pílula da notch** (`Notch.svelte`) só olhava para `files[0]`. Agora filtra os PDFs (ignora o resto) e manda a lista
  de uma vez (`notch:soltar-lista`): a animação corre **uma** vez e a janela principal recebe todos, por ordem. Se alguns
  não se conseguirem ler, abrem-se os outros e um diálogo diz quais falharam.
- **O ícone da bandeja, a linha de comandos (segunda instância) e o arranque com ficheiros** abriam `[0]`. Passaram a abrir
  todos (`abrirVarios` em `electron/main.mjs`, a janela mostra-se uma vez). No macOS, escolher vários no Finder dá um
  `open-file` por ficheiro: antes ficava só o último se a app ainda não estivesse pronta (`caminhoMac` era uma variável só),
  agora guardam-se todos.
- **`pendente`** (o PDF à espera de a janela estar pronta) era uma vez só: um segundo ficheiro apagava o primeiro. É uma
  fila (`pendentes`), por ordem, e o renderer pede-a toda (`ficheirosIniciais`).
- **Corrida no renderer** (`App.svelte`): dois pedidos seguidos decidiam o separador antes de o primeiro o marcar como
  ocupado, e iam os dois para o mesmo (o segundo substituía o primeiro). `abrirEm` passou a ter uma fila: decide-se um de
  cada vez, e só se espera que o separador fique marcado como ocupado, não que o PDF acabe de abrir, por isso carregam em
  paralelo.

**Verificado** com o Electron real: o teste dos separadores falhava antes ("abriram os dois" → só um) e passa agora, o da
notch larga dois PDFs na pílula e abrem os dois (animação uma vez), e no Chromium largar três na janela abre três.
Os e2e do notch e da bandeja continuam a passar.

## 46. Limpar o ficheiro e refazer as marcas de corte

Pedido de produção: como a opção "geometria e marcas" do Preflight do Acrobat, quando um ficheiro vem com barras de cor,
marcas de registo, texto de página ou marcas de corte velhas, tirar tudo e deixar só marcas de corte limpas; e poder pôr
marcas **sempre**, mesmo que o ficheiro já traga sangria ou marcas.

Nas Correções → Marcas de corte há agora «Limpar o ficheiro: tirar tudo o que está fora da sangria e refazer as marcas em
todas as páginas, mesmo nas que já as têm», com a sangria a manter (por omissão a de referência das Definições). A caixa
principal já não fica desativada quando todas as páginas têm marcas.

- **Em duas camadas** (`src/correcoes/limpeza.ts`), para não depender de uma só:
  1. **Retirar** (`retirarForaDaSangria`): o interpretador (o mesmo do overprint e das placas) diz, para cada operador de
     pintura da página, onde está e que caixa ocupa. O que fica inteiro fora da sangria sai do conteúdo: caminhos (o operador
     de pintura passa a `n`, o caminho some-se), imagens e gradientes (a chamada sai), Forms que só desenham coisas lá fora (e
     não chamam outros), e **blocos de texto `BT…ET`** inteiros quando todo o texto que mostram está fora. De um bloco que sai
     ficam os operadores de estado (`Tf`, cor…), porque o texto seguinte pode contar com eles. Como o texto sai mesmo, uma fonte
     não incorporada que só servia o texto da margem deixa de contar nos alertas. Corre **antes** de tudo o resto (as outras
     correções não contam coisas que vão sair) e antes da sangria gerada (que passa a página a Form).
  2. **Recortar** (`refazerMarcas`): a arte fica num Form com BBox igual à sangria mantida, o que esconde o resto (grupos
     com arte misturada, padrões). Desenham-se as oito marcas e a página fica do tamanho exato delas: MediaBox e CropBox =
     corte + afastamento + comprimento + folga, TrimBox inalterada, BleedBox = a sangria mantida. Nas páginas da sangria
     gerada recorta-se o Form `ArtSangria` e as marcas juntam-se ao fim (para continuarem reconhecidas como tal).
- **Sangria mantida** (`manterDaPagina`): lado a lado, a maior entre a BleedBox do ficheiro e a pedida (e a gerada no mesmo
  pedido). Uma BleedBox maior do que a pedida respeita-se.
- **Só com TrimBox.** Sem ela não se sabe onde é o corte (a "página" inclui as marcas), por isso essas páginas ficam como
  estavam e o resumo diz quantas ("define a TrimBox no Acrobat ou no Illustrator"). Não se deduz o corte a partir das
  marcas velhas: seria adivinhar.
- **Idempotente:** limpar um ficheiro já limpo tira as marcas da vez anterior (ficam fora da sangria) e refá-las (é assim
  que se "substituem").
- **Preview** (botão "Ver preview" das marcas): com a opção ligada mostra o resultado: o que fica fora da folha nova
  escurece, entre a sangria e a folha (onde as marcas velhas viviam) fica papel limpo, a sangria mantida a tracejado e as
  marcas novas, com a legenda «Limpa tudo fora de 3 mm de sangria · marcas de 9,5 mm a 5 mm do corte · a folha fica
  130 × 130 mm». Usa o mesmo plano (`planearMarcas`) e a mesma área (`manterDaPagina`) da correção. Páginas sem TrimBox dizem-no.
- **O que não faz** (limite conhecido): não retira objetos que estão dentro de Forms com arte misturada, só os esconde pelo
  recorte (o ficheiro continua a trazê-los, mas não se veem nem contam para os alertas); não retira texto de um bloco que
  também mostra texto dentro da sangria; não apaga as fontes e espaços de cor que deixaram de se usar (o ficheiro não
  encolhe); não limpa camadas (OCG) ocultas.

**Verificado:** 20 testes novos (ficheiro com arte, barras de cor, marcas de registo, marcas velhas e texto de página numa
fonte não incorporada: o alerta da fonte desaparece, a arte fica, as caixas ficam certas, o original não se altera, é
idempotente, com sangria no mesmo pedido, páginas sem TrimBox, blocos de texto mistos, Forms mistos e Forms só com barras);
renderizado com poppler antes e depois (só fica a arte e as oito marcas, a página encolhe de 160 para 130 mm); no Chromium o
fluxo completo na app (preview, aplicar, comparar). Não verificado com ficheiros reais de InDesign/Illustrator/Quark nem no Mac.

## 47. Editar objetos (apagar, mover, mudar o tamanho e a cor)

Quarta ferramenta da barra do visualizador (ícone do cursor com um quadrado, atalho **E**), ao lado do leitor de cor, da mão
e da régua. Serve para os ajustes de última hora que se faziam abrindo o Acrobat: tirar uma coisa, empurrar outra, mudar uma
cor. Não edita texto (letras): não é esse o uso, e num PDF as fontes costumam trazer só as letras que o ficheiro usa.
Trabalha sempre numa cópia: o original nunca se altera.

**Como se usa:** clicar num objeto seleciona o que está por cima (para formas usa o desenho e não só a caixa, por isso
um buraco deixa apanhar o que está por baixo; as linhas finas apanham-se com tolerância). Arrastar move (Shift fixa o eixo);
as oito alças mudam o tamanho (Shift mantém a proporção nos cantos, Alt é a partir do centro); as setas empurram 0,1 mm (Shift
1 mm), na direção que se vê no ecrã mesmo com a página rodada; Delete apaga; Esc tira a seleção; Ctrl/Cmd+Z desfaz e
Shift+Ctrl/Cmd+Z (ou Ctrl+Y) refaz. Um cartão no canto mostra o tipo, X, Y, L e A em mm (a contar do canto de cima à esquerda
do corte, como a régua; escrever um valor aplica-o), as cores CMYK (preenchimento e traço) e "Apagar objeto"; em baixo,
"Guardar cópia editada" e "Descartar tudo". Edições seguidas ao mesmo objeto (várias setas) contam como uma só para desfazer.

**O motor** (`src/edicao/`, funções puras, sem Svelte):
- **Objetos** (`objetos.ts`, `planearObjetos`): o interpretador diz, para cada operador de pintura da página, onde está no
  conteúdo, que caixa ocupa, a cor, os contornos e a CTM em vigor (o `Observacao` ganhou `ctm`). Cada forma, imagem, degradé,
  **bloco de texto `BT…ET`** e **grupo** (um Form inteiro, com a união do que desenha) é um objeto; o id é a ordem de pintura.
  Os ids são estáveis (calculam-se sempre sobre o original, com as layers como o ficheiro as traz), por isso as edições
  guardam-se por `(página, id)` e aplicam-se de uma vez.
- **Aplicar** (`aplicarEdicoes`): reescreve o conteúdo por texto, como as outras correções. Apagar: a pintura de uma forma passa a
  `n` (um recorte `W` antes dela continua a valer), o resto do que se apaga sai. Mover e mudar o tamanho: o objeto fica entre
  `q <cm> … Q`. A matriz que a interface calcula age no espaço da **página**; o motor converte-a para o espaço do objeto
  com a CTM (`l = ctm·m·ctm⁻¹`), por isso mover 5 mm é 5 mm mesmo dentro de `0,5 0 0 0,5 … cm` ou de uma rotação (testado).
  Cor: `q c m y k k … Q` à frente da forma; no texto a cor nova põe-se imediatamente antes de cada `Tj/TJ`, porque o bloco pode
  trazer a sua. Vários toques ao mesmo objeto juntam-se: apagar manda, as matrizes compõem-se, a última cor ganha.
- **Estado** (`estado.ts`): `estadoDosObjetos` dá, sem esperar pelo PDF, a caixa e a cor de cada objeto depois das edições (a
  interface usa-o para a seleção e para saber em que se clica); `objetoEm` faz o clique; `fundirSeguida` junta as setas.
- **Matrizes** (`matriz.ts`): as do PDF (`x' = a·x + c·y + e`), `matrizParaCaixa` leva uma caixa a outra (é o que fazem as alças
  e os campos X, Y, L, A).

**Na interface:** `EditorObjetos.svelte` é a camada por cima da página (só diz o que se quer fazer; faz as contas no ecrã e
converte para a página no fim); `PainelEdicao.svelte` é o cartão; `Documento.svelte` guarda as edições (e as refeitas), pede os
objetos ao worker (`objetos`, por página, só quando se ativa a ferramenta) e, a cada alteração, volta a fazer a cópia
(`editar` no worker) e a desenhá-la com o pdf.js. Enquanto há edições, o visualizador mostra a cópia editada **sem separações**
(as placas são do original) e sem as marcações de alertas nem o leitor de cor (também são do original). **Guardar cópia editada**
transforma-a na "cópia corrigida" (descarrega, compara, e mostra os alertas que ficam); se depois se aplicarem correções, **as
edições entram primeiro** e o resumo diz-o («edição: 1 objeto apagado, 2 movidos»).

**Limites (conhecidos):** só se edita o conteúdo da própria página: um Form conta como um grupo e não se mexe no que tem lá
dentro; um bloco `BT…ET` é um objeto (não cada palavra); a cor nova é sempre CMYK (uma spot passa a CMYK ao mudar-se, e o cartão
avisa); não há rotação, nem copiar, nem criar objetos novos, nem editar o texto; um objeto numa layer desligada por omissão
não aparece; e cada alteração refaz a cópia inteira, o que num ficheiro pesado se nota. As edições não se guardam entre sessões.

**Verificado:** 34 testes novos (a lista de objetos com a caixa, a cor e os contornos certos; apagar, mover e mudar o tamanho
com a página normal, com escala e deslocamento e com rotação; cor, também em texto com cor própria; composição de edições; o
original intacto; páginas várias; o clique com buracos e linhas; juntar setas). Renderizado com o poppler (a cópia editada tem
o que se pediu e nada mais). No Chromium, com a app: selecionar, arrastar, setas, medidas, cor, apagar, desfazer, refazer e
guardar; e numa página rodada 90°, onde as setas e o arrastar seguem o ecrã e Shift mantém a proporção. Não verificado com
ficheiros reais de InDesign/Illustrator nem no Mac.

