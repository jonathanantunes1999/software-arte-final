import { describe, expect, it } from 'vitest';
import { descreverConteudoQr, medirLados, type Cantos } from '../../src/analise/qr';
import { encontrarCandidatos, lerQrsDaPagina, lerQrsDeImagem } from '../../src/analise/qr-leitura';
import { desenharQrEmImagem, imagemBranca, matrizQr } from '../fixtures/qr';

describe('descreverConteudoQr', () => {
  it('endereços web', () => {
    expect(descreverConteudoQr('https://blankstudios.pt/menu')).toBe('Liga a https://blankstudios.pt/menu');
    expect(descreverConteudoQr('HTTP://exemplo.pt')).toBe('Liga a HTTP://exemplo.pt');
    expect(descreverConteudoQr('www.exemplo.pt/x')).toBe('Liga a www.exemplo.pt/x');
  });

  it('email, telefone, SMS, localização e contacto', () => {
    expect(descreverConteudoQr('mailto:geral@exemplo.pt?subject=Ola')).toBe('Email para geral@exemplo.pt');
    expect(descreverConteudoQr('tel:+351912345678')).toBe('Telefone +351912345678');
    expect(descreverConteudoQr('SMSTO:912345678:Ola')).toBe('SMS para 912345678');
    expect(descreverConteudoQr('geo:38.72,-9.14')).toBe('Localização 38.72,-9.14');
    expect(descreverConteudoQr('BEGIN:VCARD\nVERSION:3.0\nEND:VCARD')).toBe('Cartão de contacto');
  });

  it('Wi-Fi: diz o nome da rede e nunca a palavra-passe', () => {
    const d = descreverConteudoQr('WIFI:T:WPA;S:CafeCentral;P:segredo123;;');
    expect(d).toBe('Rede Wi-Fi "CafeCentral"');
    expect(d).not.toContain('segredo');
  });

  it('texto simples e vazio', () => {
    expect(descreverConteudoQr('Olá mundo')).toBe('Texto: "Olá mundo"');
    expect(descreverConteudoQr('   ')).toBe('QR code vazio');
  });

  it('corta endereços muito compridos', () => {
    const d = descreverConteudoQr('https://exemplo.pt/' + 'a'.repeat(200));
    expect(d.length).toBeLessThan(100);
    expect(d.endsWith('…')).toBe(true);
  });
});

describe('medirLados', () => {
  const quadrado = (x: number, y: number, l: number): Cantos => [
    { x, y },
    { x: x + l, y },
    { x: x + l, y: y + l },
    { x, y: y + l },
  ];

  it('quadrado alinhado', () => {
    const r = medirLados(quadrado(10, 10, 100), 4);
    expect(r.larguraMm).toBeCloseTo(25, 6);
    expect(r.alturaMm).toBeCloseTo(25, 6);
  });

  it('quadrado rodado 30°: o lado é o mesmo', () => {
    const a = Math.PI / 6;
    const rot = (p: { x: number; y: number }) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
    const c = quadrado(0, 0, 80).map(rot) as Cantos;
    const r = medirLados(c, 4);
    expect(r.larguraMm).toBeCloseTo(20, 6);
    expect(r.alturaMm).toBeCloseTo(20, 6);
  });
});

describe('lerQrsDeImagem', () => {
  const W = 800;
  const H = 600;

  it('lê um QR code e o seu conteúdo', () => {
    const d = imagemBranca(W, H);
    desenharQrEmImagem(d, W, 'https://blankstudios.pt/menu', 100, 100, 6);
    const r = lerQrsDeImagem(d, W, H);
    expect(r).toHaveLength(1);
    expect(r[0].texto).toBe('https://blankstudios.pt/menu');
  });

  it('o tamanho medido bate com o desenhado', () => {
    const d = imagemBranca(W, H);
    const lado = desenharQrEmImagem(d, W, 'https://blankstudios.pt/menu', 100, 100, 6);
    const [q] = lerQrsDeImagem(d, W, H);
    const { larguraMm, alturaMm } = medirLados(q.cantos, 1); // pxPorMm = 1: o resultado é em pixels
    expect(larguraMm).toBeGreaterThan(lado * 0.93);
    expect(larguraMm).toBeLessThan(lado * 1.07);
    expect(alturaMm).toBeGreaterThan(lado * 0.93);
    expect(alturaMm).toBeLessThan(lado * 1.07);
  });

  it('o local aponta para onde o QR code está', () => {
    const d = imagemBranca(W, H);
    const lado = desenharQrEmImagem(d, W, 'olá', 300, 200, 6);
    const [q] = lerQrsDeImagem(d, W, H);
    const xs = q.cantos.map((p) => p.x);
    // o símbolo começa depois da zona de silêncio (4 módulos)
    expect(Math.min(...xs)).toBeGreaterThan(300 + 3 * 6);
    expect(Math.max(...xs)).toBeLessThan(300 + lado + 5 * 6);
  });

  it('QR code invertido (branco sobre preto)', () => {
    const d = imagemBranca(W, H);
    desenharQrEmImagem(d, W, 'https://invertido.pt', 100, 100, 6, true);
    expect(lerQrsDeImagem(d, W, H).map((q) => q.texto)).toEqual(['https://invertido.pt']);
  });

  it('página sem QR codes', () => {
    expect(lerQrsDeImagem(imagemBranca(W, H), W, H)).toEqual([]);
  });

  it('ruído e texto não são QR codes', () => {
    const d = imagemBranca(W, H);
    let s = 7;
    for (let i = 0; i < W * H; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const v = s % 7 === 0 ? 0 : 255;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    }
    expect(lerQrsDeImagem(d, W, H)).toEqual([]);
  });

  it('o gerador de testes dá matrizes quadradas e com o padrão dos cantos', () => {
    const m = matrizQr('abc');
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((l) => l.length === m.length)).toBe(true);
    expect(m[0][0]).toBe(true); // canto do padrão de localização
  });
});

describe('lerQrsDaPagina — página inteira, com candidatos', () => {
  // A4 a 200 dpi
  const W = 1654;
  const H = 2339;
  const PX_MM = 200 / 25.4;
  const mmParaPx = (mm: number) => Math.round(mm * PX_MM);

  /** desenha um QR code com o símbolo a medir aproximadamente `tamanhoMm` e devolve o lado real em mm */
  function qr(d: Uint8ClampedArray, texto: string, xMm: number, yMm: number, tamanhoMm: number, invertido = false): number {
    const n = matrizQr(texto).length;
    const modulo = Math.max(2, Math.round((tamanhoMm * PX_MM) / n));
    const lado = desenharQrEmImagem(d, W, texto, mmParaPx(xMm), mmParaPx(yMm), modulo, invertido);
    return lado / PX_MM;
  }

  it('vários QR codes na mesma página, todos lidos', () => {
    const d = imagemBranca(W, H);
    qr(d, 'https://um.pt', 20, 20, 25);
    qr(d, 'https://dois.pt', 120, 30, 20);
    qr(d, 'tel:+351912345678', 40, 200, 30);
    qr(d, 'https://quatro.pt/menu', 130, 220, 15);
    const textos = lerQrsDaPagina(d, W, H, PX_MM).map((q) => q.texto).sort();
    expect(textos).toEqual(['https://dois.pt', 'https://quatro.pt/menu', 'https://um.pt', 'tel:+351912345678']);
  });

  it('QR codes pequenos (12 mm) também se leem, a 200 dpi', () => {
    const d = imagemBranca(W, H);
    qr(d, 'https://x.pt', 100, 100, 12);
    expect(lerQrsDaPagina(d, W, H, PX_MM).map((q) => q.texto)).toEqual(['https://x.pt']);
  });

  it('o tamanho medido dá para saber se é pequeno demais', () => {
    const d = imagemBranca(W, H);
    const real = qr(d, 'https://pequeno.pt', 60, 60, 14);
    const [q] = lerQrsDaPagina(d, W, H, PX_MM);
    const { larguraMm } = medirLados(q.cantos, PX_MM);
    // o que se mede é o símbolo, sem a zona de silêncio: fica ao pé do tamanho desenhado
    expect(larguraMm).toBeGreaterThan(real * 0.9);
    expect(larguraMm).toBeLessThan(real * 1.1);
  });

  it('QR code invertido (com o seu fundo escuro)', () => {
    const d = imagemBranca(W, H);
    qr(d, 'https://invertido.pt', 50, 50, 25, true);
    expect(lerQrsDaPagina(d, W, H, PX_MM).map((q) => q.texto)).toEqual(['https://invertido.pt']);
  });

  it('o QR code não se perde no meio de texto e de manchas escuras', () => {
    const d = imagemBranca(W, H);
    // linhas de "texto"
    for (let y = mmParaPx(120); y < mmParaPx(180); y += 22) for (let yy = 0; yy < 9; yy++) for (let x = mmParaPx(15); x < mmParaPx(190); x++) if ((x * 7 + y) % 13 < 9) { const i = ((y + yy) * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
    // um retângulo preto (fotografia escura)
    for (let y = mmParaPx(190); y < mmParaPx(260); y++) for (let x = mmParaPx(15); x < mmParaPx(100); x++) { const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
    qr(d, 'https://no-meio.pt', 130, 200, 25);
    expect(lerQrsDaPagina(d, W, H, PX_MM).map((q) => q.texto)).toEqual(['https://no-meio.pt']);
  });

  it('página sem QR codes: nada, e depressa', () => {
    const d = imagemBranca(W, H);
    for (let y = mmParaPx(30); y < mmParaPx(250); y += 22) for (let yy = 0; yy < 9; yy++) for (let x = mmParaPx(15); x < mmParaPx(190); x++) if ((x * 7 + y) % 13 < 9) { const i = ((y + yy) * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
    const t = performance.now();
    expect(lerQrsDaPagina(d, W, H, PX_MM)).toEqual([]);
    expect(performance.now() - t).toBeLessThan(1500);
  });

  it('um quadrado preto cheio não é candidato (não tem textura de QR)... mas até pode ser, e não dá nada', () => {
    const d = imagemBranca(W, H);
    for (let y = mmParaPx(50); y < mmParaPx(80); y++) for (let x = mmParaPx(50); x < mmParaPx(80); x++) { const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
    expect(lerQrsDaPagina(d, W, H, PX_MM)).toEqual([]);
  });

  it('candidatos: ignora manchas compridas e demasiado pequenas ou grandes', () => {
    const d = imagemBranca(W, H);
    // faixa comprida e fina (um título): 150 × 6 mm
    for (let y = mmParaPx(20); y < mmParaPx(26); y++) for (let x = mmParaPx(20); x < mmParaPx(170); x++) { const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
    // quadradinho de 3 mm
    for (let y = mmParaPx(100); y < mmParaPx(103); y++) for (let x = mmParaPx(100); x < mmParaPx(103); x++) { const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
    expect(encontrarCandidatos(d, W, H, PX_MM)).toEqual([]);
  });

  it('candidatos: uma mancha com textura de QR mas comprida (60 × 20 mm) não é candidata', () => {
    const d = imagemBranca(W, H);
    for (let y = mmParaPx(100); y < mmParaPx(120); y++) {
      for (let x = mmParaPx(40); x < mmParaPx(100); x++) {
        if (((x >> 2) + (y >> 2)) % 2 === 0) { const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
      }
    }
    expect(encontrarCandidatos(d, W, H, PX_MM)).toEqual([]);
  });

  it('candidatos: a mesma textura num quadrado de 20 mm é candidata', () => {
    const d = imagemBranca(W, H);
    for (let y = mmParaPx(100); y < mmParaPx(120); y++) {
      for (let x = mmParaPx(40); x < mmParaPx(60); x++) {
        if (((x >> 2) + (y >> 2)) % 2 === 0) { const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
      }
    }
    expect(encontrarCandidatos(d, W, H, PX_MM)).toHaveLength(1);
  });

  it('candidatos: uma moldura quadrada oca (30 × 30 mm) não é candidata: está vazia por dentro', () => {
    const d = imagemBranca(W, H);
    const a = mmParaPx(60);
    const b = mmParaPx(90);
    for (let y = a; y < b; y++) {
      for (let x = a; x < b; x++) {
        if (x < a + 2 || x >= b - 2 || y < a + 2 || y >= b - 2) { const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
      }
    }
    expect(encontrarCandidatos(d, W, H, PX_MM)).toEqual([]);
  });

  it('candidatos: um QR code dá um candidato quadrado à sua volta', () => {
    const d = imagemBranca(W, H);
    qr(d, 'https://x.pt', 60, 80, 25);
    const c = encontrarCandidatos(d, W, H, PX_MM);
    expect(c).toHaveLength(1);
    const largura = (c[0].x1 - c[0].x0) / PX_MM;
    expect(largura).toBeGreaterThan(20);
    expect(largura).toBeLessThan(40);
  });
});
