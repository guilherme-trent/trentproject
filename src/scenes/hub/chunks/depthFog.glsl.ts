import { glsl } from '@/shaders/glsl';

/**
 * Atenuação por profundidade: o lado distante da constelação esmaece,
 * reforçando a leitura 3D sem precisar de luzes ou sombras.
 */
export const depthFogChunk = glsl`
#ifndef CHUNK_DEPTH_FOG
#define CHUNK_DEPTH_FOG

uniform float uFogNear;
uniform float uFogFar;

float depthFog(float viewDepth) {
  return mix(1.0, 0.2, smoothstep(uFogNear, uFogFar, viewDepth));
}

#endif
`;
