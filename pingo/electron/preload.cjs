const { contextBridge, ipcRenderer } = require('electron');

/**
 * A única porta entre a ilha e o sistema. O desenho não tem Node, não lê ficheiros
 * e não escreve nada: pede, e recebe o estado novo.
 */
contextBridge.exposeInMainWorld('pingo', {
  ler: () => ipcRenderer.invoke('pingo:ler'),
  acao: (nome, carga) => ipcRenderer.invoke('pingo:acao', nome, carga),
  /** O tamanho que a janela tem de ter para a ilha caber */
  caixa: (largura, altura) => ipcRenderer.send('pingo:caixa', largura, altura),
  largarFoco: () => ipcRenderer.send('pingo:largar-foco'),
  abrirDados: () => ipcRenderer.send('pingo:abrir-dados'),
  abrirLigacao: (url) => ipcRenderer.send('pingo:abrir-ligacao', url),
  /** Medidas da notch deste Mac, quando a app arranca e se o ecrã mudar */
  aoMedirNotch: (fn) => ipcRenderer.on('pingo:notch', (_e, n) => fn(n)),
  /** Atalho ou ícone da bandeja: 'captura' vai direto à caixa de texto */
  aoAbrir: (fn) => ipcRenderer.on('pingo:abrir', (_e, onde) => fn(onde)),
  aoPerderFoco: (fn) => ipcRenderer.on('pingo:fora', () => fn()),
});
