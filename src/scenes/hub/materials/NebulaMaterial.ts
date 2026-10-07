import { HalfFloatType, LinearFilter, ShaderMaterial, Vector2, WebGLRenderTarget, type Texture } from 'three';
import { float, glsl, vec3 } from '@/shaders/glsl';
import { FULLSCREEN_VERTEX, SCREEN_SPACE_CHUNK } from '@/shaders/fullscreen';
import { simplexChunk } from '@/shaders/chunks/simplex.glsl';
import { commonChunk } from '@/shaders/chunks/common.glsl';
import type { PerformanceTier } from '@/engine/config/performance';
import { PALETTE } from '../../shared/palette';
import type { HubUniforms } from '../uniforms';

/** Fração do crescimento da árvore em que a nebulosa termina de surgir. */
const NEBULA_FADE_END = 0.75;

/** Oitavas de fBm por tier: o custo da nebulosa é quase todo aqui (fragment de tela cheia). */
const OCTAVES: Record<PerformanceTier, number> = { high: 3, mid: 2, low: 1 };

/**
 * A Nebulosa — fumaça cósmica de fundo, sem volumetria.
 *
 * Um passe de tela cheia com simplex 3D (x, y, tempo): a terceira dimensão
 * faz a fumaça EVOLUIR de forma, não só deslizar. Um "domain warp" leve
 * (o ruído deslocando as coordenadas do próprio ruído) dá a aparência de fluido.
 *
 * Barato por construção:
 *   - renderizada em 1/4 da resolução (1/16 dos pixels) num render target e
 *     ampliada com filtro bilinear (NebulaCompositeMaterial). A fumaça é de
 *     baixa frequência: a ampliação é invisível. Medido numa Intel UHD: a
 *     nebulosa em resolução cheia custava 5.6ms dos 16.7ms do frame;
 *   - atualizada um frame sim, um não (ela se move devagar);
 *   - 1 triângulo, 1 draw call, depth desligado;
 *   - 1 amostra de ruído para warp + matiz, mais 3/2/1 oitavas de fBm por tier
 *     via #define (o loop é desenrolado pelo compilador);
 *   - brilho máximo ≈ 0.15: fica ABAIXO do limiar do Bloom, então a fumaça
 *     nunca floresce — só as linhas do tempo se destacam contra ela.
 *
 * Paralaxe: o fundo desliza levemente com a câmera (`uOffset`), dando
 * profundidade sem nenhuma geometria.
 *
 * Fade-in: a opacidade acompanha o crescimento da árvore (`uGrowth`,
 * compartilhado) — a fumaça surge com o nascimento dela, não de uma vez após
 * a onda de choque. Voltando de um reino, `uGrowth` já é 1: sem fade.
 */
const fragmentShader = glsl`
uniform float uTime;
uniform float uAspect;
uniform vec2 uOffset;
uniform float uWarp;
uniform float uGrowth;

varying vec2 vUv;

// Necessário mesmo usando só \`saturate\`: com o bloom ativo o three compila a
// variante SEM tone mapping, e é o tonemapping_pars que normalmente define a macro.
${commonChunk}
${SCREEN_SPACE_CHUNK}
${simplexChunk}

float smokeFbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < NEBULA_OCTAVES; i++) {
    value += amplitude * snoise(p);
    p = p * 2.02 + vec3(13.1, 7.7, 3.3);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 screen = screenSpace(vUv, uAspect);
  vec2 p = screen + uOffset;
  float t = uTime * 0.02;

  // UMA amostra de ruído faz três trabalhos: deforma o domínio (warp), e
  // decide o matiz. Antes eram três amostras separadas — a nebulosa é um
  // fragment de tela cheia, então cada snoise() a menos é ~1M de avaliações a menos por frame.
  float field = snoise(vec3(p * 1.1, t));
  vec2 warp = vec2(field, -field) * 0.35;
  float smoke = smokeFbm(vec3(p * 2.0 + warp, t * 1.5));
  float tintField = field;

  float density = smoothstep(-0.15, 0.75, smoke);
  vec3 tint = mix(${vec3(PALETTE.emerald)} * 0.3, ${vec3(PALETTE.sky)} * 0.4, smoothstep(-0.4, 0.6, tintField));
  tint += ${vec3(PALETTE.gold)} * pow(saturate(smoke - 0.35), 2.0) * 0.8; // veios dourados

  // A árvore "ilumina" a fumaça atrás dela.
  float r = length(screen - vec2(0.0, 0.05));
  float treeGlow = exp(-r * r * 3.5);
  vec3 color = tint * density * (0.1 + 0.35 * treeGlow) + ${vec3(PALETTE.emerald)} * 0.05 * treeGlow;

  // Saída linear crua: tone mapping e sRGB acontecem na composição (resolução cheia).
  // Atinge 1 em ~75% do crescimento (≈2.5s); o quadrado alonga o início no escuro.
  float fadeIn = smoothstep(0.0, ${float(NEBULA_FADE_END)}, uGrowth);
  fadeIn *= fadeIn;
  gl_FragColor = vec4(color * fadeIn * (1.0 - uWarp), 1.0);
}
`;

/** Fração da resolução do drawing buffer em que a fumaça é calculada. */
export const NEBULA_RESOLUTION = 0.25;

/** Render target da fumaça: HalfFloat evita banding nos gradientes escuros antes da ampliação. */
export function createNebulaTarget() {
  return new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    depthBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
}

/** Amplia a fumaça de baixa resolução para a tela, com dithering contra banding. */
const compositeFragment = glsl`
uniform sampler2D uNebula;

varying vec2 vUv;

${commonChunk}

void main() {
  vec3 color = texture2D(uNebula, vUv).rgb;
  color += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(max(color, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class NebulaCompositeMaterial extends ShaderMaterial {
  constructor(nebula: Texture) {
    super({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: compositeFragment,
      uniforms: { uNebula: { value: nebula } },
      depthTest: false,
      depthWrite: false,
    });
  }
}

export class NebulaMaterial extends ShaderMaterial {
  constructor(shared: HubUniforms, tier: PerformanceTier) {
    super({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader,
      defines: { NEBULA_OCTAVES: OCTAVES[tier] },
      uniforms: {
        uTime: shared.uTime,
        uWarp: shared.uWarp,
        uGrowth: shared.uGrowth,
        uAspect: { value: 1 },
        uOffset: { value: new Vector2() },
      },
      depthTest: false,
      depthWrite: false,
    });
  }

  setAspect(aspect: number) {
    this.uniforms.uAspect.value = aspect;
  }

  setOffset(x: number, y: number) {
    (this.uniforms.uOffset.value as Vector2).set(x, y);
  }

  /** Troca de tier recompila o programa — raro, e só acontece junto de uma queda de qualidade. */
  setTier(tier: PerformanceTier) {
    if (this.defines.NEBULA_OCTAVES === OCTAVES[tier]) return;
    this.defines.NEBULA_OCTAVES = OCTAVES[tier];
    this.needsUpdate = true;
  }
}
