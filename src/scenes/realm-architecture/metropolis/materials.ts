import { AddEquation, AdditiveBlending, CustomBlending, DoubleSide, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, Vector2, Vector3, Vector4, type Texture } from 'three';
import { glsl, int, vec3 } from '@/shaders/glsl';
import { commonChunk } from '@/shaders/chunks/common.glsl';
import { noiseChunk } from '@/shaders/chunks/noise.glsl';
import { FLOOD_LIGHT } from '../../shared/flood';
import { PALETTE } from '../../shared/palette';
import { MIRRORS, PHRASES, TUNNEL } from './config';

/**
 * Os materiais da Metrópole. Princípios de custo:
 *   - REFLEXO SEM RENDER TARGET: o chão e o teto são espelhos planos, e o
 *     reflexo num espelho plano é só a geometria refletida (y → 2·h − y).
 *     Cada draw é instanciado com as cópias de MIRRORS (`gl_InstanceID`):
 *     reflexo exato, inclusive o de 2ª ordem (espelhos frente a frente),
 *     sem renderizar a cena de novo nem alocar nada.
 *   - TUDO É LUZ: linhas, pontos e texto somam (blending aditivo) — a ordem
 *     de desenho não importa e não há depth buffer a disputar.
 *   - A construção é função pura do progresso (uniform): a CPU escreve um
 *     punhado de números por frame.
 */

const EMERALD = vec3(PALETTE.emerald);
const DORMANT = glsl`gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;`;
const OUTPUT = glsl`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

export const MIRROR_COUNT = MIRRORS.length;
const mirrorUniform = () => ({ value: MIRRORS.map((m) => new Vector3(m.sign, m.offset, m.gain)) });

/** Espelho, névoa e falha de sinal — compartilhado por todo material do túnel. */
const tunnelChunk = glsl`
${commonChunk}
uniform vec3 uMirror[${int(MIRROR_COUNT)}];
uniform float uTime;
uniform float uGlitch;

vec3 mirrorOf(vec3 p, int i) {
  vec3 m = uMirror[i];
  return vec3(p.x, p.y * m.x + m.y, p.z);
}

/** Fatias horizontais deslocadas aos trancos: a estrutura "perde o sinal". */
vec3 glitchShift(vec3 p) {
  if (uGlitch <= 0.0) return p;
  float tick = floor(uTime * 14.0);
  float h = hash11(floor(p.y * 5.0) * 7.13 + tick * 1.7);
  p.x += (h - 0.5) * 1.4 * uGlitch * step(0.7, h);
  return p;
}

/** O pulso do clímax: uma casca de luz que se expande a partir do núcleo. */
uniform vec3 uCore;
uniform float uPulse;
uniform float uPulseAmp;
float pulseAt(vec3 p) {
  if (uPulseAmp <= 0.0) return 0.0;
  float d = distance(p, uCore) - uPulse;
  return uPulseAmp * (exp(-d * d * 0.9) + 0.25 * exp(-abs(d) * 0.35) * step(d, 0.0));
}

/** O vazio engole a distância (e o que está colado na lente). */
float tunnelFog(float dist) {
  return exp(-dist * dist * 0.0011) * smoothstep(0.05, 0.6, dist);
}
`;

/** Base comum: uniforms de túnel + aditivo, sem depth. */
const tunnelUniforms = () => ({
  uMirror: mirrorUniform(),
  uTime: { value: 0 },
  uGlitch: { value: 0 },
  uCore: { value: new Vector3() },
  uPulse: { value: 0 },
  uPulseAmp: { value: 0 },
});
const LIGHT = { transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending } as const;

// ── Chão e teto ──────────────────────────────────────────────────────────────

/**
 * Os espelhos: vidro negro polido (rugosidade ~0) com fresnel no ângulo
 * rasante e uma grade em wireframe que ACENDE atrás da frente de construção
 * (com a linha de varredura passando nela). Um quad por superfície que
 * acompanha a câmera: chão infinito ao custo de 2 triângulos cada.
 */
export class MirrorSurfaceMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        uniform float uCamZ;
        varying vec3 vWorld;
        void main() {
          float y = gl_InstanceID == 0 ? ${TUNNEL.floor.toFixed(3)} : ${TUNNEL.ceiling.toFixed(3)};
          vWorld = vec3(position.x * 80.0, y, uCamZ - 45.0 + position.y * 100.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
        }`,
      fragmentShader: glsl`
        ${tunnelChunk}
        uniform float uBuildZ;
        uniform float uHangar; // s desde que os refletores começaram a ligar (grande = todos acesos)
        varying vec3 vWorld;

        float gridLine(vec2 g) {
          vec2 w = fwidth(g);
          vec2 d = abs(fract(g - 0.5) - 0.5) / max(w, vec2(1e-4));
          return 1.0 - min(min(d.x, d.y), 1.0);
        }

        void main() {
          vec3 view = vWorld - cameraPosition;
          float dist = length(view);
          float fresnel = pow(1.0 - abs(view.y) / dist, 5.0);
          vec3 color = vec3(0.003, 0.006, 0.007) + vec3(0.012, 0.03, 0.028) * fresnel;

          float major = gridLine(vWorld.xz);
          float minor = gridLine(vWorld.xz * 4.0);
          float built = smoothstep(uBuildZ - 1.5, uBuildZ + 1.0, vWorld.z);
          float scan = exp(-abs(vWorld.z - uBuildZ) * 2.5);
          float lane = exp(-abs(abs(vWorld.x) - ${(1.35).toFixed(2)}) * 18.0);
          // HANGAR: a grade acende em faixas, de perto para longe, cada faixa com um surto e um tremeluzir ao ligar.
          float band = floor(max(cameraPosition.z - vWorld.z, 0.0) / 3.0);
          float since = uHangar - band * 0.06;
          float lit = step(0.0, since) * mix(step(0.35, hash11(band * 3.7 + floor(uHangar * 30.0))), 1.0, step(0.12, since));
          float surge = exp(-max(since, 0.0) * 5.0) * lit;
          color *= 0.35 + 0.65 * lit;
          color += ${EMERALD} * (major * (0.07 * built + 0.4 * scan) + minor * 0.02 * built + lane * 0.05 * built) * lit;
          color += mix(${EMERALD}, vec3(0.8, 1.0, 0.95), 0.4) * (major * 0.9 + lane * 1.6 + 0.04) * surge;
          float wave = pulseAt(vec3(vWorld.x, uCore.y, vWorld.z));
          color += ${EMERALD} * (major * 2.2 + minor * 0.5 + 0.06) * wave;
          color *= tunnelFog(dist) * (1.0 - 0.6 * uGlitch * step(0.85, hash11(floor(uTime * 14.0))));
          gl_FragColor = vec4(color, 1.0);
          ${OUTPUT}
        }`,
      uniforms: { ...tunnelUniforms(), uCamZ: { value: 0 }, uBuildZ: { value: 0 }, uHangar: { value: 1e3 } },
      side: DoubleSide, // o chão é visto de cima, o teto de baixo: o mesmo quad nas duas faces
      depthTest: false,
      depthWrite: false,
    });
  }
}

// ── A cidade em linhas ───────────────────────────────────────────────────────

/**
 * Cada segmento cresce da sua origem até o fim dentro da sua janela de
 * progresso (ver city.ts) — e brilha em branco enquanto está sendo
 * desenhado. Pontes e cabos carregam pacotes de luz correndo por eles; o
 * núcleo gira no próprio shader. 5 instâncias = original + 4 reflexos.
 */
export class CityLinesMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        ${tunnelChunk}
        attribute vec3 aFrom;
        attribute vec2 aTime;
        attribute vec2 aMeta;
        uniform float uProgress;
        uniform float uCoreAngle;
        varying vec3 vColor;
        varying float vPulse;
        varying float vAlong;

        void main() {
          float t = clamp((uProgress - aTime.x) / aTime.y, 0.0, 1.0);
          if (t <= 0.0) { ${DORMANT} }
          vec3 p = mix(aFrom, position, t);
          float kind = aMeta.x;
          if (kind > 3.5 && kind < 4.5) {
            vec3 q = p - uCore;
            float c = cos(uCoreAngle);
            float s = sin(uCoreAngle);
            q = vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z);
            float c2 = cos(uCoreAngle * 0.37);
            float s2 = sin(uCoreAngle * 0.37);
            p = uCore + vec3(q.x, c2 * q.y - s2 * q.z, s2 * q.y + c2 * q.z);
          }
          vec3 world = glitchShift(mirrorOf(p, gl_InstanceID));
          vec4 view = modelViewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * view;

          vec3 base =
            kind < 0.5 ? ${EMERALD} * 0.3 + vec3(0.07) :
            kind < 1.5 ? ${EMERALD} * 0.16 :
            kind < 2.5 ? vec3(0.55, 1.0, 0.92) * 0.55 :
            kind < 3.5 ? ${EMERALD} * 0.38 :
            kind < 4.5 ? vec3(0.85, 1.0, 0.92) * 0.9 :
                         vec3(0.65, 0.9, 0.85) * 0.42;
          float head = (1.0 - t) * 2.4;
          float gain = uMirror[gl_InstanceID].z * tunnelFog(length(view.xyz));
          float wave = pulseAt(p);
          vColor = (base * (1.0 + wave * 5.0) + vec3(1.0) * head + vec3(0.75, 1.0, 0.92) * wave * 2.2) * gain;
          vPulse = (kind > 1.5 && kind < 2.5 ? 1.0 : 0.0) * gain * t;
          vAlong = aMeta.y + aTime.x * 13.0;
        }`,
      fragmentShader: glsl`
        uniform float uTime;
        uniform float uGlitch;
        varying vec3 vColor;
        varying float vPulse;
        varying float vAlong;
        void main() {
          float packet = pow(fract(vAlong * 1.5 - uTime * 0.45), 28.0) * 3.0 * vPulse;
          vec3 color = vColor + vec3(0.8, 1.0, 0.95) * packet;
          color = mix(color, vec3(color.g * 1.4, color.r * 0.2, color.b * 0.3), uGlitch * 0.6);
          gl_FragColor = vec4(color, 1.0);
          ${OUTPUT}
        }`,
      uniforms: {
        ...tunnelUniforms(),
        uProgress: { value: 0 },
        uCoreAngle: { value: 0 },
      },
      ...LIGHT,
    });
  }
}

/**
 * Partículas: as que MONTAM a cidade (voam de uma nuvem dispersa até o seu
 * ponto num segmento, no compasso dele) e a poeira de dados que deriva no
 * túnel. Pontos redondos com tamanho em perspectiva.
 */
export class CityPointsMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        ${tunnelChunk}
        attribute vec3 aFrom;
        attribute vec2 aTime;
        attribute float aSeed;
        uniform float uProgress;
        uniform float uPixelScale;
        varying vec3 vColor;

        void main() {
          float t = clamp((uProgress - aTime.x) / aTime.y, 0.0, 1.0);
          if (t <= 0.0) { ${DORMANT} }
          bool dust = aSeed > 1.0;
          float k = dust ? 1.0 : t * t * (3.0 - 2.0 * t);
          vec3 p = mix(aFrom, position, k);
          if (dust) p += vec3(sin(uTime * 0.31 + aSeed * 41.0) * 0.18, sin(uTime * 0.23 + aSeed * 17.0) * 0.08, cos(uTime * 0.2 + aSeed * 29.0) * 0.18);
          vec3 world = glitchShift(mirrorOf(p, gl_InstanceID));
          vec4 view = modelViewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * view;
          float dist = max(-view.z, 0.05);
          float flight = 1.0 - k;
          gl_PointSize = clamp((dust ? 0.016 : 0.022) * (1.0 + flight * 1.5) * uPixelScale / dist, 1.0, 7.0);
          float gain = uMirror[gl_InstanceID].z * tunnelFog(dist) * (dust ? t * 0.55 : 1.0);
          float twinkle = 0.7 + 0.3 * sin(uTime * 3.0 + aSeed * 90.0);
          vColor = (mix(${EMERALD}, vec3(1.0), dust ? 0.3 : 0.5 + 0.5 * flight) * (0.5 + flight * 2.0) * twinkle) * gain * (1.0 + pulseAt(p) * 4.0);
        }`,
      fragmentShader: glsl`
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.12, d);
          gl_FragColor = vec4(vColor * a, 1.0);
          ${OUTPUT}
        }`,
      uniforms: { ...tunnelUniforms(), uProgress: { value: 0 }, uPixelScale: { value: 800 } },
      ...LIGHT,
    });
  }
}

// ── O manifesto ──────────────────────────────────────────────────────────────

export const PHRASE_MIRRORS = 3;

/**
 * Os trechos do manifesto no espaço: um atlas Canvas2D (ver phrases.ts), um
 * quad por trecho, original + reflexos no chão e no teto (12 instâncias, 1
 * draw). Cada trecho se ACENDE varrido da esquerda para a direita por uma
 * borda de luz e se dissolve quando a câmera o atravessa.
 */
export class PhraseMaterial extends ShaderMaterial {
  constructor(atlas: Texture) {
    const n = PHRASES.length;
    super({
      vertexShader: glsl`
        ${tunnelChunk}
        uniform vec3 uCenter[${int(n)}];
        uniform vec2 uSize[${int(n)}];
        uniform vec4 uRect[${int(n)}];
        uniform float uReveal[${int(n)}];
        uniform float uFade[${int(n)}];
        varying vec2 vUv;
        varying vec2 vLocal;
        varying float vReveal;
        varying float vGain;

        void main() {
          int phrase = gl_InstanceID - (gl_InstanceID / ${int(n)}) * ${int(n)};
          int mirror = gl_InstanceID / ${int(n)};
          float visible = uReveal[phrase] * uFade[phrase];
          if (visible <= 0.001) { ${DORMANT} }
          vec3 p = uCenter[phrase] + vec3(position.x * uSize[phrase].x, position.y * uSize[phrase].y, 0.0);
          vec3 world = glitchShift(mirrorOf(p, mirror));
          vec4 view = modelViewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * view;
          vLocal = position.xy + 0.5;
          vec4 rect = uRect[phrase];
          vUv = mix(rect.xy, rect.zw, vLocal);
          vReveal = uReveal[phrase];
          vGain = uMirror[mirror].z * uFade[phrase] * tunnelFog(length(view.xyz));
        }`,
      fragmentShader: glsl`
        uniform sampler2D uAtlas;
        uniform float uTime;
        varying vec2 vUv;
        varying vec2 vLocal;
        varying float vReveal;
        varying float vGain;
        void main() {
          float ink = texture2D(uAtlas, vUv).a;
          float sweep = vReveal * 1.25 - 0.12;
          float shown = 1.0 - smoothstep(sweep - 0.06, sweep, vLocal.x);
          float edge = exp(-pow((vLocal.x - sweep) * 26.0, 2.0)) * step(vReveal, 0.999);
          float scan = 0.88 + 0.12 * sin(vLocal.y * 160.0 - uTime * 4.0);
          vec3 color = mix(${EMERALD}, vec3(1.0), 0.62) * ink * (shown * 1.15 * scan + edge * 3.5);
          gl_FragColor = vec4(color * vGain, 1.0);
          ${OUTPUT}
        }`,
      uniforms: {
        ...tunnelUniforms(),
        uAtlas: { value: atlas },
        uCenter: { value: Array.from({ length: n }, () => new Vector3()) },
        uSize: { value: Array.from({ length: n }, () => new Vector2(1, 1)) },
        uRect: { value: Array.from({ length: n }, () => new Vector4(0, 0, 1, 1)) },
        uReveal: { value: new Array<number>(n).fill(0) },
        uFade: { value: new Array<number>(n).fill(0) },
      },
      ...LIGHT,
    });
  }
}

// ── O pouso ──────────────────────────────────────────────────────────────────

/**
 * A chegada pela fissura: a tela nasce tomada pela MESMA luz em que a hub
 * terminou (FLOOD_LIGHT) e ela se dissipa devagar sobre o escuro do túnel —
 * não como um fade chapado: a luz se desfaz em névoa (fBm subindo), as
 * bordas cedem primeiro e o centro é o último a escurecer.
 * Pré-multiplicado: `alpha` cobre o túnel, a cor é a própria luz.
 */
export class LandingMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        uniform float uK;
        varying vec2 vUv;
        void main() {
          if (uK >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: glsl`
        ${noiseChunk}
        uniform float uK;
        uniform float uTime;
        uniform float uAspect;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
          float mist = fbm3(p * 2.4 + vec2(0.0, -uTime * 0.35)) ;
          float k = uK;
          // A luz recua das bordas para o centro, rasgada pela névoa.
          float hold = 1.0 - smoothstep(0.0, 1.0, k * (1.0 + length(p) * 0.9) + (mist - 0.5) * 0.35 * k);
          float alpha = clamp(hold, 0.0, 1.0);
          vec3 light = ${vec3(FLOOD_LIGHT)} * (0.92 + 0.16 * mist) * alpha;
          gl_FragColor = vec4(light, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      uniforms: { uK: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
  }

  setState(k: number, time: number, aspect: number) {
    this.uniforms.uK.value = k;
    this.uniforms.uTime.value = time;
    this.uniforms.uAspect.value = aspect;
  }
}
