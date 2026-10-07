import { glsl } from '@/shaders/glsl';

/**
 * Paisagens de destino compartilhadas entre o EFEITO de saída (na hub) e a
 * CHEGADA ao reino. O último frame de uma é o primeiro da outra: mesmo código,
 * mesmos parâmetros — a troca de cena não tem costura.
 */

/** O vazio-planta (Architecture): grade técnica em duas escalas sobre um escuro esmeralda. */
export const blueprintChunk = glsl`
#ifndef CHUNK_BLUEPRINT
#define CHUNK_BLUEPRINT

vec3 blueprintVoid(vec2 uv, float aspect, float time, vec3 tint) {
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  vec2 fine = abs(fract(p * 14.0 + vec2(0.0, time * 0.05)) - 0.5);
  vec2 major = abs(fract(p * 3.5) - 0.5);
  float fineLine = 1.0 - smoothstep(0.0, 0.045, min(fine.x, fine.y));
  float majorLine = 1.0 - smoothstep(0.0, 0.012, min(major.x, major.y));
  float vignette = exp(-dot(p, p) * 1.4);
  return tint * (0.035 + fineLine * 0.1 + majorLine * 0.55) * vignette;
}

#endif
`;

/** Estrias de hiperespaço (Performance): faixas radiais aleatórias em torno de um centro. */
export const streaksChunk = glsl`
#ifndef CHUNK_STREAKS
#define CHUNK_STREAKS

float streakHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/**
 * @param d       posição relativa ao centro (aspect corrigido)
 * @param travel  fase do movimento radial (cresce com o tempo × velocidade)
 */
float hyperStreaks(vec2 d, float travel) {
  float r = length(d);
  float lane = floor((atan(d.y, d.x) / 6.2831853 + 0.5) * 96.0);
  float lit = pow(streakHash(vec2(lane, 3.7)), 14.0);
  float phase = fract(r * 1.2 - travel + streakHash(vec2(lane, 9.1)));
  float dash = smoothstep(0.0, 0.08, phase) * (1.0 - smoothstep(0.35, 0.6, phase));
  return lit * dash * smoothstep(0.04, 0.5, r);
}

#endif
`;

