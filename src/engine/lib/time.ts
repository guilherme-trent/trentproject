/**
 * Utilitários de tempo e easing para timelines dirigidas por useFrame.
 *
 * Cenas acumulam o próprio relógio com `clampDelta` em vez de usar
 * `clock.elapsedTime`: se a aba fica oculta, o rAF para e, ao voltar, o delta
 * seria de vários segundos — a timeline "pularia" a animação inteira.
 * Com o clamp, a cena simplesmente pausa e continua de onde parou.
 */

/** Maior passo de tempo aceito por frame (equivale a 20fps). */
export const MAX_FRAME_DELTA = 1 / 20;

export const clampDelta = (delta: number) => Math.min(delta, MAX_FRAME_DELTA);

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Progresso linear 0→1 de `t` dentro de [start, end]. */
export const progress = (t: number, start: number, end: number) => clamp01((t - start) / (end - start));

/** Igual ao smoothstep do GLSL — mantém CPU e GPU falando a mesma língua. */
export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
export const easeInQuad = (x: number) => x * x;
