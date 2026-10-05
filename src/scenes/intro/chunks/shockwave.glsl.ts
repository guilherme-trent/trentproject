import { glsl } from '@/shaders/glsl';

/**
 * Perfis radiais da onda de choque.
 *
 * shockRing: gaussiana centrada no raio — a luz emitida pela frente de onda.
 * shockLens: derivada da gaussiana (x·e^{-x²}) — positiva fora do anel,
 *            negativa dentro. Usada como deslocamento radial de UV, empurra a
 *            imagem para fora e puxa para dentro: o comportamento de uma lente
 *            anular (o "ar comprimido" de uma explosão).
 */
export const shockwaveChunk = glsl`
#ifndef CHUNK_SHOCKWAVE
#define CHUNK_SHOCKWAVE

float shockRing(float r, float radius, float width) {
  float x = (r - radius) / width;
  return exp(-x * x);
}

float shockLens(float r, float radius, float width) {
  float x = (r - radius) / width;
  return x * exp(-x * x);
}

#endif
`;
