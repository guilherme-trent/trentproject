import { AdditiveBlending, ShaderMaterial } from 'three';
import { glsl, vec3 } from '@/shaders/glsl';
import { PALETTE } from '../../shared/palette';
import { growthChunk } from '../chunks/growth.glsl';
import { depthFogChunk } from '../chunks/depthFog.glsl';
import type { HubUniforms } from '../uniforms';

/**
 * Material das LINHAS DO TEMPO — os milhares de fios da Yggdrasil.
 *
 * Toda a vida dos fios acontece aqui, na GPU, a partir de UM uniform de tempo:
 *   vertex   → crescimento a partir do feixe + balanço orgânico (pontas vivas,
 *              tronco firme) + ~6% de fios "soltos": o caos que o TPM orquestra.
 *   fragment → pacotes de luz subindo das raízes à copa (o tempo fluindo),
 *              respiração por fio, paleta esmeralda → celeste com fios dourados.
 *
 * A CPU não toca em nenhum vértice depois do upload. Nenhum re-render, nenhuma
 * alocação por frame — o GC do JavaScript não tem o que coletar.
 *
 * Brilho: cada fio é fraco (≈0.09); o tronco brilha pela SOMA aditiva de
 * milhares de fios sobrepostos — e é essa soma (HDR > 1) que o Bloom captura.
 */
const vertexShader = glsl`
${growthChunk}

/** x: semente do fio · y: t ao longo do fio (0 raiz → 1 copa) · z: região assinada. */
attribute vec3 aThread;

uniform float uTime;

varying float vSeed;
varying float vT;
varying float vRegion;
varying float vGrown;
varying float vFront;
varying float vDepth;

void main() {
  float seed = aThread.x;
  float reach = abs(aThread.z);

  // Balanço: cresce com o quadrado da distância ao tronco.
  float loose = step(0.94, seed);
  float sway = reach * reach * (0.12 + loose * 0.85);
  vec3 p = position;
  p.x += sin(uTime * 0.6 + p.y * 0.9 + seed * 6.2831) * sway;
  p.z += cos(uTime * 0.5 + p.y * 0.7 + seed * 4.0) * sway;
  p.y += sin(uTime * 0.4 + p.x * 0.5 + seed * 3.0) * sway * 0.4;

  float grown;
  float front;
  p = grow(p, reach, seed, grown, front);

  vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewPosition;

  vSeed = seed;
  vT = aThread.y;
  vRegion = aThread.z;
  vGrown = grown;
  vFront = front;
  vDepth = -viewPosition.z;
}
`;

const fragmentShader = glsl`
${depthFogChunk}

uniform float uTime;
uniform float uDive;

varying float vSeed;
varying float vT;
varying float vRegion;
varying float vGrown;
varying float vFront;
varying float vDepth;

void main() {
  // Linhas do tempo fluindo: ~9 pacotes de luz por fio, subindo para a copa.
  float speed = 0.35 + vSeed * 0.3;
  float packet = pow(0.5 + 0.5 * sin((vT * 9.0 - uTime * speed + vSeed * 31.0) * 6.2831), 28.0);
  float breathe = 0.75 + 0.25 * sin(uTime * 0.8 + vSeed * 6.2831);

  vec3 emerald = ${vec3(PALETTE.emerald)};
  vec3 sky = ${vec3(PALETTE.sky)};
  vec3 gold = ${vec3(PALETTE.gold)};
  vec3 deepRoot = ${vec3(PALETTE.deepRoot)};

  vec3 canopyTint = mix(emerald, sky, smoothstep(0.15, 0.85, vRegion));
  vec3 rootTint = mix(emerald, deepRoot, smoothstep(0.15, 0.85, -vRegion));
  vec3 tint = mix(rootTint, canopyTint, step(0.0, vRegion));
  float isGold = step(0.9, fract(vSeed * 7.31)); // ~10% dos fios: toques de ouro
  tint = mix(tint, gold, isGold);

  float intensity = 0.04 * breathe + packet * (1.1 + isGold);
  vec3 color = tint * intensity + gold * vFront * 0.12; // frente de crescimento dourada

  // Compensação de densidade: enquanto colapsados no eixo, milhares de fios
  // somados saturariam o bloom num borrão; o brilho cresce conforme se abrem.
  float density = mix(0.2, 1.0, vGrown);
  float visibility = smoothstep(0.0, 0.25, vGrown) * density * depthFog(vDepth) * (1.0 - uDive * 0.6);
  gl_FragColor = vec4(color * visibility, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class TimelineMaterial extends ShaderMaterial {
  constructor(shared: HubUniforms) {
    super({
      vertexShader,
      fragmentShader,
      // Referências, não cópias: os uniforms são compartilhados com a cena toda.
      uniforms: {
        uTime: shared.uTime,
        uGrowth: shared.uGrowth,
        uDive: shared.uDive,
        uBeamSpan: shared.uBeamSpan,
        uFogNear: shared.uFogNear,
        uFogFar: shared.uFogFar,
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
  }
}
