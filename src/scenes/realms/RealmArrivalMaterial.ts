import { AdditiveBlending, Color, ShaderMaterial } from 'three';
import { glsl } from '@/shaders/glsl';
import { FULLSCREEN_VERTEX, SCREEN_SPACE_CHUNK } from '@/shaders/fullscreen';
import type { RGB } from '../shared/palette';

/**
 * A chegada a um reino: a tela começa tomada pela luz do nexus (o último
 * frame do mergulho) e ela se retrai num ponto, revelando o escuro do reino.
 * É o espelho do mergulho — a costura da transição hub → reino.
 */
const fragmentShader = glsl`
uniform float uProgress; // 0 = luz total, 1 = luz recolhida
uniform float uAspect;
uniform vec3 uColor;

varying vec2 vUv;

${SCREEN_SPACE_CHUNK}

void main() {
  vec2 p = screenSpace(vUv, uAspect);
  float r = length(p);
  // max(): smoothstep com bordas iguais é indefinido em GLSL (alguns drivers devolvem 1).
  float radius = max(mix(1.6, 0.0, uProgress), 1e-3);
  float light = smoothstep(radius, radius * 0.35, r) * (1.0 - uProgress);
  vec3 color = mix(uColor, vec3(1.0), 0.35) * light * 3.0 + uColor * exp(-r * r * 40.0) * 0.6;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class RealmArrivalMaterial extends ShaderMaterial {
  constructor(color: RGB) {
    super({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader,
      uniforms: {
        uProgress: { value: 0 },
        uAspect: { value: 1 },
        uColor: { value: new Color(...color) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    });
  }

  setFrame(progress: number, aspect: number) {
    this.uniforms.uProgress.value = progress;
    this.uniforms.uAspect.value = aspect;
  }
}
