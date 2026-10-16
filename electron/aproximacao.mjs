/**
 * Deteta o gesto "aproximar um ficheiro da notch": o botão do rato está carregado (a arrastar), foi
 * carregado FORA da zona e o cursor entra nela. Só funções puras: quem as chama dá a posição do cursor,
 * o estado do botão e o relógio, e recebe 'mostrar' ou 'esconder' quando há algo a fazer.
 *
 * Porque se carregou fora da zona: carregar dentro dela (a arrastar uma janela pela barra de título,
 * a clicar num separador) não é aproximar um ficheiro. Sem isto a janelinha abria a cada clique no topo.
 */

export const dentro = (p, r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

export const expandir = (r, m) => ({ x: r.x - m, y: r.y - m, width: r.width + 2 * m, height: r.height + 2 * m });

export function criarDetetor({ zona, margem = 90, esperaMs = 110, afastarMs = 350, soltarMs = 700, arrefecerMs = 900 }) {
  /** 'inativo' (nada à vista) ou 'visivel' (a janelinha está aberta) */
  let estado = 'inativo';
  let anterior = false;
  let carregouFora = false;
  let entrouEm = 0;
  let saiuEm = 0;
  let soltouEm = 0;
  let arrefeceAte = 0;
  /** Depois de um ficheiro ser tratado, só se volta a abrir depois de o botão ser solto */
  let exigeSoltar = false;

  const fechar = (agora) => {
    estado = 'inativo';
    entrouEm = 0;
    saiuEm = 0;
    arrefeceAte = agora + arrefecerMs;
    return 'esconder';
  };

  return {
    estado: () => estado,

    /** Chamar a cada medição. Devolve 'mostrar', 'esconder' ou null. */
    atualizar(ponto, botao, agora) {
      const z = typeof zona === 'function' ? zona() : zona;
      if (botao && !anterior) carregouFora = !dentro(ponto, z);
      if (!botao && anterior) soltouEm = agora;
      anterior = botao;
      if (!botao) {
        carregouFora = false;
        exigeSoltar = false;
      }

      if (estado === 'inativo') {
        if (!botao || !carregouFora || exigeSoltar || agora < arrefeceAte || !dentro(ponto, z)) {
          entrouEm = 0;
          return null;
        }
        entrouEm ||= agora;
        if (agora - entrouEm >= esperaMs) {
          estado = 'visivel';
          saiuEm = 0;
          return 'mostrar';
        }
        return null;
      }

      // janelinha aberta
      if (!botao) {
        // largou: o evento de largar chega logo; se não chegar, esconde
        return agora - soltouEm >= soltarMs ? fechar(agora) : null;
      }
      if (dentro(ponto, expandir(z, margem))) {
        saiuEm = 0;
        return null;
      }
      saiuEm ||= agora;
      return agora - saiuEm >= afastarMs ? fechar(agora) : null;
    },

    /** O ficheiro foi largado e tratado: fecha já, sem esperar */
    terminar(agora) {
      if (estado !== 'visivel') return null;
      exigeSoltar = true;
      return fechar(agora);
    },
  };
}
