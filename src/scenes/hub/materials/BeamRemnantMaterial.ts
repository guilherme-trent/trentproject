import { AdditiveBlending, ShaderMaterial } from 'three';
import { float, glsl } from '@/shaders/glsl';
import { FULLSCREEN_VERTEX, SCREEN_SPACE_CHUNK } from '@/shaders/fullscreen';
import { energyBeamChunk } from '@/shaders/chunks/energyBeam.glsl';
import { BEAM_HANDOFF } from '../../shared/handoff';

/**
 * O feixe remanescente: o mesmo `energyBeam()` da intro, travado no estado de
 * handoff (ponta abaixo da tela), dissolvendo enquanto a árvore brota dele.
 * Mesmo pipeline de saída da intro para o pixel bater 1:1 na troca de cena.
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

export class BeamRemnantMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader,
      uniforms: {
        uTime: { value: BEAM_HANDOFF.time },
        uAspect: { value: 1 },
        uIntensity: { value: BEAM_HANDOFF.intensity },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending, // soma com a árvore em vez de cobri-la
    });
  }

  setFrame(time: number, intensity: number, aspect: number) {
    this.uniforms.uTime.value = time;
    this.uniforms.uIntensity.value = intensity;
    this.uniforms.uAspect.value = aspect;
  }
}
