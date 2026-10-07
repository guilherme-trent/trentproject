import { float, glsl } from '@/shaders/glsl';
import { commonChunk } from '@/shaders/chunks/common.glsl';

/**
 * O feixe vira árvore — calculado por vértice na GPU.
 *
 * Cada vértice nasce colapsado no eixo do feixe (x = z = 0, mesma altura) e se
 * desdobra até a posição final. O atraso cresce com a distância ao meio do
 * tronco (`reach`), então o tronco engrossa primeiro e os galhos e raízes
 * brotam depois, até as pontas.
 */
export const GROWTH = {
  /** Atraso máximo (em unidades de uGrowth) entre o meio do tronco e as pontas. */
  spread: 0.75,
  /** Atraso aleatório por fio: os fios não brotam em uníssono. */
  jitter: 0.12,
  /** Duração do desdobramento de cada vértice. */
  ramp: 0.35,
} as const;

/** `uGrowth` é normalizado: 1 = último vértice pousado. */
const GROWTH_END = GROWTH.spread + GROWTH.jitter + GROWTH.ramp;

/**
 * Valor de `uGrowth` em que TODO vértice de alcance ≤ `reach` já pousou —
 * a mesma conta do shader, na CPU (ex.: o fruto desabrocha no instante em
 * que o último fio do seu caule termina de crescer).
 */
export const growthLandedAt = (reach: number) => (reach * GROWTH.spread + GROWTH.jitter + GROWTH.ramp) / GROWTH_END;

export const growthChunk = glsl`
${commonChunk}
#ifndef CHUNK_GROWTH
#define CHUNK_GROWTH

uniform float uGrowth;
uniform vec2 uBeamSpan;

/**
 * @param rest   posição final
 * @param reach  |região|: 0 no meio do tronco, 1 nas pontas
 * @param grown  (out) 0 = ainda no feixe, 1 = pousado
 * @param front  (out) pico no meio do desdobramento — a frente de crescimento brilha
 */
vec3 grow(vec3 rest, float reach, float seed, out float grown, out float front) {
  float delay = reach * ${float(GROWTH.spread)} + seed * ${float(GROWTH.jitter)};
  float k = saturate((uGrowth * ${float(GROWTH_END)} - delay) / ${float(GROWTH.ramp)});
  float eased = 1.0 - pow(1.0 - k, 3.0);
  vec3 axis = vec3(0.0, clamp(rest.y, uBeamSpan.x, uBeamSpan.y), 0.0);
  grown = k;
  front = k * (1.0 - k) * 4.0;
  return mix(axis, rest, eased);
}

#endif
`;
