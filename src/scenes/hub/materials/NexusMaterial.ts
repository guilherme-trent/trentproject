import { AdditiveBlending, Color, ShaderMaterial } from 'three';
import { glsl } from '@/shaders/glsl';
import type { RGB } from '../../shared/palette';
import type { HubUniforms } from '../uniforms';

/**
 * Material de um Nexus Point: um billboard (quad que sempre encara a câmera)
 * desenhando núcleo, halo, anel rotativo e raios — tudo procedural.
 *
 *   uHover → o nexus incha e acende (amortecido na CPU, 1 float por frame)
 *   uFocus → o mergulho: a luz do nexus cresce até engolir a tela
 *   uGrowth (compartilhado) → os Nexus só aparecem quando a árvore termina de brotar
 *
 * Desenhado por cima de tudo (depthTest off, renderOrder alto): é a luz para
 * onde a câmera mergulha, nada pode ocluí-la.
 */
const vertexShader = glsl`
uniform float uTime;
uniform float uSize;
uniform float uHover;

varying vec2 vUv;

void main() {
  vec4 viewPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float breathe = 1.0 + 0.06 * sin(uTime * 2.0);
  viewPosition.xy += position.xy * uSize * breathe * (1.0 + uHover * 0.35);
  gl_Position = projectionMatrix * viewPosition;
  vUv = uv;
}
`;

const fragmentShader = glsl`
uniform float uTime;
uniform float uHover;
uniform float uFocus;
uniform float uGrowth;
uniform vec3 uColor;

varying vec2 vUv;

void main() {
  vec2 q = vUv - 0.5;
  float d = length(q) * 2.0;
  float angle = atan(q.y, q.x);

  float core = exp(-d * d * 36.0) * 2.2;
  float halo = exp(-d * d * 4.0) * 1.1;
  float ringRadius = 0.62 + 0.04 * sin(uTime * 1.5);
  float ring = smoothstep(0.035, 0.0, abs(d - ringRadius))
             * (0.6 + 0.4 * sin(angle * 6.0 + uTime * 1.2))
             * (0.5 + uHover);
  float rays = pow(abs(sin(angle * 4.0 + uTime * 0.3)), 40.0) * exp(-d * 2.5) * 0.8;

  float reveal = smoothstep(0.85, 1.0, uGrowth);
  vec3 color = (uColor * (halo + ring * 1.5 + rays) + vec3(1.0) * core) * (1.0 + uHover * 0.8) * reveal;
  // Mergulho: a luz do pilar cresce sem limite e, com o Bloom, satura a tela.
  color += mix(uColor, vec3(1.0), 0.35) * uFocus * uFocus * 8.0 * exp(-d * d * 1.5);

  // Máscara circular: sem ela, as caudas das exponenciais revelam o quad do billboard.
  color *= 1.0 - smoothstep(0.8, 1.0, d);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class NexusMaterial extends ShaderMaterial {
  constructor(shared: HubUniforms, color: RGB, size: number) {
    super({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: shared.uTime,
        uGrowth: shared.uGrowth,
        uSize: { value: size },
        uHover: { value: 0 },
        uFocus: { value: 0 },
        uColor: { value: new Color(...color) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    });
  }

  setHover(level: number) {
    this.uniforms.uHover.value = level;
  }

  setFocus(level: number) {
    this.uniforms.uFocus.value = level;
  }
}
