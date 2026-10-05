import { BufferGeometry, Float32BufferAttribute } from 'three';
import { glsl } from './glsl';

/**
 * Passe de tela cheia via "fullscreen triangle".
 *
 * Um único triângulo gigante que cobre o clip space inteiro, em vez de um quad
 * (2 triângulos): sem a diagonal, a GPU não sombreia duas vezes os pixels da
 * emenda (os quads 2×2 de rasterização), e há 3 vértices em vez de 4/6.
 *
 * O vertex shader escreve direto em clip space: a câmera é ignorada, então o
 * efeito é sempre exatamente a tela — independente de onde a câmera esteja.
 */
export const FULLSCREEN_VERTEX = glsl`
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Converte vUv em coordenada centrada com altura = 1 e x corrigido pelo aspect. */
export const SCREEN_SPACE_CHUNK = glsl`
vec2 screenSpace(vec2 uv, float aspect) {
  return (uv - 0.5) * vec2(aspect, 1.0);
}
`;

export function createFullscreenTriangle(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return geometry;
}
