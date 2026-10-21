/**
 * Do quadro do vídeo da árvore para a tela. O vídeo aparece com `object-fit: cover` + `object-position`,
 * então um ponto do quadro (ex.: um fruto em 625×340 no vídeo largo) cai num lugar diferente da tela
 * conforme o tamanho da janela. Esta é a mesma conta que o navegador faz para desenhar o vídeo.
 * A capa (<img>) diz qual versão está em uso: larga (1920×1080) ou em retrato (720×1280).
 */
export interface Quadro {
  /** Quantos pixels de tela vale um pixel do quadro. */
  escala: number;
  /** Onde o canto do quadro cai dentro da caixa (pode ser negativo: a parte cortada). */
  ox: number;
  oy: number;
  /** Tamanho do quadro original. */
  largura: number;
  altura: number;
  retrato: boolean;
}

export function medirQuadro(caixa: HTMLElement, capa: HTMLImageElement): Quadro {
  const retrato = capa.naturalWidth > 0 ? capa.naturalHeight > capa.naturalWidth : matchMedia('(max-width: 767px)').matches;
  const largura = capa.naturalWidth || (retrato ? 720 : 1920);
  const altura = capa.naturalHeight || (retrato ? 1280 : 1080);
  const bw = caixa.clientWidth;
  const bh = caixa.clientHeight;
  const escala = Math.max(bw / largura, bh / altura);
  const [px, py] = getComputedStyle(capa).objectPosition.split(' ').map((v) => parseFloat(v) / 100);
  return {
    escala,
    ox: (bw - largura * escala) * (Number.isFinite(px) ? px : 0.5),
    oy: (bh - altura * escala) * (Number.isFinite(py) ? py : 0.5),
    largura,
    altura,
    retrato,
  };
}
