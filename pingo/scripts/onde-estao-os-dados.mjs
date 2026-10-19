import { homedir } from 'node:os';
import path from 'node:path';

/** Onde o Electron guarda o dados.json, por sistema. node scripts/onde-estao-os-dados.mjs */
const pastas = {
  darwin: path.join(homedir(), 'Library', 'Application Support', 'pingo', 'dados.json'),
  win32: path.join(homedir(), 'AppData', 'Roaming', 'pingo', 'dados.json'),
  linux: path.join(homedir(), '.config', 'pingo', 'dados.json'),
};
console.log(pastas[process.platform] ?? 'sistema não previsto');
