const { contextBridge, ipcRenderer } = require('electron');

/**
 * A única porta entre a janela e o sistema. O renderer não tem Node, não lê ficheiros
 * e não escreve nada: pede, e recebe o estado novo.
 */
contextBridge.exposeInMainWorld('pingo', {
  ler: () => ipcRenderer.invoke('pingo:ler'),
  acao: (nome, carga) => ipcRenderer.invoke('pingo:acao', nome, carga),
  altura: (px) => ipcRenderer.send('pingo:altura', px),
  esconder: () => ipcRenderer.send('pingo:esconder'),
  abrirDados: () => ipcRenderer.send('pingo:abrir-dados'),
  abrirLigacao: (url) => ipcRenderer.send('pingo:abrir-ligacao', url),
  /** 'captura' quando se entrou pelo atalho da captura rápida */
  aoFocar: (fn) => ipcRenderer.on('pingo:focar', (_e, onde) => fn(onde)),
  aoFechar: (fn) => ipcRenderer.on('pingo:fechado', () => fn()),
});
