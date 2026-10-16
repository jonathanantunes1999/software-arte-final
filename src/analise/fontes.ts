import type { PDFDict } from 'pdf-lib';
import type { InfoFonte } from './ir';
import type { Leitor } from './leitor';

export interface Fonte extends InfoFonte {
  /** O dicionário da fonte no PDF (para quem precisa de a abrir: conversão em curvas) */
  dict: PDFDict;
  /** Largura do glifo em milésimos de corpo */
  largura(codigo: number): number;
  ascent: number;
  descent: number;
}

const FONTFILES = ['FontFile', 'FontFile2', 'FontFile3'];

function semPrefixo(nome: string): string {
  return nome.replace(/^[A-Z]{6}\+/, '');
}

/** Lê uma fonte do dicionário de recursos. `id` identifica-a de forma estável no documento. */
export function lerFonte(l: Leitor, d: PDFDict, id: string): Fonte {
  const subtype = l.nome(l.get(d, 'Subtype')) ?? '?';
  const composta = subtype === 'Type0';
  const type3 = subtype === 'Type3';

  // Para Type0 o que interessa está na fonte descendente
  const descendente = composta ? l.dict(l.itens(l.get(d, 'DescendantFonts'))[0]) : undefined;
  const base = descendente ?? d;
  const desc = l.dict(l.get(base, 'FontDescriptor'));

  const nomeCompleto = l.nome(l.get(d, 'BaseFont')) ?? l.nome(l.get(base, 'BaseFont')) ?? l.nome(l.get(desc, 'FontName')) ?? '(sem nome)';
  const incorporada = type3 || (!!desc && FONTFILES.some((k) => l.get(desc, k) !== undefined));

  // Muitas fontes declaram um Ascent perto de 1 em, bem acima das letras. Limita-se para a caixa do
  // texto ficar perto da tinta (maiúsculas e ascendentes até ~0,8 em, descendentes até ~0,25 em).
  const ascent = Math.min(l.num(l.get(desc, 'Ascent')) ?? 800, 800);
  const descent = Math.max(l.num(l.get(desc, 'Descent')) ?? -200, -250);

  let largura: (c: number) => number;

  if (composta) {
    const dw = l.num(l.get(descendente, 'DW')) ?? 1000;
    const mapa = new Map<number, number>();
    const w = l.itens(l.get(descendente, 'W'));
    for (let i = 0; i < w.length; ) {
      const c1 = l.num(w[i]);
      const seguinte = w[i + 1];
      if (c1 === undefined || seguinte === undefined) break;
      const lista = l.arr(seguinte);
      if (lista) {
        l.numeros(lista).forEach((v, k) => mapa.set(c1 + k, v));
        i += 2;
      } else {
        const c2 = l.num(seguinte);
        const v = l.num(w[i + 2]);
        if (c2 === undefined || v === undefined) break;
        // intervalos enormes não valem a pena guardar
        if (c2 - c1 < 70000) for (let c = c1; c <= c2; c++) mapa.set(c, v);
        i += 3;
      }
    }
    largura = (c) => mapa.get(c) ?? dw;
  } else {
    const primeiro = l.num(l.get(d, 'FirstChar')) ?? 0;
    const larguras = l.numeros(l.get(d, 'Widths'));
    const falta = l.num(l.get(desc, 'MissingWidth')) ?? (/courier/i.test(nomeCompleto) ? 600 : 500);
    const fm = l.numeros(l.get(d, 'FontMatrix'));
    // Type3: as larguras estão no espaço do glifo
    const escala = type3 ? (fm[0] || 0.001) * 1000 : 1;
    largura = (c) => {
      const v = larguras[c - primeiro];
      return (Number.isFinite(v) ? v : falta) * escala;
    };
  }

  return {
    id,
    dict: d,
    nome: semPrefixo(nomeCompleto),
    nomeCompleto,
    subtype,
    incorporada,
    composta,
    type3,
    largura,
    ascent,
    descent,
  };
}
