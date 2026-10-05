import { glsl } from '../glsl';
import { noiseChunk } from './noise.glsl';

/**
 * O feixe de energia vertical — função pura de espaço de tela.
 *
 * Compartilhado entre a cena 'intro' (onde ele nasce) e a 'hub' (onde seu
 * remanescente se dissolve enquanto os nós estilhaçam). Por ser o MESMO código
 * com os MESMOS parâmetros, o último frame da intro e o primeiro da hub são
 * idênticos — a troca de cena é invisível.
 *
 * Espaço de coordenadas: `p` centrado na tela, altura da tela = 1.0
 * (y ∈ [-0.5, 0.5]); x corrigido pelo aspect ratio.
 *
 * @param p          coordenada do pixel
 * @param time       segundos (anima turbulência e fluxo descendente)
 * @param headY      y da ponta do feixe: o feixe existe ACIMA dela
 *                   (0.6 = ainda fora da tela, -0.6 = atravessou a tela toda)
 * @param intensity  multiplicador de energia (HDR: pode passar de 1)
 */
export const energyBeamChunk = glsl`
${noiseChunk}
#ifndef CHUNK_ENERGY_BEAM
#define CHUNK_ENERGY_BEAM

vec3 energyBeam(vec2 p, float time, float headY, float intensity) {
  // Corpo: o feixe só existe acima da ponta, com borda suave.
  float body = smoothstep(headY - 0.01, headY + 0.03, p.y);

  // Instabilidade lateral: o feixe "vibra" como um arco de plasma.
  float wobble = (valueNoise(vec2(p.y * 14.0 - time * 9.0, time * 2.0)) - 0.5) * 0.006;
  float dx = abs(p.x - wobble);

  // Três camadas radiais: núcleo branco quase-sólido, plasma interno, halo.
  float core  = exp(-dx * dx * 90000.0);
  float inner = exp(-dx * dx * 4000.0);
  float halo  = exp(-dx * 55.0);

  // Estrias de energia fluindo para baixo (o padrão translada em -y com o tempo).
  float flow = 0.6 + 0.8 * fbm3(vec2(dx * 60.0, p.y * 10.0 + time * 30.0));

  vec3 plasma = vec3(0.35, 0.75, 1.0);
  vec3 fringe = vec3(0.55, 0.35, 1.0);
  vec3 color = vec3(1.0) * core * 3.0
             + plasma * inner * flow * 1.0
             + mix(plasma, fringe, smoothstep(0.0, 0.08, dx)) * halo * flow * 0.35;
  color *= body;

  // Flare na ponta enquanto o feixe ainda está em trânsito pela tela.
  float inTransit = step(-0.55, headY) * step(headY, 0.55);
  float tip = exp(-pow((p.y - headY) * 25.0, 2.0)) * exp(-dx * 20.0) * inTransit;
  color += vec3(0.8, 0.9, 1.0) * tip * 3.0;

  return color * intensity;
}

#endif
`;
