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

É por isso que a mascote daqui é uma **gota de tinta** com quatro pontos CMYK, e não um
squircle de olhos grandes: personagem própria, de propósito, sem zona cinzenta.
