import { AdditiveBlending } from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend, type ThreeElement } from '@react-three/fiber';
import { float, glsl } from '@/shaders/glsl';
import { FULLSCREEN_VERTEX, SCREEN_SPACE_CHUNK } from '@/shaders/fullscreen';
import { energyBeamChunk } from '@/shaders/chunks/energyBeam.glsl';
import { BEAM_HANDOFF } from '../../shared/handoff';

/**
 * O feixe remanescente: o mesmo `energyBeam()` da intro, travado no estado de
 * handoff (ponta abaixo da tela), dissolvendo enquanto os nós estilhaçam.
 * Mesmo pipeline de saída da intro (ACES + sRGB) para o pixel bater 1:1.
 */
const fragmentShader = glsl`
uniform float uTime;
uniform float uAspect;
uniform float uIntensity;

varying vec2 vUv;

${SCREEN_SPACE_CHUNK}
${energyBeamChunk}

void main() {
  vec2 p = screenSpace(vUv, uAspect);
  gl_FragColor = vec4(energyBeam(p, uTime, ${float(BEAM_HANDOFF.headY)}, uIntensity), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// `type` (não `interface`): só aliases satisfazem a assinatura de índice que o drei exige.
type BeamRemnantUniforms = {
  uTime: number;
  uAspect: number;
  uIntensity: number;
};

// Anotação explícita: sem ela, `as const` do handoff tiparia os uniforms como literais (3.1, 1).
const uniforms: BeamRemnantUniforms = {
  uTime: BEAM_HANDOFF.time,
  uAspect: 1,
  uIntensity: BEAM_HANDOFF.intensity,
};

export const BeamRemnantMaterial = shaderMaterial(
  uniforms,
  FULLSCREEN_VERTEX,
  fragmentShader,
  (material) => {
    if (!material) return;
    material.transparent = true;
    material.depthTest = false;
    material.depthWrite = false;
    material.blending = AdditiveBlending; // soma com os nós em vez de cobri-los
  },
);

export type BeamRemnantMaterialImpl = InstanceType<typeof BeamRemnantMaterial>;

extend({ BeamRemnantMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    beamRemnantMaterial: ThreeElement<typeof BeamRemnantMaterial>;
  }
}
