import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, protocol, screen, shell } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mesmoCaminho, pareceUmPdf, pdfsDosArgumentos, resolverCaminho, tipoDe } from './caminhos.mjs';
import { criarDetetor, dentro } from './aproximacao.mjs';
import { MAX_DICAS, boundsFinal, boundsNotch, interpolar, opacidadeDaAnimacao, sanearPrefs, suave, temNotchNoMac, zonaDeAproximacao } from './notch.mjs';
import { iniciarMonitorDoRato } from './rato.mjs';

/**
 * Casca fina: uma janela com a app web (a pasta dist), mais o que o browser não faz bem: abrir e
 * gravar com os diálogos do sistema, abrir PDFs a partir do explorador de ficheiros e o "modo notch".
 * Toda a análise corre na página, como na versão web.
 *
 * Modo notch: a app fica escondida. Quando arrastas um ficheiro e o aproximas do topo do ecrã (zona
 * generosa à volta da notch), sai ao teu encontro uma janelinha escura, "Coloca aqui o PDF". Ao largares,
 * a janela principal cresce a partir dela e a janelinha desaparece. Fora dos arrastos não há nenhuma
 * janela à vista nem à escuta. Desliga-se no menu Ver.
 *
 * Para saber que se está a arrastar, consulta o estado do botão do rato com um programa do sistema
 * (rato.mjs); o Electron não o sabe.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizDist = path.join(aqui, '..', 'dist');
/** Em desenvolvimento, aponta para o servidor do Vite: ARTE_FINAL_DEV_URL=http://localhost:5173 */
const urlDev = process.env.ARTE_FINAL_DEV_URL;
const ORIGEM = 'arte://app';
const URL_APP = urlDev ?? `${ORIGEM}/index.html`;
const URL_NOTCH = urlDev ? `${urlDev}/?notch=1` : `${ORIGEM}/index.html?notch=1`;

protocol.registerSchemesAsPrivileged([{ scheme: 'arte', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

/** Janela principal (a app) */
let janela = null;
/** Janela da pílula */
let notch = null;
/** PDF pedido antes de a janela estar pronta */
let pendente = null;
let aSair = false;
let modoNotch = true;
let animacao = null;
/** Detetor do gesto "aproximar um ficheiro da notch" e o que lhe dá o estado do botão */
let detetor = null;
let monitorRato = null;
let temporizadorDeteccao = null;
let temporizadorEsconder = null;
/** Para o diagnóstico: o que o programa do sistema escreveu e quantas vezes a janelinha se mostrou */
let linhasRato = [];
const contadores = { mostrar: 0 };
/** Mostrar a dica de arranque (só nos primeiros arranques, e se a app não abriu já com um ficheiro) */
let mostrarDica = false;
let dicasVistas = 0;

// --- preferências

const ficheiroPrefs = () => path.join(app.getPath('userData'), 'preferencias.json');

function lerPrefs() {
  try {
    return sanearPrefs(JSON.parse(readFileSync(ficheiroPrefs(), 'utf8')));
  } catch {
    return sanearPrefs(undefined);
  }
}

function gravarPrefs() {
  try {
    writeFileSync(ficheiroPrefs(), JSON.stringify({ modoNotch, dicasVistas }), 'utf8');
  } catch {
    /* sem disco: a escolha vale só até fechar */
  }
}

// --- ficheiros

async function lerPdf(caminho) {
  const bytes = new Uint8Array(await readFile(caminho));
  if (!pareceUmPdf(bytes)) throw new Error('Não parece um PDF.');
  return { nome: path.basename(caminho), caminho, bytes };
}

/** Entrega um PDF (já lido) à janela principal, ou guarda-o até ela estar pronta */
function entregar(ficheiro) {
  if (janela && !janela.webContents.isLoading() && !pendente) janela.webContents.send('arte:abrir-ficheiro', ficheiro);
  else pendente = ficheiro;
}

async function abrirNaJanela(caminho) {
  let ficheiro;
  try {
    ficheiro = await lerPdf(caminho);
  } catch (e) {
    dialog.showErrorBox('Não consegui abrir o ficheiro', `${caminho}\n\n${e.message}`);
    return;
  }
  entregar(ficheiro);
  mostrarJanela();
}

/** Só a nossa página fala com o processo principal */
function deConfianca(evento) {
  const url = evento.senderFrame?.url ?? '';
  return url.startsWith(`${ORIGEM}/`) || (urlDev && url.startsWith(urlDev));
}
const daPilula = (evento) => !!notch && evento.sender === notch.webContents && deConfianca(evento);
const daJanela = (evento) => !!janela && evento.sender === janela.webContents && deConfianca(evento);

// --- ecrã e animação

const ecraDaPilula = () => screen.getPrimaryDisplay();
// ARTE_FINAL_SIMULAR_NOTCH=1 desenha a pílula como se houvesse notch física (para ver o aspeto num ecrã sem ela)
const pilulaTemNotch = () => process.env.ARTE_FINAL_SIMULAR_NOTCH === '1' || temNotchNoMac(process.platform, ecraDaPilula().bounds, ecraDaPilula().workArea);
const retanguloDaPilula = (estado = 'aberto') => boundsNotch(ecraDaPilula().bounds, pilulaTemNotch(), estado);

function animar(de, para, { aoFim, duracao = 300, opacidade = [0, 1] } = {}) {
  if (animacao) clearInterval(animacao);
  const inicio = Date.now();
  const passo = () => {
    if (!janela) {
      clearInterval(animacao);
      animacao = null;
      return;
    }
    const t = Math.min(1, (Date.now() - inicio) / duracao);
    try {
      janela.setBounds(interpolar(de, para, suave(t)));
      // a aparecer: invisível enquanto é minúscula; a desaparecer: esvai-se na segunda metade
      janela.setOpacity(opacidade[0] === 0 ? opacidadeDaAnimacao(t) : 1 - Math.max(0, (t - 0.45) / 0.55));
    } catch {
      /* alguns sistemas não deixam mudar a opacidade */
    }
    if (t >= 1) {
      clearInterval(animacao);
      animacao = null;
      aoFim?.();
    }
  };
  passo();
  animacao = setInterval(passo, 16);
}

/** A janela principal nasce da pílula (ou só aparece, sem modo notch) */
function mostrarJanela() {
  if (!janela) return;
  if (!modoNotch || !notch) {
    if (janela.isMinimized()) janela.restore();
    janela.show();
    janela.focus();
    return;
  }
  if (janela.isVisible() && !animacao) {
    if (janela.isMinimized()) janela.restore();
    janela.focus();
    return;
  }
  const final = boundsFinal(ecraDaPilula().workArea);
  const de = retanguloDaPilula('estado');
  janela.setMinimumSize(0, 0);
  janela.setBounds(de);
  try {
    janela.setOpacity(0);
  } catch {
    /* sem opacidade: aparece de repente */
  }
  janela.show();
  animar(de, final, {
    aoFim: () => {
      try {
        janela?.setOpacity(1);
      } catch {
        /* nada */
      }
      janela?.setMinimumSize(960, 600);
      janela?.focus();
    },
  });
}

/** A janela principal encolhe de volta para a pílula e esconde-se */
function recolherJanela() {
  if (!janela || !janela.isVisible()) return;
  if (!modoNotch || !notch) {
    janela.close();
    return;
  }
  const de = janela.getBounds();
  const para = retanguloDaPilula('estado');
  janela.setMinimumSize(0, 0);
  animar(de, para, {
    duracao: 240,
    opacidade: [1, 0],
    aoFim: () => {
      janela?.hide();
      try {
        janela?.setOpacity(1);
      } catch {
        /* nada */
      }
      janela?.setBounds(boundsFinal(ecraDaPilula().workArea));
      janela?.setMinimumSize(960, 600);
    },
  });
}

// --- janelas

function criarPilula() {
  if (notch) return;
  const b = retanguloDaPilula('aberto');
  notch = new BrowserWindow({
    ...b,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    // escondida: só existe à vista enquanto se arrasta um ficheiro para o topo do ecrã
    show: false,
    backgroundColor: '#00000000',
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    title: 'Arte Final',
    webPreferences: { preload: path.join(aqui, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // acima da barra de menus (é onde a notch está) e em todos os espaços, também em ecrã inteiro
  notch.setAlwaysOnTop(true, 'screen-saver');
  notch.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  notch.on('closed', () => (notch = null));
  notch.webContents.on('will-navigate', (e) => e.preventDefault());
  notch.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  notch.loadURL(URL_NOTCH);
}

/** A janelinha sai ao encontro do ficheiro: posiciona-se, mostra-se sem roubar o foco e a página anima a entrada */
function mostrarZona(estado = 'aberto') {
  if (!notch) return;
  clearTimeout(temporizadorEsconder);
  notch.setBounds(retanguloDaPilula(estado));
  notch.showInactive();
  notch.webContents.send('notch:mostrar', estado);
}

/** Esconde-a depois de a página fazer a animação de saída */
function esconderZona() {
  if (!notch || !notch.isVisible()) return;
  notch.webContents.send('notch:esconder');
  clearTimeout(temporizadorEsconder);
  temporizadorEsconder = setTimeout(() => notch?.hide(), 200);
}

// --- deteção do gesto

const emDiagnostico = process.env.ARTE_FINAL_DIAGNOSTICO === '1';
const emTeste = process.env.ARTE_FINAL_TESTE === '1';

/** Desliga o modo notch sem gravar a escolha (o utilizador não pediu): por falha ou falta de suporte */
function desligarPorFalha(motivo) {
  if (!modoNotch) return;
  pararDeteccao();
  modoNotch = false;
  notch?.close();
  notch = null;
  if (janela) {
    janela.setBounds(boundsFinal(ecraDaPilula().workArea));
    janela.setMinimumSize(960, 600);
    janela.show();
  }
  janela?.webContents.send('arte:modo-notch', false);
  menu();
  if (motivo) dialog.showMessageBox({ type: 'warning', message: 'O modo notch ficou desligado.', detail: `${motivo}\n\nA app continua a funcionar como uma janela normal. Se quiseres ajuda, corre-a com ARTE_FINAL_DIAGNOSTICO=1 e envia o que aparecer no terminal.` });
}

function iniciarDeteccao() {
  pararDeteccao();
  detetor = criarDetetor({ zona: () => zonaDeAproximacao(ecraDaPilula().bounds) });
  if (emTeste) {
    // nos testes é o teste que manda no cursor e no botão: globalThis.__arteRato = { x, y, botao }
    globalThis.__arteRato = { x: 0, y: 600, botao: false };
  } else {
    monitorRato = iniciarMonitorDoRato({
      aoProblema: (m) => desligarPorFalha(`Não consegui saber quando estás a arrastar um ficheiro: ${m}.`),
      aoLinha: (l) => {
        linhasRato = [...linhasRato.slice(-11), l.trim()];
        if (emDiagnostico) console.log('[rato]', l.trim());
      },
    });
    if (!monitorRato) return desligarPorFalha(process.platform === 'linux' ? '' : 'Este sistema não suporta o modo notch.');
  }
  let ultimo = '';
  temporizadorDeteccao = setInterval(() => {
    const t = emTeste ? globalThis.__arteRato : null;
    const ponto = t ? { x: t.x, y: t.y } : screen.getCursorScreenPoint();
    const botao = t ? !!t.botao : monitorRato?.botao() ?? false;
    const ev = detetor.atualizar(ponto, botao, Date.now());
    if (emDiagnostico) {
      const s = `${Math.round(ponto.x)},${Math.round(ponto.y)} botão=${botao ? 1 : 0} estado=${detetor.estado()}${ev ? ' → ' + ev : ''}`;
      if (s !== ultimo) console.log('[notch]', s);
      ultimo = s;
    }
    if (ev === 'mostrar') {
      contadores.mostrar++;
      mostrarZona('aberto');
    }
    else if (ev === 'esconder') esconderZona();
  }, 50);
}

/** Observa 10 s enquanto o utilizador arrasta um ficheiro para o topo e diz o que viu: serve para perceber onde falha */
async function diagnosticoNotch() {
  const ecra = ecraDaPilula().bounds;
  const zona = zonaDeAproximacao(ecra);
  if (!modoNotch || !detetor) {
    await dialog.showMessageBox({ type: 'info', message: 'O modo notch está desligado.', detail: 'Liga-o em Ver → Modo notch e volta a abrir o diagnóstico.' });
    return;
  }
  const pai = janela?.isVisible() ? janela : undefined;
  await dialog.showMessageBox(pai, {
    type: 'info',
    message: 'Diagnóstico do modo notch',
    detail: 'Vou observar durante 10 segundos a partir do momento em que carregares em OK. Pega num ficheiro (um PDF, por exemplo) e arrasta-o devagar para o topo do ecrã, perto da notch, como farias normalmente. Podes largá-lo ou desistir.',
    buttons: ['OK'],
  });
  const antes = contadores.mostrar;
  const amostras = [];
  await new Promise((resolve) => {
    const t0 = Date.now();
    const id = setInterval(() => {
      const t = emTeste ? globalThis.__arteRato : null;
      const ponto = t ? { x: t.x, y: t.y } : screen.getCursorScreenPoint();
      const botao = t ? !!t.botao : monitorRato?.botao() ?? false;
      amostras.push({ ...ponto, botao, naZona: dentro(ponto, zona) });
      if (Date.now() - t0 >= 10000) {
        clearInterval(id);
        resolve();
      }
    }, 100);
  });
  const n = amostras.length;
  const contar = (f) => amostras.filter(f).length;
  const comBotao = contar((a) => a.botao);
  const naZona = contar((a) => a.naZona);
  const ambos = contar((a) => a.botao && a.naZona);
  const xs = amostras.map((a) => a.x);
  const ys = amostras.map((a) => a.y);
  const vezes = contadores.mostrar - antes;
  const pronto = monitorRato?.pronto?.() ?? emTeste;
  const conclusao = !pronto
    ? 'PROBLEMA: o programa do sistema que lê o botão do rato não está a responder.'
    : comBotao === 0
      ? 'PROBLEMA: o botão do rato nunca foi visto como carregado, mesmo com o arrasto. É o programa do sistema que não o está a ver.'
      : naZona === 0
        ? 'PROBLEMA: o cursor nunca entrou na zona de aproximação (ver os números da zona e por onde o cursor andou).'
        : ambos === 0
          ? 'PROBLEMA: o cursor entrou na zona e o botão foi visto carregado, mas nunca ao mesmo tempo.'
          : vezes === 0
            ? 'O botão e o cursor coincidiram na zona, mas o detetor não abriu a janelinha (pode ser tempo a menos na zona, ou clique sem arrasto).'
            : `Funcionou: a janelinha foi pedida ${vezes} vez(es). Se não a viste, o problema é a janela não aparecer (nível da janela sobre a barra de menus).`;
  const texto = [
    conclusao,
    '',
    `Sistema: ${process.platform} · Electron ${process.versions.electron} · notch física detetada: ${pilulaTemNotch() ? 'sim' : 'não'}`,
    `Ecrã: ${ecra.width}×${ecra.height} em (${ecra.x}, ${ecra.y}) · zona de aproximação: x ${zona.x}–${zona.x + zona.width}, y ${zona.y}–${zona.y + zona.height}`,
    `Programa do sistema: ${pronto ? 'a postos' : 'sem resposta'}${linhasRato.length ? ` (últimas linhas: ${linhasRato.slice(-4).join(' | ')})` : ''}`,
    `Amostras: ${n} · botão carregado: ${comBotao} · cursor na zona: ${naZona} · as duas coisas: ${ambos}`,
    n ? `Cursor andou entre x ${Math.round(Math.min(...xs))}–${Math.round(Math.max(...xs))} e y ${Math.round(Math.min(...ys))}–${Math.round(Math.max(...ys))}` : '',
    `Janelinha mostrada: ${vezes} vez(es)`,
  ]
    .filter((l, i) => l !== '' || i === 1)
    .join('\n');
  clipboard.writeText(texto);
  await dialog.showMessageBox(pai, { type: comBotao && naZona && ambos ? 'info' : 'warning', message: 'Diagnóstico concluído (já está copiado: cola-o na conversa)', detail: texto });
}

function pararDeteccao() {
  clearInterval(temporizadorDeteccao);
  temporizadorDeteccao = null;
  monitorRato?.parar();
  monitorRato = null;
  detetor = null;
}

function criarJanela() {
  janela = new BrowserWindow({
    ...boundsFinal(ecraDaPilula().workArea),
    minWidth: 960,
    minHeight: 600,
    title: 'Arte Final',
    backgroundColor: '#08090d',
    show: !modoNotch,
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
  // Fechar não sai da app quando há pílula: recolhe para lá
  janela.on('close', (e) => {
    if (modoNotch && notch && !aSair) {
      e.preventDefault();
      recolherJanela();
    }
  });
  janela.on('closed', () => (janela = null));
  janela.loadURL(URL_APP);
}

function ligarModoNotch(ligado) {
  modoNotch = ligado;
  gravarPrefs();
  if (ligado) {
    criarPilula();
    iniciarDeteccao();
  } else {
    pararDeteccao();
    notch?.close();
    notch = null;
    if (janela) {
      janela.setBounds(boundsFinal(ecraDaPilula().workArea));
      janela.setMinimumSize(960, 600);
      try {
        janela.setOpacity(1);
      } catch {
        /* nada */
      }
      janela.show();
    } else criarJanela();
  }
  janela?.webContents.send('arte:modo-notch', ligado);
  menu();
}

// --- IPC

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

  // --- janela principal ⇄ zona de largar
  ipcMain.handle('arte:modo-notch', (evento) => (deConfianca(evento) ? modoNotch && !!notch : false));
  ipcMain.on('arte:recolher', (evento) => daJanela(evento) && recolherJanela());
  // --- pílula
  ipcMain.handle('notch:info', (evento) => (daPilula(evento) ? { temNotch: pilulaTemNotch() } : null));
  ipcMain.handle('notch:soltar', async (evento, caminho) => {
    if (!daPilula(evento) || typeof caminho !== 'string' || !caminho.toLowerCase().endsWith('.pdf')) return false;
    await abrirNaJanela(caminho);
    detetor?.terminar(Date.now());
    esconderZona();
    return true;
  });
  ipcMain.handle('notch:soltar-bytes', (evento, nome, bytes) => {
    // arrastado de um sítio sem caminho no disco (ex.: do browser): vem em bytes
    if (!daPilula(evento) || typeof nome !== 'string' || !pareceUmPdf(bytes)) return false;
    entregar({ nome: path.basename(nome), caminho: '', bytes });
    mostrarJanela();
    detetor?.terminar(Date.now());
    esconderZona();
    return true;
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
            const r = await dialog.showOpenDialog(janela ?? undefined, { title: 'Abrir PDF', properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] });
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
        { label: 'Modo notch', type: 'checkbox', checked: modoNotch, click: (item) => ligarModoNotch(item.checked) },
        { label: 'Diagnóstico do modo notch…', click: () => diagnosticoNotch() },
        { type: 'separator' },
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

const sozinha = app.requestSingleInstanceLock();
if (!sozinha) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const pdfs = pdfsDosArgumentos(argv, app.isPackaged);
    if (pdfs[0]) abrirNaJanela(pdfs[0]);
    else mostrarJanela();
  });

  // macOS: duplo clique num PDF
  let caminhoMac = null;
  app.on('open-file', (e, caminho) => {
    e.preventDefault();
    if (app.isReady()) abrirNaJanela(caminho);
    else caminhoMac = caminho;
  });

  app.on('before-quit', () => {
    aSair = true;
    pararDeteccao();
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

    // ARTE_FINAL_NOTCH=0|1 manda sobre a preferência (para testes), sem a gravar
    const forcado = process.env.ARTE_FINAL_NOTCH;
    modoNotch = forcado === '0' ? false : forcado === '1' ? true : lerPrefs().modoNotch;

    registarIpc();
    menu();
    const inicial = caminhoMac ?? pdfsDosArgumentos(process.argv, app.isPackaged)[0];
    const prefs = lerPrefs();
    dicasVistas = prefs.dicasVistas;
    mostrarDica = modoNotch && !inicial && dicasVistas < MAX_DICAS;
    if (mostrarDica) {
      dicasVistas++;
      gravarPrefs();
    }
    criarJanela();
    if (modoNotch) {
      criarPilula();
      iniciarDeteccao();
      // nos primeiros arranques a janelinha mostra-se uns segundos, para se saber que existe
      if (mostrarDica && modoNotch) {
        notch?.webContents.once('did-finish-load', () => {
          if (!modoNotch) return;
          mostrarZona('dica');
          setTimeout(() => detetor?.estado() === 'inativo' && esconderZona(), 4800);
        });
      }
    }
    if (inicial) await abrirNaJanela(inicial);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (!janela) criarJanela();
    mostrarJanela();
  });
}
