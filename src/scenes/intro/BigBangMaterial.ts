import { shaderMaterial } from '@react-three/drei';
import { extend, type ThreeElement } from '@react-three/fiber';
import { float, glsl } from '@/shaders/glsl';
import { FULLSCREEN_VERTEX, SCREEN_SPACE_CHUNK } from '@/shaders/fullscreen';
import { energyBeamChunk } from '@/shaders/chunks/energyBeam.glsl';
import { emberChunk } from './chunks/ember.glsl';
import { starDustChunk } from './chunks/starDust.glsl';
import { shockwaveChunk } from './chunks/shockwave.glsl';

/** Força máxima do deslocamento de refração (em unidades de altura de tela). */
const REFRACTION_STRENGTH = 0.05;
/** Dispersão por canal: o azul refrata mais que o vermelho, como num prisma. */
const DISPERSION = { r: 1.0, g: 1.3, b: 1.6 } as const;

/**
 * Material do Big Bang: a cena INTEIRA é este fragment shader num passe de tela cheia.
 *
 * Composição:
 *   cosmos(p)  = feixe + centelha + poeira revelada pela onda
 *   refração   = cosmos amostrado em p deslocado por shockLens, 3× com
 *                deslocamentos diferentes por canal (aberração cromática)
 *   + luz do anel + flash do impacto → ACES tone mapping → sRGB
 *
 * A amostragem tripla só acontece onde a lente tem efeito (branch coerente:
 * pixels vizinhos tomam o mesmo caminho, então a GPU não paga divergência).
 */
const fragmentShader = glsl`
uniform float uTime;
uniform float uAspect;
uniform float uEmber;
uniform float uBeamHead;
uniform float uBeam;
uniform float uShock;
uniform float uFlash;
uniform float uDust;

varying vec2 vUv;

${SCREEN_SPACE_CHUNK}
${energyBeamChunk}
${emberChunk}
${starDustChunk}
${shockwaveChunk}

vec3 cosmos(vec2 p, float frontRadius) {
  vec3 color = energyBeam(p, uTime, uBeamHead, uBeam) + ember(p, uTime, uEmber);
  // A poeira só existe onde a frente de onda já passou (iluminada pela explosão).
  float revealed = smoothstep(frontRadius + 0.05, frontRadius - 0.25, length(p));
  return color + starDust(p, uTime) * uDust * revealed;
}

void main() {
  vec2 p = screenSpace(vUv, uAspect);
  float r = length(p);

  float maxRadius = 0.5 * length(vec2(uAspect, 1.0)) + 0.2; // sai inteira da tela
  float radius = uShock * maxRadius;
  float width = 0.03 + 0.07 * uShock;                        // a frente alarga ao viajar
  float alive = step(0.0001, uShock) * (1.0 - uShock);       // dissipa ao expandir

  float lens = shockLens(r, radius, width) * alive;
  vec3 color;
  if (abs(lens) > 0.002) {
    vec2 offset = (p / max(r, 1e-4)) * lens * ${float(REFRACTION_STRENGTH)};
    color = vec3(
      cosmos(p - offset * ${float(DISPERSION.r)}, radius).r,
      cosmos(p - offset * ${float(DISPERSION.g)}, radius).g,
      cosmos(p - offset * ${float(DISPERSION.b)}, radius).b
    );
  } else {
    color = cosmos(p, radius);
  }

  color += vec3(0.6, 0.85, 1.0) * shockRing(r, radius, width * 0.2) * alive * 1.6;
  color += vec3(0.85, 0.92, 1.0) * uFlash * (exp(-r * r * 22.0) * 2.2 + 0.05);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const BigBangMaterial = shaderMaterial(
  {
    uTime: 0,
    uAspect: 1,
    uEmber: 0,
    uBeamHead: 0.6,
    uBeam: 0,
    uShock: 0,
    uFlash: 0,
    uDust: 0,
  },
  FULLSCREEN_VERTEX,
  fragmentShader,
  (material) => {
    if (!material) return;
    // Passe de tela cheia: não participa do depth buffer.
    material.depthTest = false;
    material.depthWrite = false;
  },
);

export type BigBangMaterialImpl = InstanceType<typeof BigBangMaterial>;

extend({ BigBangMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    bigBangMaterial: ThreeElement<typeof BigBangMaterial>;
  }
}
