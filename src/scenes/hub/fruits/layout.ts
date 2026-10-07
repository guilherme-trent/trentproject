import type { PillarId } from '../../shared/pillars';

/**
 * Composição dos Frutos na Yggdrasil.
 *
 * A árvore não gira 360°: BALANÇA ±SWING em torno de BASE_YAW (os frutos são
 * alvos interativos; numa volta completa eles orbitariam o tronco e cruzariam
 * uns aos outros). Cada fruto PENDE da forquilha de um galho principal por um
 * caule: sai da forquilha, se afasta do eixo e desce até o fruto.
 *
 * Galhos e direções herdados da busca com restrições feita para as antigas
 * Fissuras (projeção com o enquadramento real ao longo de todo o balanço):
 * Architecture sempre do lado da frente do tronco, os três dentro do quadro e
 * bem separados na tela. O fruto é menor e fica mais perto do galho.
 */
export const BASE_YAW = (70 * Math.PI) / 180;
export const SWING = (15 * Math.PI) / 180;

export interface FruitPlacement {
  /** Índice do galho principal (0..6). */
  branch: number;
  /** Afastamento horizontal do eixo, a partir da forquilha. */
  outward: number;
  /** Queda vertical a partir da forquilha (o fruto pende). */
  drop: number;
  /** Giro (rad, no plano horizontal) da direção em que o fruto se afasta da forquilha. */
  turn: number;
}

export const FRUIT_LAYOUT: Record<PillarId, FruitPlacement> = {
  // Architecture: o galho 3 aponta para a câmera e o fruto pendia NA FRENTE do
  // tronco — a região mais brilhante da cena, onde o cristal sumia. Girado
  // −0,8 rad, ele pende ao lado do tronco, ainda do lado da frente.
  architecture: { branch: 3, outward: 2.9, drop: 2.8, turn: -0.8 },
  performance: { branch: 2, outward: 2.9, drop: 2.8, turn: 0 },
  experience: { branch: 4, outward: 2.9, drop: 2.8, turn: 0 },
};

export interface FruitAnchor {
  /** Forquilha do galho: onde o caule nasce (espaço local da árvore). */
  fork: [number, number, number];
  /** Centro do cristal. */
  center: [number, number, number];
  branch: number;
}

export function computeFruitAnchors(
  mainBranches: Float32Array,
  order: readonly PillarId[],
  layout: Record<PillarId, FruitPlacement> = FRUIT_LAYOUT,
): FruitAnchor[] {
  return order.map((id) => {
    const { branch, outward, drop, turn } = layout[id];
    const x = mainBranches[branch * 3];
    const y = mainBranches[branch * 3 + 1];
    const z = mainBranches[branch * 3 + 2];
    const horizontal = Math.hypot(x, z) || 1;
    const dx = x / horizontal;
    const dz = z / horizontal;
    const ox = dx * Math.cos(turn) - dz * Math.sin(turn);
    const oz = dx * Math.sin(turn) + dz * Math.cos(turn);
    return { fork: [x, y, z], center: [x + ox * outward, y - drop, z + oz * outward], branch };
  });
}
