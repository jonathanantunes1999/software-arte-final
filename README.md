# Arte Final

Verificador de PDFs para gráficas. Arrasta o PDF e vês logo a medida final, a
sangria e uma lista de alertas, com inspeção de cores, overprint, layers e
separações, correções automáticas numa cópia e um relatório para o cliente.
Corre no browser e como aplicação de ambiente de trabalho (Electron).

Interface em português de Portugal. Ver a arquitetura em
[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Correr

Precisas de Node 20 ou superior.

```sh
npm install
npm run dev        # abre em http://localhost:5173
```

Outros comandos:

```sh
npm test           # testes automáticos
npm run check      # verificação de tipos (svelte-check)
npm run build      # build de produção para dist/
npm run desktop    # constrói e abre a casca Electron
npm run empacotar  # instalador para o sistema onde corres (precisa de rede para descarregar o Electron)
```

A versão desktop tem os diálogos de abrir e guardar do sistema, abre PDFs a
partir do explorador de ficheiros ("Abrir com…") e propõe gravar a cópia
corrigida na pasta do original, sem nunca poder gravar por cima dele. Em
desenvolvimento: `npm run dev` e, noutro terminal,
`ARTE_FINAL_DEV_URL=http://localhost:5173 npm run desktop:dev`.

## Estado

**Fase 1 — Abrir e medir** (a funcionar, em modo browser):

- Arrastar e largar um PDF, ou botão "Abrir".
- Visualizador com zoom (−, +, ajustar à página, largura, 100%, Ctrl + roda do rato) e navegação (setas, número da página).
- Medida final pela TrimBox em mm com uma casa decimal, com indicação de onde vem (TrimBox, ou CropBox/MediaBox se o ficheiro não a define).
- Etiqueta de formato (A0–A7, DL, cartão de visita), ao alto ou "horizontal", tolerância de ±0,5 mm. Lista editável em Definições e guardada no browser.
- Sangria por lado (BleedBox − TrimBox), comparada com a referência configurável (3 mm por omissão).
- Aviso quando as páginas têm tamanhos diferentes.
- Linhas de corte e de sangria sobrepostas ao preview.
- Modo claro, escuro e automático.

**Fase 2 — Lista de alertas** (completa, 12 alertas):

- Painel de alertas com ícone de erro, aviso e informação. Clicar faz zoom e destaca o sítio; clicar outra vez passa ao local seguinte.
- **Sangria**, medida pelo conteúdo e não só pela BleedBox: elementos a tocar no corte sem passarem dele (erro) ou com menos que a referência (aviso). Diz que objeto é o culpado.
- **RGB**: vetores, texto e imagens em RGB.
- **Resolução**: imagens abaixo de 300 ppi (aviso) e de 150 ppi (erro), pelo tamanho a que estão colocadas. Os dois limites são configuráveis.
- **Linhas finas**: traços abaixo de 0,25 pt (configurável). Ignora faca, vincos e registo.
- **Preto**: texto pequeno (abaixo de 12 pt) em preto de quatro cores, e fundos grandes só em K 100%, que ficam acinzentados.
- **Spots duplicadas**: a mesma cor com nomes diferentes ("PANTONE 485 C" e "PANTONE 485 CV", ou só maiúsculas e espaços). Aponta os objetos do nome menos usado.
- **Zona de segurança**: texto e elementos de arte a menos de 3 mm do corte (configurável). O texto conta sempre; imagens e gráficos só se estiverem dentro do corte sem lhe tocar, porque o que toca é fundo ou sangria.
- **Marcas de corte**: duas por canto, alinhadas com o corte, fora da sangria e em cor de registo. Avisa quando faltam (nenhuma ou só algumas), quando estão mal colocadas (dentro da sangria, a entrar no corte, desalinhadas, ou fora da cor de registo) e, em informação, quando a página não tem espaço para elas. Pode desligar-se nas Definições.
- **QR codes**: lê os QR codes (vetoriais e em bitmap), diz para onde levam (ligação, email, telefone, Wi-Fi…) e avisa dos que têm menos de 20 mm de lado (configurável). Procura em segundo plano nas primeiras 60 páginas com gráficos ou imagens. Pode desligar-se nas Definições.
- **Overprint**: branco (0/0/0/0) em overprint, que desaparece; texto e linhas finas a K 100% sobre cor sem overprint efetivo; e spots técnicas (faca, vincos, verniz…) sem overprint. Conta o modo de overprint: em CMYK só o modo 1 funciona.
- **Fontes**: não incorporadas (erro) e texto ainda em fonte (informação).
- Tamanhos de página diferentes.
- A análise corre num Web Worker (473 páginas em cerca de 3 s) e mostra progresso.
- Spots técnicas (faca, vincos, verniz...) com lista editável em Definições.

**Fase 3 — Inspeção visual** (completa):

- **Leitor de cor** junto ao cursor: o objeto de cima e os três de baixo, com C/M/Y/K (ou o nome e a percentagem da spot), traço e preenchimento à parte, e se o overprint está ligado, desligado ou ligado mas sem efeito (CMYK em modo 0). Mostra a layer do objeto. Acompanha as layers que se ligam e desligam.
- **Layers** (Optional Content): lista as da página, liga e desliga no preview, no leitor e nas separações. Nomes repetidos ganham número. Se o ficheiro não tem layers, diz porquê (as do Illustrator em PDF editável não são layers PDF).
- **Separações**: C, M, Y, K e uma placa por cada spot, cada uma a ligar e desligar (ou "só esta"), com **simulação de overprint** (também se desliga). Mostra "sem tinta" nas placas vazias. Cobre texto, formas, imagens (cinzento, CMYK, RGB, Indexed, Separation, DeviceN, JPEG), degradés axiais e radiais e padrões de degradé.
- O que não se separa fica dito no painel (JPEG 2000, CCITT/JBIG2 a cores, Lab, malhas de degradé, padrões de mosaico, imagens inline).

**Fase 4 — Correções** (completa, sempre numa cópia `nome_corrigido.pdf`; o original nunca é alterado):

- **Overprint**: desligar em brancos; ligar (modo 1) em texto e linhas finas a K 100% sobre cor; ligar em spots técnicas (faca, vincos, verniz…). Usa a mesma deteção dos alertas, por isso o que o alerta aponta é o que se corrige. Repõe o estado anterior depois de cada objeto, para não afetar os seguintes.
- **Spots**: juntar duplicadas com um clique (o nome menos usado passa ao mais usado), ou dar a qualquer spot o nome que a gráfica espera (CutContour, Branco, Verniz… com sugestões das Definições). Muda o nome em todos os espaços de cor do ficheiro (Separation, DeviceN e /Colorants).
- **Cor de processo → spot**: escolhe-se a cor de um traço (ex.: o magenta 100% de uma faca feita em CMYK), o nome da spot e se é só traço, só preenchimento ou ambos, com overprint opcional.
- Depois de aplicar, a cópia é analisada outra vez e o painel mostra os alertas antes e depois.
- **Comparar** antes/depois: ver o original, a cópia, ou um mapa só com o que mudou (a magenta, com a percentagem de pixeis). Com as separações ligadas compara-se o resultado nas placas, que é onde o overprint se vê.

**Fase 5 — Texto em curvas** (completa, também numa cópia):

- Painel Correções → "Converter texto em curvas": lista as fontes do ficheiro (agrupadas por nome), diz quais se convertem e porquê as outras não, e deixa escolher.
- Cada texto passa a desenhar os contornos dos glifos, onde o texto caía (tamanho, espaçamentos, escala horizontal, elevação, matriz do texto, TJ). Depois retira do ficheiro as fontes que já ninguém usa.
- Cobre TrueType, OpenType com CFF e CFF "nu" (Type1C), em fontes simples e compostas com Identity-H.
- O resultado vê-se no **Comparar**: no azeite (2 fontes, 99 textos), 0,01% dos píxeis mudou; no livro, só as arestas dos glifos (a rasterização de texto e a de curvas não são iguais ao píxel).
- Fica como estava, com o motivo no painel: fontes Type 1, fontes não incorporadas, escrita vertical e outros CMaps, texto usado como recorte, glifos sem contorno, e blocos que misturam fontes que não se convertem.

**Depois das cinco fases** (ver §22 a §26 de ARQUITETURA.md):

- **Mais alertas**: tinta total (C+M+Y+K acima de 300%, no vetor e nas imagens), nº de páginas que não é múltiplo de 4 (cadernos), faca/vincos/verniz feitos em cor de processo, e marcas de corte só a preto para impressão digital.
- **Relatório para o cliente**: botão "Relatório" no cabeçalho. HTML limpo, em português, pronto a imprimir ou a guardar em PDF, com o veredito, o que se encontrou, as medidas, as cores especiais, as fontes e o que foi corrigido. Pode levar o nome da tua agência (Definições).
- **RGB → CMYK** (Correções): cores de vetores e texto, e imagens (DeviceRGB, CalRGB, ICC de 3 canais e Indexed). O preto RGB passa a K 100% e os cinzentos ficam só em K; a soma das tintas respeita o limite das Definições. É uma conversão simples, **sem perfis de cor**: serve para tirar o RGB do ficheiro, não para igualar uma prova de cor.
- **Sangria automática** (Correções): onde a arte pára no corte, gera sangria espelhando a faixa de dentro. Só mexe nas páginas que o alerta de sangria aponta. É um remendo: o ideal é estender a arte original.
- **Sugestões de spots parecidas**: carregas as tuas bibliotecas de cores (.acb ou .ase) nas Definições e, ao converter uma cor de processo em spot, a app mostra as mais próximas (ΔE 2000). Não traz dados de nenhuma marca de cor.
- **Revisão de texto em português de Portugal**, só por regras: vocabulário e formatos do Brasil, «estou fazendo», «afim de», grafias misturadas (com e sem Acordo de 1990), pontuação e reticências. Não é um corretor ortográfico.
- **Casca desktop** em Electron.

**Interface** (§27 de ARQUITETURA.md):

- **Estado à vista** no topo da lista: "Precisa de correções", "Quase pronto" ou "Sem problemas", com filtros (erros, avisos, notas).
- **Botão Corrigir** nos alertas que têm correção automática (sangria, overprint, spots duplicadas, faca em cor de processo, texto em curvas): abre o painel Correções já com a opção marcada. O botão Aplicar fica sempre à vista.
- **Alertas desenhados na página**, numerados e coloridos por gravidade. Passar o rato num alerta da lista destaca-o na página; clicar numa marca seleciona-o na lista.
- **Tira de páginas** com miniaturas e emblemas de alertas, para ficheiros com várias páginas.
- **Ferramentas**: leitor de cor (V), mão (H, ou segurar o espaço) e régua em mm (M). Barra de estado com as coordenadas do cursor, a partir do canto do corte, e a medida.
- **Painéis redimensionáveis** (arrasta o divisor, duplo clique repõe) e atalhos de teclado: N/P para o alerta seguinte e anterior, Ctrl O, e `?` para ver todos.

**Visual futurista** (§29 de ARQUITETURA.md): tema escuro por omissão (cinzento neutro à volta da página, bom para ver cor), gradiente ciano/violeta como única cor de destaque, números em monoespaçado, ecrã de entrada animado, pílula de estado no topo e o botão **Experimentar com um exemplo**, que abre um cartaz de teste com problemas de propósito.

**Modo notch** (só na versão desktop, §30 de ARQUITETURA.md): a app fica escondida. No topo do ecrã (na notch dos Macs que a têm) há só uma faixa invisível a ouvir. Arrastas um PDF para o topo, abre-se uma zona escura com "Coloca aqui o PDF", largas, e a janela principal cresce dali e abre o ficheiro. A zona desaparece. Nos primeiros arranques mostra uma dica para se saber que existe. Liga-se e desliga-se em Ver → Modo notch.

O que falta está na lista de ideias de ARQUITETURA.md.

## Notas

- O ficheiro original nunca é alterado: a app só lê.
- `public/pdfjs/` é gerado no `npm install` (fontes e cmaps do pdf.js). Não vai para o git.
