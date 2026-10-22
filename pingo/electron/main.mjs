import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Dados } from './dados.mjs';
import { medirNotch } from './medir-notch.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, '..');

/** O nome é um sítio só: muda aqui e muda em todo o lado */
export const NOME = 'Pingo';

/**
 * A janela é a ilha: não há moldura nem fundo, e o seu tamanho acompanha sempre o
 * desenho lá dentro. Fechada tem o tamanho da notch e fica preta — contra a notch
 * verdadeira não se vê. É por isso que ela não se esconde nunca: ela *é* a notch.
 */

const ATALHOS = {
  mostrar: 'Control+Alt+Space',
  capturar: 'Control+Alt+N',
};

let janela = null;
let bandeja = null;
let dados = null;
let notch = { largura: 184, altura: 32, temNotch: false, comoSoube: 'ainda não medida' };

if (!app.requestSingleInstanceLock()) app.quit();

/** PINGO_NOTCH=190 npm start força a largura, se a medida não assentar */
function larguraForcada() {
  const n = Number(process.env.PINGO_NOTCH);
  return Number.isFinite(n) && n > 40 ? n : undefined;
}

async function remedir() {
  notch = await medirNotch(screen.getPrimaryDisplay(), larguraForcada());
  janela?.webContents.send('pingo:notch', notch);
  return notch;
}

/** Centrada no topo do ecrã, com o tamanho que o desenho pediu */
function assentar(largura, altura) {
  const { bounds } = screen.getPrimaryDisplay();
  janela.setBounds(
    {
      x: Math.round(bounds.x + (bounds.width - largura) / 2),
      y: bounds.y,
      width: Math.round(largura),
      height: Math.round(altura),
    },
    false,
  );
}

function criarJanela() {
  janela = new BrowserWindow({
    width: notch.largura,
    height: notch.altura,
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

  // Acima da barra de menus e das apps em ecrã inteiro, em todas as secretárias
  janela.setAlwaysOnTop(true, 'screen-saver');
  janela.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  assentar(notch.largura, notch.altura);
  janela.loadFile(path.join(raiz, 'renderer', 'index.html'));

  janela.once('ready-to-show', () => {
    janela.showInactive();
    janela.webContents.send('pingo:notch', notch);
  });

  // Clicar fora fecha o painel, mas a ilha fica (ela é a notch)
  janela.on('blur', () => janela.webContents.send('pingo:fora'));

  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Mudar de ecrã ou de resolução muda a notch
  screen.on('display-metrics-changed', () => void remedir());
}

function abrir(foco = 'nada') {
  if (!janela) return;
  janela.focus();
  janela.webContents.send('pingo:abrir', foco);
}

/** Só a nossa janela pode falar connosco */
const deConfianca = (e) => !!janela && e.sender === janela.webContents;

function registarIpc() {
  ipcMain.handle('pingo:ler', (e) => (deConfianca(e) ? dados.ler() : null));
  ipcMain.handle('pingo:acao', (e, nome, carga) => {
    if (!deConfianca(e) || typeof nome !== 'string') return null;
    return dados.acao(nome, carga && typeof carga === 'object' ? carga : {});
  });
  // O desenho sabe de que espaço precisa; a janela vai atrás
  ipcMain.on('pingo:caixa', (e, largura, altura) => {
    if (!deConfianca(e) || !Number.isFinite(largura) || !Number.isFinite(altura)) return;
    assentar(Math.min(900, Math.max(60, largura)), Math.min(700, Math.max(20, altura)));
  });
  ipcMain.on('pingo:abrir-dados', (e) => deConfianca(e) && shell.openPath(dados.ficheiro));
  ipcMain.on('pingo:abrir-ligacao', (e, url) => {
    if (deConfianca(e) && typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  /**
   * Ao fechar a ilha, o teclado tem de voltar para a app onde estavas, senão
   * escreves no teu documento e não sai nada. Em macOS quem faz isso é o app.hide(),
   * que esconde tudo o que é nosso — e a ilha tem de ficar. Por isso esconde-se e
   * volta-se a mostrar sem foco. Num Mac com notch nem se vê: a faixa é preta de
   * qualquer maneira, com ilha ou sem ela.
   */
  ipcMain.on('pingo:largar-foco', (e) => {
    if (!deConfianca(e) || process.platform !== 'darwin') return;
    app.hide();
    setTimeout(() => janela?.showInactive(), 60);
  });
}

function criarBandeja() {
  const icone = nativeImage.createFromPath(path.join(raiz, 'assets', 'bandeja.png'));
  if (process.platform === 'darwin') icone.setTemplateImage(true);
  bandeja = new Tray(icone);
  bandeja.setToolTip(NOME);
  bandeja.on('click', () => abrir());
  bandeja.on('right-click', () => {
    bandeja.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: `Abrir ${NOME}`, accelerator: ATALHOS.mostrar, click: () => abrir() },
        { label: 'Captura rápida', accelerator: ATALHOS.capturar, click: () => abrir('captura') },
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
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory');
    app.dock?.hide();
  }
  Menu.setApplicationMenu(null);

  dados = new Dados(app.getPath('userData'));
  dados.ler();
  // Arranca com o palpite e corrige-se assim que o sistema responder (uns milissegundos)
  registarIpc();
  criarJanela();
  criarBandeja();
  void remedir().then((n) =>
    console.log(`[${NOME}] notch: ${n.temNotch ? 'sim' : 'não'} · ${n.largura}×${n.altura}pt · ${n.comoSoube}`),
  );

  const falhou = Object.entries(ATALHOS).filter(
    ([nome, tecla]) => !globalShortcut.register(tecla, () => abrir(nome === 'capturar' ? 'captura' : 'nada')),
  );
  if (falhou.length) console.warn(`[${NOME}] atalhos ocupados por outra app:`, falhou.map(([, t]) => t).join(', '));
});

app.on('second-instance', () => abrir());
app.on('window-all-closed', () => {});
app.on('will-quit', () => globalShortcut.unregisterAll());
