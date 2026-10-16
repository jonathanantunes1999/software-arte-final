import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mesmoCaminho, pareceUmPdf, pdfsDosArgumentos, resolverCaminho, tipoDe } from './caminhos.mjs';

/**
 * Casca fina: uma janela com a app web (a pasta dist), mais três coisas que o browser não faz
 * bem: abrir e gravar com os diálogos do sistema, e abrir PDFs a partir do explorador de ficheiros.
 * Toda a análise corre na página, como na versão web.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizDist = path.join(aqui, '..', 'dist');
/** Em desenvolvimento, aponta para o servidor do Vite: ARTE_FINAL_DEV_URL=http://localhost:5173 */
const urlDev = process.env.ARTE_FINAL_DEV_URL;
const ORIGEM = 'arte://app';

protocol.registerSchemesAsPrivileged([{ scheme: 'arte', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

let janela = null;
/** PDFs pedidos antes de a janela estar pronta */
let pendente = null;

async function lerPdf(caminho) {
  const bytes = new Uint8Array(await readFile(caminho));
  if (!pareceUmPdf(bytes)) throw new Error('Não parece um PDF.');
  return { nome: path.basename(caminho), caminho, bytes };
}

async function abrirNaJanela(caminho) {
  let ficheiro;
  try {
    ficheiro = await lerPdf(caminho);
  } catch (e) {
    dialog.showErrorBox('Não consegui abrir o ficheiro', `${caminho}\n\n${e.message}`);
    return;
  }
  if (janela && !janela.webContents.isLoading() && !pendente) {
    janela.webContents.send('arte:abrir-ficheiro', ficheiro);
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  } else {
    pendente = ficheiro;
  }
}

/** Só a nossa página fala com o processo principal */
function deConfianca(evento) {
  const url = evento.senderFrame?.url ?? '';
  return url.startsWith(`${ORIGEM}/`) || (urlDev && url.startsWith(urlDev));
}

function registarIpc() {
  ipcMain.handle('arte:abrir', async (evento) => {
    if (!deConfianca(evento)) return null;
    const r = await dialog.showOpenDialog(janela, { title: 'Abrir PDF', properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    try {
      return await lerPdf(r.filePaths[0]);
    } catch (e) {
      dialog.showErrorBox('Não consegui abrir o ficheiro', e.message);
      return null;
    }
  });

  ipcMain.handle('arte:guardar', async (evento, nomeSugerido, bytes, caminhoOriginal) => {
    if (!deConfianca(evento)) return null;
    if (typeof nomeSugerido !== 'string' || !pareceUmPdf(bytes)) return null;
    const nome = path.basename(nomeSugerido).replace(/[<>:"/\\|?*\0]/g, '_') || 'corrigido.pdf';
    const pasta = typeof caminhoOriginal === 'string' && caminhoOriginal ? path.dirname(caminhoOriginal) : app.getPath('documents');
    for (;;) {
      const r = await dialog.showSaveDialog(janela, { title: 'Guardar cópia corrigida', defaultPath: path.join(pasta, nome), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (r.canceled || !r.filePath) return null;
      if (typeof caminhoOriginal === 'string' && caminhoOriginal && mesmoCaminho(r.filePath, caminhoOriginal)) {
        await dialog.showMessageBox(janela, { type: 'warning', message: 'Não se grava por cima do original.', detail: 'Escolhe outro nome: o ficheiro original fica sempre como estava.', buttons: ['Escolher outro nome'] });
        continue;
      }
      await writeFile(r.filePath, bytes);
      return r.filePath;
    }
  });

  ipcMain.handle('arte:inicial', (evento) => {
    if (!deConfianca(evento)) return null;
    const f = pendente;
    pendente = null;
    return f;
  });
}

function menu() {
  const mac = process.platform === 'darwin';
  const modelo = [
    ...(mac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Ficheiro',
      submenu: [
        {
          label: 'Abrir PDF…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const r = await dialog.showOpenDialog(janela, { title: 'Abrir PDF', properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] });
            if (!r.canceled && r.filePaths[0]) abrirNaJanela(r.filePaths[0]);
          },
        },
        { type: 'separator' },
        mac ? { role: 'close', label: 'Fechar' } : { role: 'quit', label: 'Sair' },
      ],
    },
    { label: 'Editar', submenu: [{ role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' }] },
    {
      label: 'Ver',
      submenu: [
        { role: 'resetZoom', label: 'Tamanho normal' },
        { role: 'zoomIn', label: 'Aumentar' },
        { role: 'zoomOut', label: 'Diminuir' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Ecrã inteiro' },
        ...(urlDev ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(modelo));
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Arte Final',
    backgroundColor: '#f4f5f7',
    webPreferences: {
      preload: path.join(aqui, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // O relatório abre-se numa janela própria (blob:). Qualquer outra coisa: links externos no browser do sistema.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:') || url === 'about:blank') return { action: 'allow' };
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${ORIGEM}/`) && !(urlDev && url.startsWith(urlDev))) e.preventDefault();
  });
  janela.on('closed', () => (janela = null));
  janela.loadURL(urlDev ?? `${ORIGEM}/index.html`);
}

const sozinha = app.requestSingleInstanceLock();
if (!sozinha) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const pdfs = pdfsDosArgumentos(argv, app.isPackaged);
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
    if (pdfs[0]) abrirNaJanela(pdfs[0]);
  });

  // macOS: duplo clique num PDF
  let caminhoMac = null;
  app.on('open-file', (e, caminho) => {
    e.preventDefault();
    if (app.isReady()) abrirNaJanela(caminho);
    else caminhoMac = caminho;
  });

  app.whenReady().then(async () => {
    protocol.handle('arte', async (pedido) => {
      const u = new URL(pedido.url);
      const ficheiro = u.host === 'app' ? resolverCaminho(raizDist, u.pathname) : null;
      if (!ficheiro || !existsSync(ficheiro)) return new Response('Não encontrado', { status: 404 });
      const corpo = await readFile(ficheiro);
      const tipo = tipoDe(ficheiro);
      // A app não precisa de rede: tudo corre aqui dentro. 'wasm-unsafe-eval' é para o leitor de PDF.
      const csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'";
      return new Response(corpo, { headers: tipo.startsWith('text/html') ? { 'content-type': tipo, 'content-security-policy': csp } : { 'content-type': tipo } });
    });

    registarIpc();
    menu();
    const inicial = caminhoMac ?? pdfsDosArgumentos(process.argv, app.isPackaged)[0];
    criarJanela();
    if (inicial) await abrirNaJanela(inicial);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (!janela) criarJanela();
  });
}
