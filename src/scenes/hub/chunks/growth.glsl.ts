import { float, glsl } from '@/shaders/glsl';
import { commonChunk } from '@/shaders/chunks/common.glsl';

/**
 * O feixe vira árvore — calculado por vértice na GPU.
 *
 * O atraso cresce com a distância ao meio do tronco (`reach`): o tronco
 * engrossa primeiro e os galhos e raízes brotam depois, até as pontas.
 *   tronco e raízes  cada vértice nasce colapsado no eixo do feixe (x = z = 0,
 *                    mesma altura) e se DESDOBRA até a posição final;
 *   galhos           nascem já no lugar e são DESENHADOS do tronco para as
 *                    pontas (a visibilidade segue o desdobramento). Desdobrados,
 *                    cada fio cruzava o espaço do eixo até a ponta em linha reta,
 *                    em tempos levemente diferentes: o galho abria como uma
 *                    vassoura e depois "fechava".
 * Entre o alto do tronco e a base dos galhos (BRANCH_DRAW) os dois modos se misturam.
 */
export const GROWTH = {
  /** Atraso máximo (em unidades de uGrowth) entre o meio do tronco e as pontas. */
  spread: 0.75,
  /** Atraso aleatório por fio: os fios não brotam em uníssono. */
  jitter: 0.12,
  /** Duração do desdobramento de cada vértice. */
  ramp: 0.35,
} as const;

/** Faixa de região (copa) em que o desdobramento cede ao desenho: alto do tronco → base dos galhos. */
const BRANCH_DRAW = [0.12, 0.3] as const;
/**
 * Galhos desenhados:
 *   jitter  sem atraso aleatório por fio — as pontas avançam juntas, sem fios disparando à frente em pluma;
 *   ramp    a frente é curta e nítida (o desenho não tem viagem para esconder);
 *   pace    o desenho se espalha pelo crescimento inteiro (as pontas fecham perto do fim, como antes).
 */
const BRANCH = { jitter: 0, ramp: 0.15, pace: 1.36 } as const;

/** `uGrowth` é normalizado: 1 = último vértice pousado. */
const GROWTH_END = GROWTH.spread + GROWTH.jitter + GROWTH.ramp;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Valor de `uGrowth` em que todo vértice da `region` dada já pousou — a mesma
 * conta do shader, na CPU (ex.: o fruto nasce no instante em que o último fio
 * do seu caule termina de crescer).
 */
export function growthLandedAt(region: number) {
  const drawn = smoothstep(BRANCH_DRAW[0], BRANCH_DRAW[1], region);
  const mix = (a: number, b: number) => a + (b - a) * drawn;
  return (Math.abs(region) * GROWTH.spread * mix(1, BRANCH.pace) + GROWTH.jitter * mix(1, BRANCH.jitter) + mix(GROWTH.ramp, BRANCH.ramp)) / GROWTH_END;
}

export const growthChunk = glsl`
${commonChunk}
#ifndef CHUNK_GROWTH
#define CHUNK_GROWTH

uniform float uGrowth;
uniform vec2 uBeamSpan;

/**
 * @param rest    posição final
 * @param region  região assinada: −1 ponta da raiz … 0 meio do tronco … +1 ponta do galho
 * @param grown   (out) 0 = ainda no feixe (ou não desenhado), 1 = pousado
 * @param front   (out) pico no meio do desdobramento — a frente de crescimento brilha
 */
vec3 grow(vec3 rest, float region, float seed, out float grown, out float front) {
  float drawn = smoothstep(${float(BRANCH_DRAW[0])}, ${float(BRANCH_DRAW[1])}, region);
  float delay = abs(region) * ${float(GROWTH.spread)} * mix(1.0, ${float(BRANCH.pace)}, drawn)
              + seed * ${float(GROWTH.jitter)} * mix(1.0, ${float(BRANCH.jitter)}, drawn);
  float k = saturate((uGrowth * ${float(GROWTH_END)} - delay) / mix(${float(GROWTH.ramp)}, ${float(BRANCH.ramp)}, drawn));
  float eased = 1.0 - pow(1.0 - k, 3.0);
  vec3 axis = vec3(0.0, clamp(rest.y, uBeamSpan.x, uBeamSpan.y), 0.0);
  grown = k;
  front = k * (1.0 - k) * 4.0;
  return mix(axis, rest, mix(eased, 1.0, drawn));
}

#endif
`;
