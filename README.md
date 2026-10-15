# Arte Final

Verificador de PDFs para gráficas. Arrasta o PDF e vês logo a medida final, a
sangria e (nas próximas fases) uma lista de alertas, com inspeção de cores,
overprint, layers e separações.

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
```

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

**Fase 2 — Lista de alertas** (em curso, 6 de 12 alertas):

- Painel de alertas com ícone de erro, aviso e informação. Clicar faz zoom e destaca o sítio; clicar outra vez passa ao local seguinte.
- **Sangria**, medida pelo conteúdo e não só pela BleedBox: elementos a tocar no corte sem passarem dele (erro) ou com menos que a referência (aviso). Diz que objeto é o culpado.
- **RGB**: vetores, texto e imagens em RGB.
- **Resolução**: imagens abaixo de 300 ppi (aviso) e de 150 ppi (erro), pelo tamanho a que estão colocadas. Os dois limites são configuráveis.
- **Linhas finas**: traços abaixo de 0,25 pt (configurável). Ignora faca, vincos e registo.
- **Preto**: texto pequeno (abaixo de 12 pt) em preto de quatro cores, e fundos grandes só em K 100%, que ficam acinzentados.
- **Fontes**: não incorporadas (erro) e texto ainda em fonte (informação).
- Tamanhos de página diferentes.
- A análise corre num Web Worker (473 páginas em cerca de 3 s) e mostra progresso.
- Spots técnicas (faca, vincos, verniz...) com lista editável em Definições.

Por fazer na fase 2: overprint (ligado e desligado), zona de segurança, spots duplicadas, marcas de corte, QR codes. Fases 3 a 5 por fazer.

## Notas

- O ficheiro original nunca é alterado: a app só lê.
- `public/pdfjs/` é gerado no `npm install` (fontes e cmaps do pdf.js). Não vai para o git.
