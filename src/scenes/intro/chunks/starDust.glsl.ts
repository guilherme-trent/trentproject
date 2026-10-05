import { glsl } from '@/shaders/glsl';
import { noiseChunk } from '@/shaders/chunks/noise.glsl';

/**
 * Poeira cósmica procedural (estrelas em grade com jitter + nebulosa fBm).
 *
 * Existe por um motivo técnico: refração só é visível se houver algo atrás
 * para distorcer. A onda de choque "ilumina" esta poeira por dentro da frente
 * de onda, e as estrelas tortas ao redor do anel denunciam a lente.
 */
export const starDustChunk = glsl`
${noiseChunk}
#ifndef CHUNK_STAR_DUST
#define CHUNK_STAR_DUST

float starLayer(vec2 p, float scale, float density, float time) {
  vec2 grid = p * scale;
  vec2 id = floor(grid);
  vec2 cell = fract(grid) - 0.5;
  vec2 h = hash22(id);

  float present = step(1.0 - density, hash12(id + 7.13));
  float d = length(cell - (h - 0.5) * 0.7);
  float twinkle = 0.6 + 0.4 * sin(time * 2.0 + h.x * 30.0);
  return present * smoothstep(0.08, 0.0, d) * twinkle * (0.5 + h.y);
}

vec3 starDust(vec2 p, float time) {
  float stars = starLayer(p, 40.0, 0.25, time) + 0.6 * starLayer(p + 3.1, 95.0, 0.35, time);
  float nebula = smoothstep(0.35, 0.85, fbm3(p * 3.0 + vec2(0.0, time * 0.05))) * 0.12;
  vec3 nebulaColor = mix(vec3(0.2, 0.1, 0.5), vec3(0.1, 0.4, 0.6), nebula * 5.0);
  return vec3(0.65, 0.8, 1.0) * stars + nebulaColor * nebula;
}

#endif
`;
