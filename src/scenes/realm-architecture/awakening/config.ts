/**
 * Fruto 1 — O DESPERTAR (ancoragem, o autômato e o fake-out).
 *
 * A cena é um plano frontal (z = 0) visto por uma câmera fixa: tudo é
 * posicionado em FRAÇÕES da área visível, então a mesma coreografia cabe no
 * desktop e no celular em pé.
 */

export const CAMERA = { z: 10, fov: 40 } as const;

/** Os fios de gosma: x das ancoragens no topo (fração da meia-largura) e comprimento (fração da meia-altura). */
export const STRANDS = { x: [-0.62, -0.21, 0.21, 0.62], length: 1.02, grabRadius: 0.16, snapRadius: 0.2 } as const;
/** Os pregos na base: x (fração da meia-largura) e y (fração da meia-altura, negativa = embaixo). */
export const NAILS = { x: [-0.7, -0.24, 0.24, 0.7], y: -0.78 } as const;

/** Grade do rasgo da membrana (CPU → textura), raio da lâmina e quanto precisa estar rasgado. */
export const TEAR = { cols: 64, rows: 64, blade: 0.032, spread: 0.22, complete: 0.26 } as const;

/** O autômato: tamanho (mundo), velocidades e o gatilho de fuga (velocidade do cursor em alturas de tela/s). */
export const BEETLE = { size: 1, walk: 0.85, flee: 3.6, fleeSeconds: 1, fleeTrigger: 1.5, fleeRadius: 0.55, catchRadius: 0.32 } as const;

/** Durações (s). */
export const TIMING = {
  arrive: 1.6,
  drop: 1.3,
  fuse: 1.5,
  rip: 1.1,
  emerge: 2.4,
  awakenFlash: 0.9,
  glitch: 0.9,
  shatter: 1.9,
} as const;

/** As falas interceptadas de "Guilherme Trent", com a pausa (s) antes de cada uma. */
export const INTERCEPT = [
  { delay: 0.9, text: 'Olha, eu preciso que voce vol-' },
  { delay: 1.3, text: 'Para a árvore agora, entendeu?' },
  { delay: 1.1, text: '-te para a árvore' },
  { delay: 1.4, text: 'O fruto é desbloquea-' },
  { delay: 1.2, text: 'Com títulos...' },
] as const;
