# Notas

## Sobre o Coucou

Este projeto nasceu depois de ver o [Coucou](https://github.com/Louis-CFM/coucou), do Louis Raillé.
Nenhuma linha de código veio de lá — o Coucou é Swift e Rust, isto é Electron — mas as ideias vieram:

- o **catálogo de pílulas** como fonte única de verdade, com IDs estáveis (ver `renderer/pilulas/catalogo.js`);
- a janela comportar-se como um **popover** que se esconde ao perder o foco;
- a personagem **desenhada em código**, sem imagens nem Lottie;
- **como se mede a notch** (`electron/medir-notch.mjs`): altura pelo `safeAreaInsets.top` da
  `NSScreen`, largura pelo ecrã menos as `auxiliaryTopLeftArea` e `auxiliaryTopRightArea`,
  que são as faixas da barra de menus de cada lado. Mesma conta que o
  `IslandScreenGeometry.swift` dele, e o mesmo 184 quando não dá para medir;
- os **três estados** da ilha (fechada, a espreitar, aberta) e a mola das animações:
  o SwiftUI dele escreve `spring(response: 0.5, dampingFraction: 0.72)` e o CSS daqui
  leva essa mesma mola amostrada numa curva `linear()`.

O código do Coucou é MIT, portanto ideias e código podem ser reaproveitados desde que o aviso
de copyright acompanhe o que se copiar. Se algum dia copiares código de lá, acrescenta aqui:

```
Partes de <ficheiro> adaptadas do Coucou — Copyright (c) 2026 Louis Raillé, MIT License.
```

**O que não se pode usar** (está no `LICENSE-ASSETS.md` dele): o nome "Coucou", o nome e a
personagem "Mochi" — desenho, aparência, expressões e animações —, o ícone, os sons e as
imagens de `docs/media/` e `design/`. Nada disso pode ser usado comercialmente nem num
derivado, mesmo com o código sendo MIT.

## A mascote

A mascote veio do **Arte Final**, o outro projeto do Jonathan: o mesmo corpo em superelipse
(n = 2,55, bem mais achatado que um squircle), os mesmos tons de luz e sombra, os mesmos
olhos grandes e lisos sem boca. Código e desenho próprios, trazidos de um projeto dele para
o outro — ver `src/interface/Mascote.svelte` e `src/mascote/` nesse repositório. As quatro
bolas CMYK que lá tem ficaram de fora: ali eram as tintas de impressão, aqui não vinham a
propósito.

Uma nota para quem vier a isto depois: eram essas bolas que distinguiam a mascote à primeira
vista. Sem elas, um corpo macio de olhos grandes sem boca é uma forma que muita gente usa,
o Mochi incluído. A forma em si não é de ninguém, e esta foi desenhada do zero no Arte
Final — mas se um dia isto for a público, vale a pena ter algo que seja inconfundívelmente
desta casa: a cor, uma marca, qualquer coisa.
