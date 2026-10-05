import { glsl } from '../glsl';

/**
 * Constantes e hashes base.
 *
 * Hashes "without sine" (Dave Hoskins): `fract(sin(x) * 43758.5)` perde precisão
 * em GPUs móveis com mediump e gera padrões visíveis; estes são estáveis.
 *
 * `saturate` e `PI` são protegidos por #ifndef porque o three.js pode já tê-los
 * definido no prefixo do shader (tonemapping_pars_fragment / <common>).
 */
export const commonChunk = glsl`
#ifndef CHUNK_COMMON
#define CHUNK_COMMON

#ifndef PI
#define PI 3.141592653589793
#endif

#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec3 hash31(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

#endif
`;
