import { AdditiveBlending } from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend, type ThreeElement } from '@react-three/fiber';
import { glsl } from '@/shaders/glsl';
import { assembleChunk } from '../chunks/assemble.glsl';
import { depthFogChunk } from '../chunks/depthFog.glsl';

/**
 * Material das sinapses (LineSegments).
 *
 * Os vértices usam o MESMO `assemble()` dos nós, então as linhas nascem
 * esticadas como estilhaços e pousam grudadas nos nós.
 *
 * Sinais neurais: ~30% das sinapses carregam um pulso de luz viajando de uma
 * ponta à outra. `aSide` (0 na origem, 1 no destino) é interpolado pelo
 * rasterizador ao longo da linha, dando ao fragment a posição exata do pixel
 * no segmento — o pulso é só uma gaussiana nessa coordenada.
 */
const vertexShader = glsl`
${assembleChunk}

attribute float aOriginY;
attribute float aNodeSeed;
attribute float aSegmentSeed;
attribute float aSide;

varying float vSide;
varying float vSegmentSeed;
varying float vFlight;
varying float vDepth;
varying float vSpread;

void main() {
  float flight;
  float spread;
  vec3 local = assemble(position, aOriginY, aNodeSeed, flight, spread);
  vec4 viewPosition = modelViewMatrix * vec4(local, 1.0);
  gl_Position = projectionMatrix * viewPosition;

  vSide = aSide;
  vSegmentSeed = aSegmentSeed;
  vFlight = flight;
  vSpread = spread;
  vDepth = -viewPosition.z;
}
`;

const fragmentShader = glsl`
${depthFogChunk}

uniform float uTime;
uniform float uOpacity;

varying float vSide;
varying float vSegmentSeed;
varying float vFlight;
varying float vDepth;
varying float vSpread;

void main() {
  float carriesSignal = step(0.7, vSegmentSeed);
  float speed = 0.3 + vSegmentSeed * 0.5;
  float head = fract(uTime * speed + vSegmentSeed * 13.0);
  float along = mix(vSide, 1.0 - vSide, step(0.85, vSegmentSeed)); // alguns sinais vão no sentido oposto
  float x = along - head;
  float pulse = exp(-x * x * 300.0) * carriesSignal;

  vec3 color = vec3(0.18, 0.4, 0.85) * (0.12 + vFlight * 0.2)
             + vec3(0.7, 0.9, 1.0) * pulse * 1.6;

  // Quadrático: linhas esticadas em voo se sobrepõem mais que os nós.
  gl_FragColor = vec4(color * vSpread * vSpread * depthFog(vDepth) * uOpacity, 1.0);
  #include <colorspace_fragment>
}
`;

export const SynapseMaterial = shaderMaterial(
  {
    uTime: 0,
    uOpacity: 0,
    uAssemble: 0,
    uBeamHalfHeight: 1,
    uFogNear: 10,
    uFogFar: 30,
  },
  vertexShader,
  fragmentShader,
  (material) => {
    if (!material) return;
    material.transparent = true;
    material.depthWrite = false;
    material.blending = AdditiveBlending;
  },
);

export type SynapseMaterialImpl = InstanceType<typeof SynapseMaterial>;

extend({ SynapseMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    synapseMaterial: ThreeElement<typeof SynapseMaterial>;
  }
}
