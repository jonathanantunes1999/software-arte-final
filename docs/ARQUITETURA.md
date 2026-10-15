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
