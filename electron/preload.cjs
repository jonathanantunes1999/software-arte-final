// Corre isolado da página (contextIsolation + sandbox). Só expõe o que a app precisa, sem acesso ao disco.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('arteFinal', {
  ehDesktop: true,
  /** Caminho de um ficheiro escolhido na página (para propor a mesma pasta ao gravar a cópia) */
  caminhoDe: (ficheiro) => {
    try {
      return webUtils.getPathForFile(ficheiro) || '';
    } catch {
      return '';
    }
  },
  /** Diálogo nativo de abrir. Devolve {nome, caminho, bytes} ou null. */
  abrir: () => ipcRenderer.invoke('arte:abrir'),
  /** Diálogo nativo de gravar. Nunca grava sem o utilizador escolher e nunca por cima do original. */
  guardar: (nomeSugerido, bytes, caminhoOriginal) => ipcRenderer.invoke('arte:guardar', nomeSugerido, bytes, caminhoOriginal),
  /** Para cada {nomeBase, negrito, italico}, a fonte instalada no computador ({nome, aproximada, bytes}) ou null */
  fontesDoSistema: (pedidos) => ipcRenderer.invoke('arte:fontes-sistema', pedidos),
  /** PDF com que a app foi aberta (duplo clique, "Abrir com…") */
  ficheirosIniciais: () => ipcRenderer.invoke('arte:iniciais'),
  /** Ficheiros abertos depois, com a app já a correr. Devolve a função que cancela. */
  aoAbrirFicheiro: (cb) => {
    const f = (_e, ficheiro) => cb(ficheiro);
    ipcRenderer.on('arte:abrir-ficheiro', f);
    return () => ipcRenderer.removeListener('arte:abrir-ficheiro', f);
  },

  /** O menu pediu para fechar o separador à frente (Cmd/Ctrl+W) */
  aoFecharSeparador: (cb) => {
    const f = () => cb();
    ipcRenderer.on('arte:fechar-separador', f);
    return () => ipcRenderer.removeListener('arte:fechar-separador', f);
  },

  /** A janela principal acabou de analisar o ficheiro que lhe entregaram (a animação da notch espera por isto) */
  analisePronta: () => ipcRenderer.send('arte:analise-pronta'),
  /** O progresso da análise (0…1), para a barra da janelinha */
  progressoAnalise: (fracao) => ipcRenderer.send('arte:progresso', fracao),

  /** A janela encolhe de volta para a pílula */
  recolher: () => ipcRenderer.send('arte:recolher'),
  /** Há pílula (modo notch ligado)? */
  modoNotch: () => ipcRenderer.invoke('arte:modo-notch'),
  aoModoNotch: (cb) => {
    const f = (_e, ligado) => cb(!!ligado);
    ipcRenderer.on('arte:modo-notch', f);
    return () => ipcRenderer.removeListener('arte:modo-notch', f);
  },
  /** Só a página da pílula usa isto (o processo principal confirma quem pergunta) */
  notch: {
    info: () => ipcRenderer.invoke('notch:info'),
    soltar: (caminho) => ipcRenderer.invoke('notch:soltar', caminho),
    soltarBytes: (nome, bytes) => ipcRenderer.invoke('notch:soltar-bytes', nome, bytes),
    soltarLista: (itens) => ipcRenderer.invoke('notch:soltar-lista', itens),
    /** Para o diagnóstico: conta os eventos de arrasto que a janelinha recebe */
    evento: (nome) => ipcRenderer.send('notch:evento', nome),
    /** Pede que a janelinha não se esconda durante `ms` (está a mostrar um erro) */
    segurar: (ms) => ipcRenderer.send('notch:segurar', ms),
    /** O processo principal mostra a janelinha (com o tipo: 'aberto' ou 'dica') e esconde-a depois da animação de saída */
    aoMostrar: (cb) => {
      const f = (_e, tipo) => {
        cb(String(tipo));
      };
      ipcRenderer.on('notch:mostrar', f);
      return () => ipcRenderer.removeListener('notch:mostrar', f);
    },
    /** O progresso real da análise (0…1) enquanto a mascote leva a barra */
    aoProgresso: (cb) => {
      const f = (_e, v) => {
        cb(Number(v));
      };
      ipcRenderer.on('notch:progresso', f);
      return () => ipcRenderer.removeListener('notch:progresso', f);
    },
    /** A sequência de entrada: 'devorar' (come o PDF e leva a barra) e 'concluir' (a barra fecha) */
    aoFase: (cb) => {
      const f = (_e, fase) => {
        cb(String(fase));
      };
      ipcRenderer.on('notch:fase', f);
      return () => ipcRenderer.removeListener('notch:fase', f);
    },
    aoEsconder: (cb) => {
      const f = () => {
        cb();
      };
      ipcRenderer.on('notch:esconder', f);
      return () => ipcRenderer.removeListener('notch:esconder', f);
    },
  },
});
