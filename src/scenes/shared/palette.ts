/**
 * Paleta da Yggdrasil em RGB LINEAR (valores de shader, não hex de CSS).
 * Fonte única: interpolada nos shaders via `vec3()` e usada pelos Nexus Points
 * e pela UI — o verde da árvore, do pilar e do reino são literalmente o mesmo número.
 */
export type RGB = readonly [number, number, number];

export const PALETTE = {
  emerald: [0.05, 0.95, 0.55],
  sky: [0.25, 0.7, 1.0],
  gold: [1.0, 0.72, 0.28],
  deepRoot: [0.0, 0.42, 0.38],
} as const satisfies Record<string, RGB>;
