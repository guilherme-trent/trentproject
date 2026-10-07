import { AddEquation, Color, CustomBlending, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial } from 'three';
import { glsl } from '@/shaders/glsl';

/**
 * Véu de tela cheia (triângulo único, sem câmera): uma cor sólida com alpha,
 * pré-multiplicada. Usado nas costuras de luz entre cenas — o reino se apaga
 * em branco e a hub nasce do mesmo branco. Com alpha 0 o vertex shader
 * colapsa o triângulo: nenhum pixel pago.
 */
export class VeilMaterial extends ShaderMaterial {
  constructor(color: Color = new Color(1, 1, 1)) {
    super({
      vertexShader: glsl`
        uniform float uAlpha;
        void main() { gl_Position = uAlpha <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: glsl`
        uniform float uAlpha;
        uniform vec3 uColor;
        void main() {
          gl_FragColor = vec4(uColor * uAlpha, uAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      uniforms: { uAlpha: { value: 0 }, uColor: { value: color } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
  }

  setAlpha(alpha: number) {
    this.uniforms.uAlpha.value = alpha;
  }
}
