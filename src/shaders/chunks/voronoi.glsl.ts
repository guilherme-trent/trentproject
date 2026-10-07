import { glsl } from '../glsl';

/**
 * Voronoi 2D com distância EXATA à borda da célula (Inigo Quilez, duas passadas).
 *
 * A distância ao ponto mais próximo (Voronoi ingênuo) desenha bolhas; a
 * distância à BORDA — o bissetor entre os dois pontos mais próximos — desenha
 * as arestas retas de cacos de vidro. É o que permite rachaduras finas e nítidas.
 *
 * `period` > 0 faz o eixo X ser periódico (as células "dão a volta"): é o que
 * permite Voronoi em coordenadas POLARES sem costura no ângulo ±180°.
 *
 * Funções com prefixo `vor` (não structs): o EffectPass do postprocessing
 * mescla shaders de vários efeitos e prefixa identificadores; funções simples
 * com `out` sobrevivem a isso sem surpresas.
 */
export const voronoiChunk = glsl`
#ifndef CHUNK_VORONOI
#define CHUNK_VORONOI

vec2 vorHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

/** Pontos de semente com jitter contido: evita células degeneradas (cacos-agulha). */
vec2 vorSeed(vec2 cell, float period) {
  vec2 wrapped = period > 0.0 ? vec2(mod(cell.x, period), cell.y) : cell;
  return 0.15 + 0.7 * vorHash22(wrapped);
}

/**
 * @param x       coordenada no espaço de células
 * @param period  período do eixo X (0 = sem periodicidade)
 * @param id      (out) célula vencedora (inteiros, X já reduzido ao período) — identidade estável do caco
 * @param center  (out) posição da semente vencedora
 * @param border  (out) distância até a aresta mais próxima do caco
 */
void vorCell(vec2 x, float period, out vec2 id, out vec2 center, out float border) {
  vec2 n = floor(x);
  vec2 f = fract(x);

  vec2 mg = vec2(0.0);
  vec2 mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + vorSeed(n + g, period) - f;
      float d = dot(r, r);
      if (d < md) {
        md = d;
        mr = r;
        mg = g;
      }
    }
  }

  // Segunda passada: distância ao bissetor com cada vizinho (a aresta real).
  md = 8.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 r = g + vorSeed(n + g, period) - f;
      if (dot(mr - r, mr - r) > 0.00001) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
    }
  }

  id = n + mg;
  center = id + vorSeed(id, period);
  if (period > 0.0) id.x = mod(id.x, period);
  border = md;
}

#endif
`;
