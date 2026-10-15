import { describe, expect, it } from 'vitest';
import { alertasQr } from '../../src/alertas/qr';
import type { ConfigAlertas } from '../../src/alertas/tipos';
import type { QrEncontrado } from '../../src/analise/qr';
import { CFG_BASE } from '../fixtures/analisar';

const qr = (o: Partial<QrEncontrado> & { l?: number; a?: number } = {}): QrEncontrado => ({
  pagina: 0,
  texto: 'https://blankstudios.pt/menu',
  caixa: { x0: 100, y0: 100, x1: 170, y1: 170 },
  larguraMm: o.l ?? 25,
  alturaMm: o.a ?? o.l ?? 25,
  ...o,
});
const alertas = (qrs: QrEncontrado[], cfg: Partial<ConfigAlertas> = {}) => alertasQr(qrs, { ...CFG_BASE, ...cfg });
const ids = (as: { id: string }[]) => as.map((a) => a.id);

describe('alertas de QR codes', () => {
  it('sem QR codes, sem alertas', () => {
    expect(alertas([])).toEqual([]);
  });

  it('um QR code grande: só a informação, com o destino e o tamanho', () => {
    const [a] = alertas([qr()]);
    expect(a.id).toBe('qr-codes');
    expect(a.gravidade).toBe('info');
    expect(a.titulo).toBe('QR code encontrado');
    expect(a.detalhe).toContain('Pág. 1: Liga a https://blankstudios.pt/menu (25,0 × 25,0 mm)');
  });

  it('um QR code pequeno: aviso, e continua na lista dos encontrados', () => {
    const r = alertas([qr({ l: 15 })]);
    expect(ids(r)).toEqual(['qr-pequeno', 'qr-codes']);
    expect(r[0].gravidade).toBe('aviso');
    expect(r[0].titulo).toBe('QR code pequeno demais');
    expect(r[0].detalhe).toContain('Abaixo de 20,0 × 20,0 mm');
    expect(r[0].detalhe).toContain('15,0 × 15,0 mm');
  });

  it('exatamente 20 mm: certo', () => {
    expect(ids(alertas([qr({ l: 20 })]))).toEqual(['qr-codes']);
  });

  it('compara ao valor mostrado: 19,96 mm diz-se 20,0 e não é pequeno; 19,94 diz-se 19,9 e é', () => {
    expect(ids(alertas([qr({ l: 19.96 })]))).toEqual(['qr-codes']);
    expect(ids(alertas([qr({ l: 19.94 })]))).toEqual(['qr-pequeno', 'qr-codes']);
  });

  it('conta o lado mais pequeno', () => {
    expect(ids(alertas([qr({ l: 30, a: 15 })]))).toEqual(['qr-pequeno', 'qr-codes']);
  });

  it('limite configurável', () => {
    expect(ids(alertas([qr({ l: 15 })], { qrTamanhoMinimoMm: 10 }))).toEqual(['qr-codes']);
    expect(alertas([qr({ l: 25 })], { qrTamanhoMinimoMm: 30 })[0].titulo).toBe('QR code pequeno demais');
    expect(alertas([qr({ l: 25 })], { qrTamanhoMinimoMm: 30 })[0].detalhe).toContain('Abaixo de 30,0 × 30,0 mm');
  });

  it('só os pequenos entram no aviso, todos entram na lista', () => {
    const r = alertas([qr({ l: 25, texto: 'https://grande.pt' }), qr({ l: 12, texto: 'https://pequeno.pt', pagina: 1 })]);
    const [pequeno, todos] = r;
    expect(pequeno.detalhe).toContain('pequeno.pt');
    expect(pequeno.detalhe).not.toContain('grande.pt');
    expect(todos.titulo).toBe('2 QR codes encontrados');
    expect(todos.detalhe).toContain('grande.pt');
    expect(todos.detalhe).toContain('pequeno.pt');
  });

  it('plural dos pequenos', () => {
    const r = alertas([qr({ l: 10 }), qr({ l: 12, pagina: 2 })]);
    expect(r[0].titulo).toBe('2 QR codes pequenos demais');
  });

  it('ordena por página', () => {
    const [a] = alertas([qr({ pagina: 3, texto: 'https://tres.pt' }), qr({ pagina: 0, texto: 'https://zero.pt' })]);
    const linhas = a.detalhe!.split('\n').slice(1);
    expect(linhas[0]).toContain('Pág. 1');
    expect(linhas[1]).toContain('Pág. 4');
  });

  it('descreve o que o QR contém, não só links', () => {
    const [a] = alertas([
      qr({ texto: 'mailto:geral@exemplo.pt', pagina: 0 }),
      qr({ texto: 'WIFI:T:WPA;S:Cafe;P:segredo;;', pagina: 1 }),
      qr({ texto: 'tel:+351912345678', pagina: 2 }),
    ]);
    expect(a.detalhe).toContain('Email para geral@exemplo.pt');
    expect(a.detalhe).toContain('Rede Wi-Fi "Cafe"');
    expect(a.detalhe).not.toContain('segredo');
    expect(a.detalhe).toContain('Telefone +351912345678');
  });

  it('um local por QR code, com folga à volta', () => {
    const [a] = alertas([qr()]);
    expect(a.locais).toHaveLength(1);
    expect(a.locais![0].pagina).toBe(0);
    expect(a.locais![0].caixa.x0).toBeLessThan(100);
    expect(a.locais![0].caixa.x1).toBeGreaterThan(170);
  });

  it('muitos QR codes: corta as linhas', () => {
    const muitos = Array.from({ length: 10 }, (_, i) => qr({ pagina: i, texto: `https://n${i}.pt` }));
    const [a] = alertas(muitos);
    expect(a.titulo).toBe('10 QR codes encontrados');
    expect(a.detalhe).toContain('…e mais 4');
    expect(a.locais).toHaveLength(10);
  });
});
