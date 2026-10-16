import { PDFDocument, PDFName, StandardFonts, cmyk, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState, rgb, setGraphicsState } from 'pdf-lib';

/**
 * PDF de demonstração, gerado aqui (nada para descarregar): um cartaz de 100 × 150 mm com problemas
 * de propósito, para quem abre a app pela primeira vez ver os alertas, os marcadores e o botão
 * "Corrigir" a funcionar sem ter um ficheiro à mão.
 *
 * Problemas postos de propósito: arte a tocar no corte sem sangria, cores e imagem em RGB, imagem de
 * baixa resolução, fonte não incorporada, texto pequeno em preto de quatro cores, linha demasiado
 * fina e um branco em overprint.
 */
export async function gerarExemplo(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Exemplo — cartaz com problemas');
  const ctx = pdf.context;
  const pt = (mm: number) => (mm * 72) / 25.4;
  const W = pt(100);
  const H = pt(150);
  const pagina = pdf.addPage([W, H]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);

  // fundo azul em RGB até ao limite da página, sem sangria
  pagina.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.04, 0.16, 0.52) });
  // faixa coral em RGB
  pagina.drawRectangle({ x: 0, y: H - pt(48), width: W, height: pt(30), color: rgb(1, 0.36, 0.45) });
  pagina.drawText('FESTA DE VERÃO', { x: pt(8), y: H - pt(36), size: 21, font: bold, color: rgb(1, 1, 1) });
  pagina.drawText('Sábado, 20 de junho · 21h', { x: pt(8), y: H - pt(58), size: 13, font: normal, color: rgb(0.85, 0.93, 1) });

  // imagem pequena esticada (resolução baixa), em RGB
  const px = 24;
  const dados = new Uint8Array(px * px * 3);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const i = 3 * (y * px + x);
    dados[i] = 255 - Math.round((x / px) * 200);
    dados[i + 1] = 90 + Math.round((y / px) * 140);
    dados[i + 2] = 120 + Math.round(((x + y) / (2 * px)) * 130);
  }
  const imagem = ctx.register(ctx.stream(dados, { Type: 'XObject', Subtype: 'Image', Width: px, Height: px, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 } as never));
  pagina.node.setXObject(PDFName.of('ImExemplo'), imagem);
  pagina.pushOperators(pushGraphicsState(), concatTransformationMatrix(pt(40), 0, 0, pt(40), pt(8), pt(46)), drawObject('ImExemplo'), popGraphicsState());

  // caixa branca em overprint (desaparece na impressão)
  pagina.node.setExtGState(PDFName.of('GsBranco'), ctx.obj({ Type: 'ExtGState', OP: true, op: true, OPM: 1 }));
  pagina.pushOperators(pushGraphicsState(), setGraphicsState(PDFName.of('GsBranco')));
  pagina.drawRectangle({ x: pt(52), y: pt(46), width: pt(40), height: pt(36), color: cmyk(0, 0, 0, 0) });
  pagina.pushOperators(popGraphicsState());

  // texto pequeno em preto de quatro cores, sobre a caixa e sobre o azul
  pagina.drawText('Entrada livre. Traz um amigo.', { x: pt(54), y: pt(74), size: 7.5, font: normal, color: cmyk(0.6, 0.5, 0.5, 1) });
  pagina.drawText('Mais informações no balcão.', { x: pt(8), y: pt(14), size: 7.5, font: normal, color: cmyk(0.6, 0.5, 0.5, 1) });

  // linha fina demais
  pagina.drawLine({ start: { x: pt(8), y: pt(38) }, end: { x: pt(92), y: pt(38) }, thickness: 0.1, color: cmyk(0, 0, 0, 1) });

  return pdf.save();
}
