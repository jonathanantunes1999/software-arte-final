import { execFile } from 'node:child_process';

/**
 * As medidas verdadeiras da notch.
 *
 * O Electron não as expõe, mas o macOS sabe-as: a `NSScreen` tem `safeAreaInsets.top`
 * (a altura da zona que a notch ocupa) e as `auxiliaryTopLeftArea` / `auxiliaryTopRightArea`,
 * que são as duas faixas da barra de menus de cada lado da notch. A largura é o ecrã menos
 * essas duas. É assim que o Coucou faz (ver NOTAS.md), e é a única maneira de a ilha fechada
 * assentar mesmo na notch em vez de ficar com abas de lado.
 *
 * Chega-se lá com o `osascript` em JavaScript, que o próprio sistema traz. Se falhar — e pode
 * falhar, porque é uma ponte velha e rabugenta — cai-se no 184, que é o valor que o Coucou
 * usa para os MacBook Pro.
 */

const GUIAO = `ObjC.import('AppKit');
function run() {
  var e = $.NSScreen.mainScreen;
  var largura = e.frame.size.width;
  var topo = 0;
  try { topo = e.safeAreaInsets.top; } catch (err) {}
  var esq = 0, dir = 0;
  try { esq = e.auxiliaryTopLeftArea.size.width; } catch (err) {}
  try { dir = e.auxiliaryTopRightArea.size.width; } catch (err) {}
  return [largura, topo, esq, dir].join(' ');
}`;

/** Sem notch: uma pastilha pequena no meio da barra de menus, como o Coucou faz */
export const SEM_NOTCH = { temNotch: false, largura: 80, altura: 24 };
export const LARGURA_OMISSAO = 184;

function perguntarAoSistema() {
  return new Promise((resolve) => {
    const processo = execFile('osascript', ['-l', 'JavaScript', '-e', GUIAO], { timeout: 3000 }, (erro, saida) => {
      if (erro) return resolve(null);
      const n = String(saida).trim().split(/\s+/).map(Number);
      resolve(n.length === 4 && n.every(Number.isFinite) ? n : null);
    });
    processo.on('error', () => resolve(null));
  });
}

/**
 * Devolve `{ temNotch, largura, altura, comoSoube }`. O `comoSoube` serve para o arranque
 * dizer no terminal se mediu mesmo ou se está a adivinhar — sem isso não se percebe porque
 * é que a ilha não assenta.
 */
export async function medirNotch(ecraElectron, forcada) {
  const barraMenus = ecraElectron.workArea.y - ecraElectron.bounds.y;

  if (process.platform !== 'darwin') {
    return { ...SEM_NOTCH, comoSoube: 'não é macOS' };
  }

  const medido = await perguntarAoSistema();

  if (medido) {
    const [largura, topo, esq, dir] = medido;
    if (topo > 0) {
      const entreAsFaixas = largura - esq - dir;
      const boa = entreAsFaixas > 40 && entreAsFaixas < largura / 2;
      return {
        temNotch: true,
        largura: Math.round(forcada ?? (boa ? entreAsFaixas : LARGURA_OMISSAO)),
        altura: Math.round(topo),
        comoSoube: boa ? 'medida no sistema' : 'altura do sistema, largura por omissão',
      };
    }
    if (!forcada) return { ...SEM_NOTCH, comoSoube: 'ecrã sem notch' };
  }

  // O sistema não respondeu: resta a altura da barra de menus, que num Mac com notch é bem maior
  const pareceNotch = barraMenus >= 32;
  if (!pareceNotch && !forcada) return { ...SEM_NOTCH, comoSoube: 'barra de menus baixa, sem notch' };
  return {
    temNotch: true,
    largura: Math.round(forcada ?? LARGURA_OMISSAO),
    altura: Math.round(barraMenus || 37),
    comoSoube: forcada ? 'largura que pediste' : 'adivinhada pela barra de menus',
  };
}
