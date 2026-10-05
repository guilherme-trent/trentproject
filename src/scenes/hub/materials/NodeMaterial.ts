import { AdditiveBlending } from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend, type ThreeElement } from '@react-three/fiber';
import { glsl } from '@/shaders/glsl';
import { assembleChunk } from '../chunks/assemble.glsl';
import { depthFogChunk } from '../chunks/depthFog.glsl';

/**
 * Material dos nós (InstancedMesh).
 *
 * Cada instância é um quad billboard: o vertex shader expande os cantos em
 * VIEW SPACE, então o quad sempre encara a câmera sem custo de CPU. O
 * fragment desenha um brilho radial (núcleo + halo) — mais bonito e muito mais
 * barato que uma esfera de dezenas de triângulos por nó.
 *
 * Sem `discard`: pixels fora do disco somam 0 no blending aditivo. `discard`
 * desativaria otimizações de early-z/HSR em GPUs móveis (tile-based).
 */
const vertexShader = glsl`
${assembleChunk}

attribute float aSeed;
attribute float aOriginY;

uniform float uTime;
uniform float uSize;

varying vec2 vUv;
varying float vSeed;
varying float vEnergy;
varying float vDepth;
varying float vSpread;

void main() {
  // Posição final e escala vêm da instanceMatrix (escrita uma vez na CPU).
  vec3 target = instanceMatrix[3].xyz;
  float scale = length(instanceMatrix[0].xyz);

  float flight;
  float spread;
  vec3 local = assemble(target, aOriginY, aSeed, flight, spread);
  vec4 viewPosition = modelViewMatrix * vec4(local, 1.0);

  // "Disparo" neural: picos raros e curtos (potência alta sobre uma senoide por nó).
  float fire = pow(0.5 + 0.5 * sin(uTime * (0.4 + aSeed * 1.6) + aSeed * 40.0), 16.0);

  viewPosition.xy += position.xy * scale * uSize * (1.0 + fire * 0.9 + flight * 0.3);
  gl_Position = projectionMatrix * viewPosition;

  vUv = uv;
  vSeed = aSeed;
  vEnergy = fire + flight * 0.5;
  vSpread = spread;
  vDepth = -viewPosition.z;
}
`;

const fragmentShader = glsl`
${depthFogChunk}

uniform float uOpacity;

varying vec2 vUv;
varying float vSeed;
varying float vEnergy;
varying float vDepth;
varying float vSpread;

void main() {
  float d = length(vUv - 0.5) * 2.0;
  float core = smoothstep(0.35, 0.0, d);
  float halo = exp(-d * d * 5.0) * (1.0 - smoothstep(0.8, 1.0, d)) * 0.3;

  vec3 tint = mix(vec3(0.25, 0.65, 1.0), vec3(0.6, 0.4, 1.0), vSeed);
  vec3 color = tint * halo + mix(tint, vec3(1.0), 0.65) * core;
  color *= (0.8 + vEnergy * 2.0) * vSpread;

  gl_FragColor = vec4(color * depthFog(vDepth) * uOpacity, 1.0);
  #include <colorspace_fragment>
}
`;

export const NodeMaterial = shaderMaterial(
  {
    uTime: 0,
    uSize: 1,
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

export type NodeMaterialImpl = InstanceType<typeof NodeMaterial>;

extend({ NodeMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    nodeMaterial: ThreeElement<typeof NodeMaterial>;
  }
}
