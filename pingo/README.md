# Pingo

Ajudante pessoal que vive no topo do ecrã do Mac. Um atalho, e tens à frente o que
apanhaste durante o dia e o estado dos clientes. Sem Dock, sem janelas, sem nuvem.

O nome e a mascote (uma gota de tinta com os quatro pontos CMYK) são um ponto de partida:
muda-os à vontade. O nome está numa constante só, em `electron/main.mjs`.

## Correr

Precisas de Node 20 ou superior.

```sh
npm install
npm run icone   # gera os PNG do ícone da bandeja
npm start
```

Não há build nem compilação: mexes num ficheiro, fechas e voltas a abrir. É de propósito —
se acrescentar uma pílula custar mais do que isto, deixas de o fazer.

```sh
npm test       # testes do que guarda os dados
npm run dados  # diz onde está o ficheiro de dados neste sistema
```

## Atalhos

- `Control+Alt+Space` — abre e fecha.
- `Control+Alt+N` — captura rápida: abre já com o cursor na caixa de texto.
- `Esc` — fecha.
- Clique no ícone junto ao relógio abre; botão direito dá o menu (abrir o ficheiro de
  dados, arrancar com o sistema, sair).

Se um atalho estiver ocupado por outra app, o terminal avisa ao arrancar e os outros
continuam a funcionar.

## O que já faz

**Hoje** — o que te lembraste durante o dia. `Control+Alt+N` em qualquer sítio do Mac,
escreves, Enter, e volta tudo ao que estavas a fazer. À noite está lá à tua espera.
Marcar como feita, apagar, limpar as feitas.

**Clientes** — o total recorrente por mês em destaque, e a lista por quem falta receber
primeiro: atrasados em cima, depois os que vencem este mês, depois os pagos. O botão
"Recebi" marca o mês corrente como pago. Clicar no nome abre o site no browser.

Os clientes editam-se à mão no ficheiro de dados (botão **Dados**, no fim do painel). É
assumidamente simples: um formulário para isto seria meia noite de trabalho para uma coisa
que mexes uma vez por cliente. O `dados-exemplo.json` mostra o formato — se quiseres
arrancar com dados, copia-o para o sítio que o `npm run dados` indicar.

## Onde vivem os dados

Num único JSON em `~/Library/Application Support/pingo/dados.json`. Nada sai do teu Mac:
não há servidor, não há contas, não há telemetria. A escrita é atómica (ficheiro temporário
e troca), por isso nunca fica um JSON a meio se algo falhar.

## Acrescentar uma pílula

É o ponto todo deste projeto. Três passos:

1. Um ficheiro em `renderer/pilulas/`, a copiar a forma do `hoje.js`:
   `{ id, titulo, cor, resumo(estado), render(estado, api) }`. O `id` é contrato — acrescenta-se,
   nunca se renomeia.
2. Uma linha no `renderer/pilulas/catalogo.js`.
3. Se precisar de guardar algo novo, um `case` em `acao()` no `electron/dados.mjs` e o campo
   correspondente no `sanear()`, para sobreviver a um ficheiro estragado.

O `resumo()` devolve a linha curta que aparece na barra fechada. Devolve `''` e a pílula não
aparece lá — só quando se abre o painel.

A regra que mantém isto vivo: **se uma pílula precisar de mais de duas noites, não é uma
pílula, é um produto.** Arquiva e passa à seguinte.

## A fazer, por ordem

1. **Preflight** — largar um PDF na janela e ver o veredito sem abrir o Arte Final. O motor
   já existe; é ligar os dois.
2. **Sites de pé** — um ping a cada site de cliente. Atenção: isto só corre com a app aberta,
   portanto para saber de uma queda quando estás longe do Mac, a vigilância tem de viver
   fora daqui e a pílula só mostra o resultado.
3. **Horas por cliente** — começar e parar, para saberes se um site de 600 € te levou quatro
   horas ou trinta.

## Notas

Ver [`NOTAS.md`](NOTAS.md) para a relação com o Coucou e o que de lá se pode ou não usar.
