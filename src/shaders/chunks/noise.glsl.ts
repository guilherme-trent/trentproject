import { glsl } from '../glsl';
import { commonChunk } from './common.glsl';

/**
 * Value noise 2D + fBm de 3 oitavas.
 * Escolhido sobre simplex pelo custo: o fBm roda várias vezes por pixel em
 * tela cheia (inclusive 3× sob a refração cromática), e value noise é ~2× mais barato.
 */
export const noiseChunk = glsl`
${commonChunk}
#ifndef CHUNK_NOISE
#define CHUNK_NOISE

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm3(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * valueNoise(p);
    p = p * 2.03 + 17.0;
    amplitude *= 0.5;
  }
  return value;
}

#endif
`;
