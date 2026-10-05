import { float, glsl } from '@/shaders/glsl';
import { commonChunk } from '@/shaders/chunks/common.glsl';

/**
 * A explosão "feixe → constelação", calculada inteiramente no vertex shader.
 *
 * Cada vértice parte de um ponto no feixe (x = z = 0) e voa até sua posição
 * final. Nós E sinapses incluem este MESMO chunk: as pontas das linhas
 * acompanham os nós com precisão de vértice porque é literalmente a mesma
 * função com os mesmos atributos — não há como dessincronizar.
 *
 * As constantes vivem em TypeScript e são interpoladas no GLSL: a cena usa
 * `ASSEMBLE_END` para saber quando a montagem terminou sem duplicar números.
 */
export const ASSEMBLE = {
  /** Distância do eixo (unidades de mundo) em que o atraso da onda chega ao máximo. */
  axisFalloff: 7,
  /** Atraso máximo pela distância do eixo: a explosão se propaga de dentro para fora. */
  rippleDelay: 0.45,
  /** Atraso aleatório por nó: quebra a uniformidade da onda. */
  seedDelay: 0.15,
  /** Duração do voo de cada nó. */
  flight: 0.55,
  /** Desvio lateral máximo no meio do voo — o "estilhaçar". */
  scatter: 0.9,
} as const;

/** Valor de `uAssemble` em que o último nó pousa. */
export const ASSEMBLE_END = ASSEMBLE.rippleDelay + ASSEMBLE.seedDelay + ASSEMBLE.flight;

export const assembleChunk = glsl`
${commonChunk}
#ifndef CHUNK_ASSEMBLE
#define CHUNK_ASSEMBLE

uniform float uAssemble;        // progresso global, 0 → ASSEMBLE_END
uniform float uBeamHalfHeight;  // meia-altura do feixe em unidades de mundo

/**
 * @param target  posição final (espaço local da constelação)
 * @param originY origem no feixe, normalizada em [-1, 1]
 * @param seed    aleatório estável do nó
 * @param flight  (out) 0 = parado, 1 = no meio do voo — usado para brilho
 * @param spread  (out) 0 = ainda no feixe, 1 = pousado. Compensa densidade:
 *                milhares de elementos aditivos sobrepostos no eixo saturariam
 *                em branco, então o brilho cresce conforme eles se espalham.
 */
vec3 assemble(vec3 target, float originY, float seed, out float flight, out float spread) {
  float axisDistance = saturate(length(target.xz) / ${float(ASSEMBLE.axisFalloff)});
  float delay = axisDistance * ${float(ASSEMBLE.rippleDelay)} + seed * ${float(ASSEMBLE.seedDelay)};
  float k = saturate((uAssemble - delay) / ${float(ASSEMBLE.flight)});
  float eased = 1.0 - pow(1.0 - k, 4.0); // easeOutQuart: arranque violento, pouso suave

  vec3 origin = vec3(0.0, originY * uBeamHalfHeight, 0.0);
  vec3 scatter = (hash31(seed * 917.0) - 0.5) * 2.0;
  flight = sin(k * PI);
  spread = mix(0.2, 1.0, eased);
  return mix(origin, target, eased) + scatter * flight * ${float(ASSEMBLE.scatter)};
}

#endif
`;
