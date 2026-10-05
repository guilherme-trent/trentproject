import { glsl } from '@/shaders/glsl';

/**
 * A centelha: núcleo quase pontual + halo com queda quadrática inversa
 * (fisicamente plausível para uma fonte pontual), pulsando e tremeluzindo.
 */
export const emberChunk = glsl`
#ifndef CHUNK_EMBER
#define CHUNK_EMBER

vec3 ember(vec2 p, float time, float intensity) {
  float r = length(p);
  float pulse = 0.75 + 0.25 * sin(time * 3.2);
  float flicker = 0.9 + 0.1 * sin(time * 23.0) * sin(time * 7.3 + 1.2);

  float core = exp(-r * r * 9000.0);
  float halo = pow(0.012 / (r + 0.012), 2.0);

  vec3 tint = vec3(0.55, 0.85, 1.0);
  return (vec3(1.0) * core * 4.0 + tint * halo * 1.5) * intensity * pulse * flicker;
}

#endif
`;
