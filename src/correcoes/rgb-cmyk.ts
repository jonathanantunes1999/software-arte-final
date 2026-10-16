import { PDFArray, PDFHexString, PDFName, PDFNumber, PDFRef, PDFStream, type PDFDocument, type PDFObject } from 'pdf-lib';
import { resolverEspaco } from '../analise/cores';
import { Leitor } from '../analise/leitor';
import { converterPixeisRgb, rgbParaCmykBytes } from '../cores/conversao';
import { amostrasBrutas, desempacotar, ehIndexado, lerPaleta, MAX_PIXEIS_ABSOLUTO } from '../separacoes/imagens';

/**
 * Imagens RGB → CMYK, no próprio ficheiro. Cada imagem RGB (DeviceRGB, CalRGB ou ICC de 3 canais)
 * passa a DeviceCMYK de 8 bits, comprimida com Flate. Nas Indexed só se converte a paleta, o que é
 * barato e não mexe nos pixeis. Máscaras (SMask, Mask em stream) ficam como estão.
 *
 * Não há perfis ICC: ver cores/conversao.ts. Uma JPEG RGB passa a ser Flate CMYK, por isso o ficheiro
 * cresce (não há codificador JPEG CMYK aqui).
 */

export interface ResumoImagensRgb {
  convertidas: number;
  /** Das convertidas, quantas eram Indexed (só a paleta mudou) */
  indexadas: number;
  /** O que ficou como estava, agrupado por motivo */
  saltadas: { motivo: string; n: number }[];
}

const CHAVES_DE_FORA = new Set(['Filter', 'DecodeParms', 'DP', 'F', 'ColorSpace', 'Length', 'Decode', 'BitsPerComponent', 'DL', 'ColorTransform']);

function copiarDicionario(stream: PDFStream): Record<string, PDFObject> {
  const r: Record<string, PDFObject> = {};
  for (const [k, v] of stream.dict.entries()) {
    const nome = k.decodeText();
    if (!CHAVES_DE_FORA.has(nome)) r[nome] = v;
  }
  return r;
}

/** Só imagens com amostras de 8 bits e sem filtros que não saibamos ler; devolve o motivo se não se pode */
export function converterImagensRgb(pdf: PDFDocument, tintaMax = 3): ResumoImagensRgb {
  const ctx = pdf.context;
  const l = new Leitor(ctx);
  const resumo: ResumoImagensRgb = { convertidas: 0, indexadas: 0, saltadas: [] };
  const saltar = (motivo: string) => {
    const e = resumo.saltadas.find((s) => s.motivo === motivo);
    if (e) e.n++;
    else resumo.saltadas.push({ motivo, n: 1 });
  };

  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFStream) || !(ref instanceof PDFRef)) continue;
    if (l.nome(obj.dict.get(PDFName.of('Subtype'))) !== 'Image') continue;
    if (l.bool(l.get(obj.dict, 'ImageMask'))) continue;
    const csRaw = obj.dict.get(PDFName.of('ColorSpace'));
    const cs = l.res(csRaw);
    if (!cs) continue;

    const indexado = ehIndexado(l, cs);
    const espaco = indexado ? resolverEspaco(l, (cs as PDFArray).get(1), undefined) : resolverEspaco(l, cs, undefined);
    if (espaco.familia !== 'RGB') continue; // cinzento, CMYK, spots: não é com esta correção

    if (l.get(obj.dict, 'Mask') instanceof PDFArray) {
      saltar('máscara por cor (os valores deixariam de bater)');
      continue;
    }

    if (indexado) {
      const paleta = lerPaleta(l, cs, undefined);
      if (!paleta) {
        saltar('paleta ilegível');
        continue;
      }
      const hival = paleta.entradas.length - 1;
      const bytes = new Uint8Array(paleta.entradas.length * 4);
      paleta.entradas.forEach((e, i) => {
        bytes.set(rgbParaCmykBytes(e[0], e[1], e[2], tintaMax), 4 * i);
      });
      const novo = ctx.obj([PDFName.of('Indexed'), PDFName.of('DeviceCMYK'), PDFNumber.of(hival), PDFHexString.of(Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''))] as never);
      obj.dict.set(PDFName.of('ColorSpace'), novo);
      resumo.convertidas++;
      resumo.indexadas++;
      continue;
    }

    const largura = l.num(l.get(obj.dict, 'Width')) ?? 0;
    const altura = l.num(l.get(obj.dict, 'Height')) ?? 0;
    if (largura < 1 || altura < 1) continue;
    if (largura * altura > MAX_PIXEIS_ABSOLUTO / 2) {
      saltar('imagem enorme');
      continue;
    }
    const bruto = amostrasBrutas(l, obj, largura, altura, 3);
    if ('erro' in bruto) {
      saltar(bruto.erro);
      continue;
    }
    if (bruto.bits !== 8) {
      saltar(`${bruto.bits} bits por componente`);
      continue;
    }
    const inteiros = desempacotar(bruto.dados, 8, largura, altura, 3);
    if (!inteiros) {
      saltar('dados da imagem incompletos');
      continue;
    }
    let rgb = inteiros as Uint8Array;
    // /Decode que não é o normal (ex.: [1 0 1 0 1 0] inverte): aplica-se antes de converter
    const decode = l.get(obj.dict, 'Decode') ? l.numeros(l.get(obj.dict, 'Decode')) : [];
    if (decode.length >= 6 && decode.some((v, i) => v !== (i % 2 === 0 ? 0 : 1))) {
      const ajustado = new Uint8Array(largura * altura * 3);
      for (let i = 0; i < ajustado.length; i++) {
        const c = i % 3;
        const lo = decode[2 * c];
        const hi = decode[2 * c + 1];
        ajustado[i] = Math.round(Math.min(1, Math.max(0, lo + (rgb[i] / 255) * (hi - lo))) * 255);
      }
      rgb = ajustado;
    }

    const cmyk = converterPixeisRgb(rgb, largura * altura, tintaMax);
    const dict = copiarDicionario(obj);
    dict.ColorSpace = PDFName.of('DeviceCMYK');
    dict.BitsPerComponent = PDFNumber.of(8);
    ctx.assign(ref, ctx.flateStream(cmyk, dict as never));
    resumo.convertidas++;
  }
  return resumo;
}
