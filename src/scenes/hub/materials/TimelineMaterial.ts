import { AdditiveBlending, ShaderMaterial } from 'three';
import { float, glsl, vec3 } from '@/shaders/glsl';
import { PALETTE } from '../../shared/palette';
import { growthChunk } from '../chunks/growth.glsl';
import { depthFogChunk } from '../chunks/depthFog.glsl';
import type { HubUniforms } from '../uniforms';

/**
 * Onde (|região|: 0 meio do tronco → 1 ponta) os fios começam a sumir no escuro.
 * As raízes somem antes: o fundo deve parecer não ter fim.
 */
const TIP_FADE = { canopy: 0.68, roots: 0.5 } as const;

/**
 * Material das LINHAS DO TEMPO — os milhares de fios da Yggdrasil.
 *
 * Toda a vida dos fios acontece aqui, na GPU, a partir de UM uniform de tempo:
 *   vertex   → crescimento a partir do feixe + balanço orgânico (pontas vivas,
 *              tronco firme) + ~6% de fios "soltos": o caos que o TPM orquestra.
 *   fragment → pacotes de luz subindo das raízes à copa (o tempo fluindo),
 *              respiração por fio, núcleo branco-quente que se colore rumo às
 *              pontas (esmeralda → celeste, com fios dourados) e, nas pontas,
 *              fade até zero: galhos e raízes não "terminam" — dissolvem no espaço.
 *
 * A CPU não toca em nenhum vértice depois do upload. Nenhum re-render, nenhuma
 * alocação por frame — o GC do JavaScript não tem o que coletar.
 *
 * Brilho: cada fio é fraco (≈0.09); o tronco brilha pela SOMA aditiva de
 * milhares de fios sobrepostos — e é essa soma (HDR > 1) que o Bloom captura.
 */
const vertexShader = glsl`
${growthChunk}

/**
 * x: semente · y: t ao longo do fio (0 raiz → 1 copa) · z: região assinada ·
 * w: galho principal (+10 nos fios do CAULE de um fruto, que usam este mesmo
 * material: o caule é luz da árvore, não um objeto à parte).
 */
attribute vec4 aThread;

uniform float uTime;

varying float vSeed;
varying float vT;
varying float vRegion;
varying float vGrown;
varying float vFront;
varying float vDepth;
varying float vBranch;

void main() {
  float seed = aThread.x;
  float reach = abs(aThread.z);

  // Balanço: cresce com o quadrado da distância ao tronco.
  float loose = step(0.94, seed);
  float sway = reach * reach * (0.12 + loose * 0.85);
  vec3 p = position;
  p.x += sin(uTime * 0.6 + p.y * 0.9 + seed * 6.2831) * sway;
  p.z += cos(uTime * 0.5 + p.y * 0.7 + seed * 4.0) * sway;
  p.y += sin(uTime * 0.4 + p.x * 0.5 + seed * 3.0) * sway * 0.4;

  float grown;
  float front;
  p = grow(p, reach, seed, grown, front);

  vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewPosition;

  vSeed = seed;
  vT = aThread.y;
  vRegion = aThread.z;
  vGrown = grown;
  vFront = front;
  vDepth = -viewPosition.z;
  vBranch = aThread.w;
}
`;

const fragmentShader = glsl`
${depthFogChunk}

uniform float uTime;
uniform float uWarp;
uniform float uPixelRatio;
uniform float uSurgeFront;
uniform float uSurgeBranch;
uniform float uSurgeFork;
uniform float uFlare;
uniform float uHush;

varying float vSeed;
varying float vT;
varying float vRegion;
varying float vGrown;
varying float vFront;
varying float vDepth;
varying float vBranch;

/**
 * O pulso do despertar: uma frente quente que sobe pela região do fio, com
 * um rastro que esfria atrás dela. Até o alto do tronco TODO fio conduz; daí
 * em diante só os fios do galho-alvo; passada a forquilha, só o caule — a
 * luz escolhe o caminho até o fruto, num único pulso contínuo.
 */
float surge() {
  float isStem = step(9.5, vBranch);
  float onBranch = step(abs(vBranch - isStem * 10.0 - uSurgeBranch), 0.5);
  float onPath = mix(1.0, onBranch, smoothstep(0.06, 0.2, vRegion));
  onPath *= mix(1.0, isStem, smoothstep(uSurgeFork - 0.015, uSurgeFork + 0.015, vRegion));
  float ahead = vRegion - uSurgeFront;
  float front = exp(-ahead * ahead / 0.0025);
  // min(ahead, 0): com a frente inativa (−9), exp(ahead·9) estouraria para +∞ em
  // float32 e 0 × ∞ = NaN — que o bloom espalha em blocos pretos pela tela (medido).
  float trail = step(ahead, 0.0) * exp(min(ahead, 0.0) * 9.0) * 0.12;
  return (front * 1.3 + trail) * onPath;
}

void main() {
  // Linhas do tempo fluindo: ~9 pacotes de luz por fio, subindo para a copa.
  float speed = 0.35 + vSeed * 0.3;
  float packet = pow(0.5 + 0.5 * sin((vT * 9.0 - uTime * speed + vSeed * 31.0) * 6.2831), 28.0);
  float breathe = 0.75 + 0.25 * sin(uTime * 0.8 + vSeed * 6.2831);

  vec3 emerald = ${vec3(PALETTE.emerald)};
  vec3 sky = ${vec3(PALETTE.sky)};
  vec3 gold = ${vec3(PALETTE.gold)};
  vec3 deepRoot = ${vec3(PALETTE.deepRoot)};

  vec3 canopyTint = mix(emerald, sky, smoothstep(0.15, 0.85, vRegion));
  vec3 rootTint = mix(emerald, deepRoot, smoothstep(0.15, 0.85, -vRegion));
  vec3 tint = mix(rootTint, canopyTint, step(0.0, vRegion));
  float isGold = step(0.9, fract(vSeed * 7.31)); // ~10% dos fios: toques de ouro
  tint = mix(tint, gold, isGold);
  // Núcleo branco-quente: perto do tronco, a cor cede ao branco.
  tint = mix(tint, vec3(1.0), (1.0 - smoothstep(0.0, 0.4, abs(vRegion))) * 0.55);

  float intensity = 0.04 * breathe + packet * (1.1 + isGold);
  vec3 color = tint * intensity + gold * vFront * 0.12; // frente de crescimento dourada
  // Branch UNIFORME (mesmo valor para todos os fragmentos): fora de um despertar,
  // a árvore — milhares de linhas sobrepostas — não paga um único exp() a mais.
  // uHush entra na condição: a árvore escurece ANTES de o pulso partir (sem
  // ela, o escurecimento só aparecia quando a frente surgia — de uma vez).
  if (uSurgeFront > -2.0 || uFlare > 0.001 || uHush > 0.001) {
    color *= 1.0 - uHush * 0.82;
    color += mix(vec3(1.0), tint, 0.35) * surge() + tint * uFlare * 0.25;
  }

  // Compensação de densidade: enquanto colapsados no eixo, milhares de fios
  // somados saturariam o bloom num borrão; o brilho cresce conforme se abrem.
  float density = mix(0.2, 1.0, vGrown);

  // Ilusão de infinito: as pontas dissolvem em opacidade 0.
  float fadeStart = mix(${float(TIP_FADE.roots)}, ${float(TIP_FADE.canopy)}, step(0.0, vRegion));
  float tipFade = 1.0 - smoothstep(fadeStart, 1.0, abs(vRegion));
  tipFade *= tipFade; // cauda longa: some devagar, sem borda perceptível

  float visibility = smoothstep(0.0, 0.25, vGrown) * density * tipFade * depthFog(vDepth) * (1.0 - uWarp * 0.6);
  // Brilho por fio ∝ DPR: luz por área de tela constante em qualquer resolução.
  visibility *= uPixelRatio;
  gl_FragColor = vec4(color * visibility, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class TimelineMaterial extends ShaderMaterial {
  constructor(shared: HubUniforms) {
    super({
      vertexShader,
      fragmentShader,
      // Referências, não cópias: os uniforms são compartilhados com a cena toda.
      uniforms: {
        uTime: shared.uTime,
        uGrowth: shared.uGrowth,
        uWarp: shared.uWarp,
        uBeamSpan: shared.uBeamSpan,
        uFogNear: shared.uFogNear,
        uFogFar: shared.uFogFar,
        uPixelRatio: shared.uPixelRatio,
        uSurgeFront: shared.uSurgeFront,
        uSurgeBranch: shared.uSurgeBranch,
        uSurgeFork: shared.uSurgeFork,
        uFlare: shared.uFlare,
        uHush: shared.uHush,
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
  }
}
