import {
  AddEquation,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Vector2,
} from 'three';
import { glsl, vec3 } from '@/shaders/glsl';
import { PALETTE } from './palette';

/**
 * O PULSO — a transição de luz sem tela branca. Uma frente circular corre
 * do ponto de origem até o canto mais distante: atrás dela, escuro (modo
 * cobrir) ou a cena (modo revelar); NA frente, uma faixa fina de luz
 * esmeralda em HDR com um rastro curto (o bloom a transforma num anel de
 * energia). A saída de um reino cobre; a chegada à hub revela.
 * Triângulo de tela cheia; fora da transição, colapsa no vertex shader.
 */
export class PulseWipeMaterial extends ShaderMaterial {
  constructor(reveal: boolean) {
    super({
      vertexShader: glsl`
        uniform float uProgress;
        varying vec2 vUv;
        void main() {
          if (uProgress <= 0.0 || uProgress >= 1.0 && ${reveal ? 'true' : 'false'}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: glsl`
        uniform float uProgress;
        uniform vec2 uOrigin;
        uniform float uAspect;
        varying vec2 vUv;
        void main() {
          vec2 aspect = vec2(uAspect, 1.0);
          float r = length((vUv - uOrigin) * aspect);
          float reach = length(max(uOrigin, 1.0 - uOrigin) * aspect) + 0.08;
          float front = uProgress * reach;
          float behind = 1.0 - smoothstep(front - 0.015, front, r);
          float dark = ${reveal ? '1.0 - behind' : 'behind'};
          float band = (exp(-pow((r - front) / 0.008, 2.0)) * 3.2 + exp(-abs(r - front) * 22.0) * 0.7)
                     * smoothstep(0.0, 0.05, uProgress) * (1.0 - smoothstep(0.9, 1.0, uProgress));
          vec3 light = mix(${vec3(PALETTE.emerald)}, vec3(0.75, 1.0, 0.95), 0.45) * band;
          gl_FragColor = vec4(light, dark);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      uniforms: { uProgress: { value: 0 }, uOrigin: { value: new Vector2(0.5, 0.5) }, uAspect: { value: 1 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
  }

  setState(progress: number, aspect: number, originX = 0.5, originY = 0.5) {
    this.uniforms.uProgress.value = progress;
    this.uniforms.uAspect.value = aspect;
    this.uniforms.uOrigin.value.set(originX, originY);
  }
}
