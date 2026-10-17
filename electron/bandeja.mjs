import path from 'node:path';

/**
 * Ícone na barra de menus (macOS) / na área de notificação (Windows e Linux). Aqui só vive o que se pode
 * testar sem Electron: que ícone usar, o que o menu diz e que ficheiros se aceitam ao largar no ícone.
 */

/**
 * macOS: ícone "template" (preto e transparência: o sistema pinta-o de claro ou escuro conforme a barra);
 * o `@2x` vem ao lado e o Electron escolhe-o sozinho. Windows e Linux: o ícone a cores.
 */
export function iconeDaBandeja(plataforma, pasta) {
  const mac = plataforma === 'darwin';
  return { caminho: path.join(pasta, mac ? 'bandeja-Template.png' : 'bandeja-win.png'), modelo: mac };
}

/** Só os PDF (sem distinguir maiúsculas), pela ordem em que vieram */
export function pdfsSoltos(ficheiros) {
  return Array.isArray(ficheiros) ? ficheiros.filter((f) => typeof f === 'string' && f.toLowerCase().endsWith('.pdf')) : [];
}

/**
 * O menu do botão direito. `estado`: { visivel, manterNaBandeja, temJanela }; `acoes`: o que cada item faz.
 * "Abrir" e "Esconder" são o mesmo item, que diz o que o clique vai fazer.
 */
export function modeloDoMenu(estado, acoes) {
  return [
    { label: estado.visivel ? 'Esconder o Arte Final' : 'Abrir o Arte Final', click: acoes.alternar },
    { label: 'Abrir PDF…', click: acoes.abrirPdf },
    { type: 'separator' },
    { label: 'Fechar a janela deixa a app na bandeja', type: 'checkbox', checked: !!estado.manterNaBandeja, click: (item) => acoes.manterNaBandeja(item.checked) },
    { type: 'separator' },
    { label: 'Sair do Arte Final', click: acoes.sair },
  ];
}
