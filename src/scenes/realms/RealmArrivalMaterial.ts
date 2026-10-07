import {
  AddEquation,
  Color,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
} from 'three';
import { glsl, int } from '@/shaders/glsl';
import { FULLSCREEN_VERTEX, SCREEN_SPACE_CHUNK } from '@/shaders/fullscreen';
import { commonChunk } from '@/shaders/chunks/common.glsl';
import { simplexChunk } from '@/shaders/chunks/simplex.glsl';
import { blueprintChunk, streaksChunk } from '../shared/transitions/chunks.glsl';
import type { RiftTransitionKind } from '../shared/pillars';
import type { RGB } from '../shared/palette';

const ARRIVAL: Record<RiftTransitionKind, number> = { shatter: 1, warp: 2, swallow: 3 };

/** Duração da chegada: o espelho do ritmo de cada saída. */
export const ARRIVAL_SECONDS: Record<RiftTransitionKind, number> = { shatter: 1.4, warp: 1.2, swallow: 1.6 };

/**
 * A chegada a um reino — o espelho da transição que trouxe o usuário.
 * Cada variante começa EXATAMENTE onde o efeito de saída terminou (mesmos
 * chunks GLSL, mesmos parâmetros), então a troca de cena não tem costura:
 *
 *   SHATTER  o vazio-planta revelado pelos cacos se dissolve, revelando o reino por baixo.
 *   WARP     saída do hiperespaço: as estrias desaceleram, a luz do túnel se apaga.
 *   SWALLOW  o tecido líquido que cobriu a tela se ABRE a partir do centro,
 *            com a borda ondulando (o negativo do Engolido).
 *
 * A variante é escolhida por #define: só o código da transição usada é compilado.
 * Blending pré-multiplicado: o líquido do Swallow cobre (alpha), a luz soma.
 */
const fragmentShader = glsl`
uniform float uProgress; // 0 = continuação da saída, 1 = reino revelado
uniform float uAspect;
uniform float uTime;
uniform vec3 uColor;

varying vec2 vUv;

${commonChunk}
${SCREEN_SPACE_CHUNK}
${simplexChunk}
${blueprintChunk}
${streaksChunk}

void main() {
  vec2 p = screenSpace(vUv, uAspect);
  float r = length(p);
  vec3 hot = mix(uColor, vec3(1.0), 0.6);
  vec3 color;
  float coverage = 0.0;

#if ARRIVAL == 1
  // O vazio-planta COBRE o reino e se dissolve: o mundo aparece por baixo dele,
  // não de uma vez (o último frame do Shatter é o vazio sobre preto).
  coverage = 1.0 - smoothstep(0.0, 1.0, uProgress);
  color = blueprintVoid(vUv, uAspect, uTime, uColor) * coverage;
#elif ARRIVAL == 2
  float decel = (1.0 - uProgress) * (1.0 - uProgress);
  coverage = decel;
  float streaks = hyperStreaks(p, uTime * (1.0 + 9.0 * decel)) * decel * 3.0;
  color = hot * streaks + hot * exp(-r * r * mix(2.5, 60.0, uProgress)) * decel * 3.5;
#else
  float opening = smoothstep(0.0, 1.0, uProgress);
  float radius = opening * opening * 1.5;
  float wobble = snoise(vec3(p * 2.5, uTime * 1.5)) * 0.08 * (1.0 - opening * 0.5);
  float edgeDistance = r + wobble - radius;
  coverage = smoothstep(-0.02, 0.02, edgeDistance);
  vec3 liquid = uColor * uColor * 0.62 * (0.85 + 0.15 * sin(uTime * 2.5 + vUv.y * 7.0));
  color = liquid * coverage + hot * exp(-pow(edgeDistance / 0.035, 2.0)) * 2.0 * (1.0 - opening);
#endif

  gl_FragColor = vec4(color, coverage);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class RealmArrivalMaterial extends ShaderMaterial {
  constructor(color: RGB, kind: RiftTransitionKind) {
    super({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader,
      defines: { ARRIVAL: int(ARRIVAL[kind]) },
      uniforms: {
        uProgress: { value: 0 },
        uAspect: { value: 1 },
        uTime: { value: 0 },
        uColor: { value: new Color(...color) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
  }

  setFrame(progress: number, aspect: number, time: number) {
    this.uniforms.uProgress.value = progress;
    this.uniforms.uAspect.value = aspect;
    this.uniforms.uTime.value = time;
  }
}
