import type { YggdrasilData } from './yggdrasil/generator';

/**
 * Enquadramento responsivo da Yggdrasil.
 *
 * A distância da câmera é a MAIOR entre o encaixe vertical e o horizontal:
 * em telas retrato (celular), o horizontal domina e a câmera recua.
 *
 * `beamSpan` é a faixa Y visível no plano z = 0 nessa distância: a árvore
 * brota de pontos sobre o eixo dentro dessa faixa — exatamente onde o feixe
 * de tela cheia da intro está desenhado, qualquer que seja o aspect ratio.
 */

/** Fração da árvore que precisa caber: 0.92 só raspa as pontas extremas (sensação de escala). */
const FILL = 0.92;

export const BASE_FOV = 45;

export interface HubFraming {
  distance: number;
  /** Para onde a câmera olha: o centro vertical da árvore, sobre o eixo. */
  targetY: number;
  beamSpan: [min: number, max: number];
  fogNear: number;
  fogFar: number;
}

export function computeHubFraming(bounds: YggdrasilData['bounds'], aspect: number): HubFraming {
  const tanHalf = Math.tan((BASE_FOV * Math.PI) / 360);
  const halfHeight = ((bounds.max[1] - bounds.min[1]) / 2) * FILL;
  const halfWidth = (Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) / 2) * FILL;
  // Encaixe no plano do eixo + meia profundidade: a parte da árvore mais próxima
  // da câmera parece maior, e é ela que estouraria a borda da tela.
  const halfDepth = (bounds.max[2] - bounds.min[2]) / 2;
  const distance = Math.max(halfHeight / tanHalf, halfWidth / (tanHalf * aspect)) + halfDepth * 0.6;
  const targetY = (bounds.max[1] + bounds.min[1]) / 2;
  const visibleHalf = distance * tanHalf;
  const depth = Math.max(bounds.max[2] - bounds.min[2], bounds.max[0] - bounds.min[0]) / 2;

  return {
    distance,
    targetY,
    beamSpan: [targetY - visibleHalf, targetY + visibleHalf],
    fogNear: distance - depth * 0.3,
    fogFar: distance + depth * 1.2,
  };
}
