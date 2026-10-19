import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Dados } from './dados.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, '..');

/** O nome é um sítio só: muda aqui e muda em todo o lado */
export const NOME = 'Pingo';

const LARGURA = 520;
const ALTURA_FECHADA = 68;
const ALTURA_MAXIMA = 520;

const ATALHOS = {
  mostrar: 'Control+Alt+Space',
  capturar: 'Control+Alt+N',
};

let janela = null;
let bandeja = null;
let dados = null;
/** Enquanto o diálogo da bandeja está aberto, o blur não pode esconder a janela */
let aFecharPorNos = false;

if (!app.requestSingleInstanceLock()) app.quit();

function posicionar(altura) {
  const { bounds } = screen.getPrimaryDisplay();
  const x = Math.round(bounds.x + (bounds.width - LARGURA) / 2);
  // Colado ao topo: na notch o cartão parece pendurado dela (canto de cima quadrado, de baixo redondo)
  janela.setBounds({ x, y: bounds.y, width: LARGURA, height: altura }, false);
}

function criarJanela() {
  janela = new BrowserWindow({
    width: LARGURA,
    height: ALTURA_FECHADA,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(aqui, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Acima de tudo, inclusive da barra de menus e de apps em ecrã inteiro
  janela.setAlwaysOnTop(true, 'screen-saver');
  janela.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  posicionar(ALTURA_FECHADA);
  janela.loadFile(path.join(raiz, 'renderer', 'index.html'));

  // Comporta-se como um popover: clicar fora fecha
  janela.on('blur', () => {
    if (!aFecharPorNos) esconder();
  });

  // Links abrem no browser, nunca dentro da app
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function mostrar(foco = 'nada') {
  if (!janela) return;
  janela.showInactive();
  janela.focus();
  janela.webContents.send('pingo:focar', foco);
}

function esconder() {
  if (!janela?.isVisible()) return;
  janela.webContents.send('pingo:fechado');
  janela.hide();
}

function alternar() {
  if (janela?.isVisible()) esconder();
  else mostrar();
}

/** Só a nossa janela pode falar connosco */
const deConfianca = (e) => !!janela && e.sender === janela.webContents;

function registarIpc() {
  ipcMain.handle('pingo:ler', (e) => (deConfianca(e) ? dados.ler() : null));
  ipcMain.handle('pingo:acao', (e, nome, carga) => {
    if (!deConfianca(e) || typeof nome !== 'string') return null;
    return dados.acao(nome, carga && typeof carga === 'object' ? carga : {});
  });
  // O renderer sabe de que altura precisa; a janela acompanha
  ipcMain.on('pingo:altura', (e, px) => {
    if (!deConfianca(e) || !Number.isFinite(px)) return;
    posicionar(Math.round(Math.min(ALTURA_MAXIMA, Math.max(ALTURA_FECHADA, px))));
  });
  ipcMain.on('pingo:esconder', (e) => deConfianca(e) && esconder());
  ipcMain.on('pingo:abrir-dados', (e) => {
    if (!deConfianca(e)) return;
    aFecharPorNos = true;
    shell.openPath(dados.ficheiro).finally(() => {
      aFecharPorNos = false;
    });
  });
  ipcMain.on('pingo:abrir-ligacao', (e, url) => {
    if (deConfianca(e) && typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
  });
}

function criarBandeja() {
  const icone = nativeImage.createFromPath(path.join(raiz, 'assets', 'bandeja.png'));
  if (process.platform === 'darwin') icone.setTemplateImage(true);
  bandeja = new Tray(icone);
  bandeja.setToolTip(NOME);
  bandeja.on('click', alternar);
  bandeja.on('right-click', () => {
    bandeja.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: `Abrir ${NOME}`, accelerator: ATALHOS.mostrar, click: () => mostrar() },
        { label: 'Captura rápida', accelerator: ATALHOS.capturar, click: () => mostrar('captura') },
        { type: 'separator' },
        { label: 'Abrir o ficheiro de dados…', click: () => shell.openPath(dados.ficheiro) },
        {
          label: 'Arrancar com o sistema',
          type: 'checkbox',
          checked: app.getLoginItemSettings().openAtLogin,
          click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
        },
        { type: 'separator' },
        { label: 'Sair', role: 'quit' },
      ]),
    );
  });
}

app.whenReady().then(() => {
  // Sem ícone na Dock e sem barra de menus: o Pingo vive na notch e no ícone junto ao relógio
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory');
    app.dock?.hide();
  }
  Menu.setApplicationMenu(null);

  dados = new Dados(app.getPath('userData'));
  dados.ler();

  registarIpc();
  criarJanela();
  criarBandeja();

  const falhou = Object.entries(ATALHOS).filter(([nome, tecla]) => {
    const ok = globalShortcut.register(tecla, () => (nome === 'capturar' ? mostrar('captura') : alternar()));
    return !ok;
  });
  if (falhou.length) console.warn(`[${NOME}] atalhos ocupados por outra app:`, falhou.map(([, t]) => t).join(', '));
});

app.on('second-instance', () => mostrar());
app.on('window-all-closed', () => {});
app.on('will-quit', () => globalShortcut.unregisterAll());
