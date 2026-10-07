import {
  AdditiveBlending,
  DoubleSide,
  NormalBlending,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type Texture,
} from 'three';
import { float, glsl, int, vec3 } from '@/shaders/glsl';
import { FULLSCREEN_VERTEX } from '@/shaders/fullscreen';
import { noiseChunk } from '@/shaders/chunks/noise.glsl';
import { commonChunk } from '@/shaders/chunks/common.glsl';
import { PALETTE } from '../../shared/palette';
import { TEAR } from './config';

/**
 * Os materiais do Despertar. Regras de custo (GPU integrada a 60 FPS):
 *   - um único passe de tela cheia caro por vez (o fundo é barato; a
 *     membrana só existe nas etapas dela);
 *   - toda geometria animada é calculada no vertex shader a partir de
 *     uniforms (fios, patas, cacos): a CPU escreve poucos números por frame;
 *   - fora da sua etapa, cada material COLAPSA no vertex shader
 *     (`uActive = 0`): continua no grafo e compilado, sem custo de pixel.
 */

const EMERALD = vec3(PALETTE.emerald);
const DORMANT = glsl`gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;`;
const OUTPUT = glsl`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

export const TRAIL = 16;

const vec4Array = (n: number) => Array.from({ length: n }, () => new Vector4());
const vec3Array = (n: number) => Array.from({ length: n }, () => new Vector3());

// ── Fundo ────────────────────────────────────────────────────────────────────

/**
 * A câmara: um vazio de concreto escuro com lajes verticais (brutalismo),
 * a luz do nascimento atrás da membrana, a sombra do autômato e os anéis
 * que pulsam nos pregos livres. Tudo num triângulo de tela cheia barato
 * (1 value noise): sombra e anéis entram aqui para não custarem draw calls.
 */
export class BackdropMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: glsl`
        ${noiseChunk}
        uniform float uTime;
        uniform float uAspect;
        uniform float uBirth;
        uniform float uFade;
        uniform vec3 uNails[4];
        uniform vec3 uBeetle;
        uniform float uBeetleRadius;
        uniform float uRingScale;
        varying vec2 vUv;

        void main() {
          vec2 aspect = vec2(uAspect, 1.0);
          vec2 p = (vUv - 0.5) * aspect;
          float grain = valueNoise(p * vec2(3.0, 9.0) + vec2(0.0, uTime * 0.015));
          vec3 color = vec3(0.012, 0.016, 0.015) * (0.65 + 0.7 * grain);

          // Lajes verticais: juntas escuras com um fio de luz verde rente a elas.
          float slab = fract(p.x * 2.6 + 0.5);
          float joint = min(slab, 1.0 - slab);
          color *= 0.55 + 0.45 * smoothstep(0.0, 0.012, joint);
          color += ${EMERALD} * 0.012 * exp(-joint * 90.0) * (0.6 + 0.4 * sin(uTime * 0.7 + p.x * 3.0));
          color *= 1.0 - 0.6 * dot(p, p);

          // A luz do nascimento: o que existe atrás da membrana.
          float r2 = dot(p, p);
          color += (${EMERALD} * (exp(-r2 * 14.0) * 0.45 + exp(-r2 * 70.0) * 1.5) + vec3(exp(-r2 * 260.0) * 2.2)) * uBirth;

          // Sombra de contato do autômato.
          vec2 toBeetle = (vUv - uBeetle.xy) * aspect;
          color *= 1.0 - uBeetle.z * 0.8 * exp(-dot(toBeetle, toBeetle) / (uBeetleRadius * uBeetleRadius));

          // Anéis de alvo nos pregos livres (a dica do arraste, sem texto).
          float wave = fract(uTime * 0.75);
          for (int i = 0; i < 4; i++) {
            float d = length((vUv - uNails[i].xy) * aspect);
            float ring = exp(-pow((d / uRingScale - 0.03 - wave * 0.05) * 140.0, 2.0)) * (1.0 - wave);
            color += ${EMERALD} * ring * uNails[i].z * 1.4;
          }

          gl_FragColor = vec4(color * uFade, 1.0);
          ${OUTPUT}
        }`,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uBirth: { value: 0 },
        uFade: { value: 0 },
        uNails: { value: vec3Array(4) },
        uBeetle: { value: new Vector3() },
        uBeetleRadius: { value: 0.1 },
        uRingScale: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
  }
}

// ── Fios de gosma ────────────────────────────────────────────────────────────

/**
 * 4 tubos (instâncias) ao longo de Bézier cúbicas calculadas no VERTEX
 * SHADER: a geometria é só uma grade (t ao longo, ângulo ao redor) e os
 * pontos de controle chegam por uniform — a física na CPU escreve 16 vec3
 * por frame e nada mais. Perfil: pescoço que afina ao esticar (volume
 * constante), gomos de peristalse descendo e uma gota pesada na ponta.
 * Superfície: preto líquido, especular nítido, filme de óleo iridescente.
 */
export class SlimeMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        attribute float aStrand;
        uniform vec3 uP0[4];
        uniform vec3 uP1[4];
        uniform vec3 uP2[4];
        uniform vec3 uP3[4];
        uniform float uThick[4];
        uniform float uSnap[4];
        uniform float uRadius;
        uniform float uFuse;
        uniform float uTime;
        uniform float uActive;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vT;
        varying float vSnap;

        void main() {
          if (uActive < 0.5) { ${DORMANT} }
          int i = int(aStrand + 0.5);
          float t = position.x;
          float a = position.y * 6.2831853;
          float s = 1.0 - t;
          vec3 p0 = uP0[i];
          vec3 p1 = uP1[i];
          vec3 p2 = uP2[i];
          vec3 p3 = uP3[i];
          vec3 center = s * s * s * p0 + 3.0 * s * s * t * p1 + 3.0 * s * t * t * p2 + t * t * t * p3;
          vec3 d = 3.0 * s * s * (p1 - p0) + 6.0 * s * t * (p2 - p1) + 3.0 * t * t * (p3 - p2);
          vec2 tangent = normalize(d.xy + vec2(0.0, -1e-4));
          vec3 side = vec3(-tangent.y, tangent.x, 0.0);

          float body = uRadius * uThick[i] * (0.6 + 0.4 * smoothstep(0.0, 0.3, t));
          body *= 1.0 + 0.2 * sin(t * 15.0 - uTime * 2.6 + float(i) * 1.9);
          float bulb = sqrt(max(0.0, 1.0 - pow((t - 0.9) / 0.1, 2.0))) * uRadius * 1.75;
          float radius = max(body * step(t, 0.97), bulb) * (1.0 + uFuse * 2.2);

          vec3 normal = side * cos(a) + vec3(0.0, 0.0, 1.0) * sin(a);
          vec4 view = modelViewMatrix * vec4(center + normal * radius, 1.0);
          gl_Position = projectionMatrix * view;
          vNormal = normalize(normalMatrix * normal);
          vView = view.xyz;
          vT = t;
          vSnap = uSnap[i];
        }`,
      fragmentShader: glsl`
        uniform float uTime;
        uniform float uFuse;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vT;
        varying float vSnap;

        void main() {
          vec3 n = normalize(vNormal);
          vec3 v = normalize(-vView);
          float facing = max(dot(n, v), 0.0);
          float fresnel = pow(1.0 - facing, 3.0);
          vec3 light = normalize(vec3(-0.45, 0.75, 0.55));
          float spec = pow(max(dot(reflect(-light, n), v), 0.0), 60.0);
          float under = pow(max(dot(reflect(normalize(vec3(0.5, -0.6, 0.4)), n), -v), 0.0), 18.0);

          vec3 color = vec3(0.003, 0.008, 0.006);
          vec3 oil = (0.5 + 0.5 * cos(6.2831853 * (fresnel * 1.4 + vec3(0.0, 0.33, 0.67)) + uTime * 0.6)) * fresnel * 0.16;
          color += oil + ${EMERALD} * fresnel * 0.45 + vec3(0.95, 1.0, 0.97) * spec * 2.6 + ${EMERALD} * under * 0.5;
          // Seiva viva correndo por dentro (a forma que vai nascer).
          float vein = pow(0.5 + 0.5 * sin(vT * 14.0 - uTime * 2.2), 12.0) * (0.25 + 0.75 * facing);
          color += ${EMERALD} * vein * 0.16 * (1.0 - uFuse);
          color += ${EMERALD} * vSnap * 2.4 * facing;
          gl_FragColor = vec4(color, 1.0);
          ${OUTPUT}
        }`,
      uniforms: {
        uP0: { value: vec3Array(4) },
        uP1: { value: vec3Array(4) },
        uP2: { value: vec3Array(4) },
        uP3: { value: vec3Array(4) },
        uThick: { value: [1, 1, 1, 1] },
        uSnap: { value: [0, 0, 0, 0] },
        uRadius: { value: 0.07 },
        uFuse: { value: 0 },
        uTime: { value: 0 },
        uActive: { value: 0 },
      },
    });
  }
}

// ── Pregos ───────────────────────────────────────────────────────────────────

/** Parafusos de aço sextavados cravados na laje; acendem ao prender um fio. Facetas por derivadas (low-poly). */
export class NailMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        attribute float aNail;
        uniform vec2 uNailPos[4];
        uniform float uScale;
        uniform float uActive;
        varying vec3 vView;
        varying vec3 vLocal;
        varying float vGlow;
        uniform float uNailGlow[4];
        void main() {
          if (uActive < 0.5) { ${DORMANT} }
          int i = int(aNail + 0.5);
          vec4 view = modelViewMatrix * vec4(position * uScale + vec3(uNailPos[i], 0.0), 1.0);
          gl_Position = projectionMatrix * view;
          vView = view.xyz;
          vLocal = position;
          vGlow = uNailGlow[i];
        }`,
      fragmentShader: glsl`
        varying vec3 vView;
        varying vec3 vLocal;
        varying float vGlow;
        void main() {
          vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
          vec3 light = normalize(vec3(-0.4, 0.7, 0.6));
          float diffuse = max(dot(n, light), 0.0);
          float spec = pow(max(dot(reflect(-light, n), normalize(-vView)), 0.0), 24.0);
          vec3 color = vec3(0.05, 0.055, 0.06) * (0.25 + diffuse) + vec3(0.8) * spec * 0.6;
          float core = 1.0 - smoothstep(0.05, 0.11, length(vLocal.xy));
          color += ${EMERALD} * (core * 2.5 + 0.35) * vGlow;
          gl_FragColor = vec4(color, 1.0);
          ${OUTPUT}
        }`,
      uniforms: {
        uNailPos: { value: Array.from({ length: 4 }, () => new Vector2()) },
        uNailGlow: { value: [0, 0, 0, 0] },
        uScale: { value: 1 },
        uActive: { value: 0 },
      },
    });
  }
}

// ── Membrana ─────────────────────────────────────────────────────────────────

/**
 * A membrana negra que nasce da fusão dos fios e cobre a tela. Uma grade em
 * NDC (tela cheia, sem câmera) cujo vertex shader LÊ a textura do rasgo
 * (64×64, escrita pela CPU): as bordas de cada corte se repuxam para longe da
 * ferida, e no rasgo final tudo é arrancado para fora da tela.
 *
 * Fragmento: veias pulsando, luz do nascimento vazando onde a pele afina,
 * borda incandescente nos cortes (vai ao bloom) e o rastro da lâmina.
 */
export class MembraneMaterial extends ShaderMaterial {
  constructor(tear: Texture) {
    super({
      vertexShader: glsl`
        uniform sampler2D uTear;
        uniform float uRip;
        uniform float uTime;
        uniform float uActive;
        varying vec2 vUv;
        varying float vStrain;

        void main() {
          if (uActive < 0.5) { ${DORMANT} }
          vec2 uv = position.xy * 0.5 + 0.5;
          vec2 texel = vec2(${float(1 / TEAR.cols)}, ${float(1 / TEAR.rows)});
          float tear = texture2D(uTear, uv).r;
          vec2 grad = vec2(
            texture2D(uTear, uv + vec2(texel.x, 0.0)).r - texture2D(uTear, uv - vec2(texel.x, 0.0)).r,
            texture2D(uTear, uv + vec2(0.0, texel.y)).r - texture2D(uTear, uv - vec2(0.0, texel.y)).r
          );
          // A pele recua da ferida: as bordas do corte se abrem.
          vec2 retreat = -grad / (length(grad) + 0.05) * smoothstep(0.02, 0.55, tear) * 0.028;
          // O rasgo final: a membrana é arrancada para as bordas, acelerando.
          vec2 fromCenter = uv - 0.5;
          vec2 rip = fromCenter * uRip * uRip * (2.2 + 1.5 * tear);
          vec2 breathe = vec2(0.0, sin(uTime * 1.3 + uv.x * 5.0) * 0.003);
          vec2 moved = uv + retreat + rip + breathe;
          gl_Position = vec4(moved * 2.0 - 1.0, 0.0, 1.0);
          vUv = uv;
          vStrain = length(retreat) * 30.0;
        }`,
      fragmentShader: glsl`
        ${noiseChunk}
        uniform sampler2D uTear;
        uniform float uFuse;
        uniform float uRip;
        uniform float uTime;
        uniform float uAspect;
        uniform vec4 uLines[4];
        uniform vec3 uTrail[${int(TRAIL)}];
        varying vec2 vUv;
        varying float vStrain;

        float segment(vec2 p, vec2 a, vec2 b) {
          vec2 ab = b - a;
          float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
          return length(p - a - ab * h);
        }

        void main() {
          vec2 aspect = vec2(uAspect, 1.0);
          vec2 p = vUv * aspect;
          float grain = valueNoise(p * 9.0);

          // Fusão: a pele se espalha a partir dos 4 fios até fechar a tela.
          if (uFuse < 0.999) {
            float d = 9.0;
            for (int i = 0; i < 4; i++) d = min(d, segment(p, uLines[i].xy * aspect, uLines[i].zw * aspect));
            float front = uFuse * uFuse * 1.25 * max(1.0, uAspect * 0.6);
            if (d + grain * 0.06 > front) discard;
          }

          // O rasgo: borda dentada (ruído), buraco, borda incandescente.
          float tear = texture2D(uTear, vUv).r;
          float ragged = tear + (grain - 0.5) * 0.35 + uRip * 1.25;
          if (ragged > 0.62) discard;
          float rim = smoothstep(0.34, 0.62, ragged);

          // Pele: couro escuro que respira, veias finas e tênues (a forma pulsa por baixo).
          float relief = valueNoise(p * 4.0 + vec2(0.0, uTime * 0.03)) * 0.6 + grain * 0.4;
          float ridge = 1.0 - abs(valueNoise(p * 11.0 + vec2(uTime * 0.04, 0.0)) * 2.0 - 1.0);
          float pulse = 0.5 + 0.5 * pow(0.5 + 0.5 * sin(uTime * 2.4), 6.0);
          vec3 color = vec3(0.005, 0.008, 0.007) * (0.45 + relief);
          color += ${EMERALD} * pow(ridge, 40.0) * 0.04 * pulse;
          color += ${EMERALD} * smoothstep(0.08, 0.45, tear) * 0.35;     // a luz vaza onde a pele afina
          color += mix(${EMERALD}, vec3(1.0), 0.55) * rim * rim * 3.2;    // a ferida queima
          color += vec3(0.4, 0.5, 0.45) * vStrain * 0.05;

          // O rastro da lâmina de luz.
          float blade = 0.0;
          for (int i = 0; i < ${int(TRAIL)}; i++) {
            vec2 q = (vUv - uTrail[i].xy) * aspect;
            blade += exp(-dot(q, q) * 9000.0) * exp(-uTrail[i].z * 7.0);
          }
          color += mix(${EMERALD}, vec3(1.0), 0.7) * min(blade, 1.5) * 2.5;

          gl_FragColor = vec4(color, 1.0);
          ${OUTPUT}
        }`,
      uniforms: {
        uTear: { value: tear },
        uFuse: { value: 0 },
        uRip: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uLines: { value: vec4Array(4) },
        uTrail: { value: Array.from({ length: TRAIL }, () => new Vector3(0, 0, 99)) },
        uActive: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
  }
}

// ── O autômato ───────────────────────────────────────────────────────────────

/**
 * Besouro-autômato low-poly. As patas andam no vertex shader (marcha em
 * tripé: 3 patas no chão, 3 no ar, alternando), girando cada segmento em
 * torno do quadril; o corpo balança no compasso. Facetas por derivadas
 * (`dFdx`): low-poly sem duplicar vértices. Peças por `aPart`:
 * 0 casco · 1 neon · 2 patas · 3 olhos.
 */
export class BeetleMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        attribute float aPart;
        attribute vec3 aLeg;   // x índice no lado (0..2) · y lado (±1) · z t ao longo da pata
        attribute vec3 aHip;
        uniform float uStride;
        uniform float uActive;
        varying vec3 vView;
        varying float vPart;
        varying vec3 vLocal;

        void main() {
          if (uActive < 0.5) { ${DORMANT} }
          vec3 p = position;
          if (aPart > 1.5 && aPart < 2.5) {
            float phase = mod(aLeg.x + (aLeg.y > 0.0 ? 1.0 : 0.0), 2.0) * 3.14159265;
            float swing = sin(uStride + phase) * 0.42 * aLeg.y;
            float lift = max(0.0, cos(uStride + phase)) * 0.14 * aLeg.z;
            vec3 local = p - aHip;
            float c = cos(swing);
            float s = sin(swing);
            p = aHip + vec3(c * local.x - s * local.y, s * local.x + c * local.y, local.z + lift);
          } else {
            p.z += sin(uStride * 2.0) * 0.012;
          }
          vec4 view = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * view;
          vView = view.xyz;
          vPart = aPart;
          vLocal = position;
        }`,
      fragmentShader: glsl`
        uniform float uTime;
        uniform float uGlow;
        varying vec3 vView;
        varying float vPart;
        varying vec3 vLocal;

        void main() {
          vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
          vec3 v = normalize(-vView);
          vec3 light = normalize(vec3(-0.45, 0.65, 0.65));
          float diffuse = max(dot(n, light), 0.0);
          float spec = pow(max(dot(reflect(-light, n), v), 0.0), 36.0);
          float rim = pow(1.0 - max(dot(n, v), 0.0), 2.5);
          float pulse = 0.75 + 0.25 * sin(uTime * 3.2 - vLocal.x * 6.0);

          vec3 color;
          if (vPart < 0.5) {
            color = vec3(0.035, 0.045, 0.05) * (0.3 + diffuse * 1.2) + vec3(0.75, 0.85, 0.8) * spec * 0.9 + ${EMERALD} * rim * 0.22;
          } else if (vPart < 1.5) {
            color = ${EMERALD} * (1.6 + uGlow * 1.6) * pulse;
          } else if (vPart < 2.5) {
            color = vec3(0.02, 0.025, 0.028) * (0.4 + diffuse) + vec3(0.5) * spec * 0.4;
          } else {
            color = mix(${EMERALD}, vec3(0.7, 1.0, 1.0), 0.5) * 3.2 * pulse;
          }
          gl_FragColor = vec4(color, 1.0);
          ${OUTPUT}
        }`,
      uniforms: { uStride: { value: 0 }, uTime: { value: 0 }, uGlow: { value: 0 }, uActive: { value: 0 } },
    });
  }
}

/** A cúpula de vidro nas costas: o botão. Fresnel translúcido + núcleo que pulsa (mais forte sob o cursor). */
export class DomeMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        uniform float uActive;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLocal;
        void main() {
          if (uActive < 0.5) { ${DORMANT} }
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * view;
          vNormal = normalize(normalMatrix * normal);
          vView = view.xyz;
          vLocal = position;
        }`,
      fragmentShader: glsl`
        uniform float uTime;
        uniform float uHover;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLocal;
        void main() {
          vec3 n = normalize(vNormal);
          vec3 v = normalize(-vView);
          float facing = max(dot(n, v), 0.0);
          float fresnel = pow(1.0 - facing, 2.2);
          float spec = pow(max(dot(reflect(-normalize(vec3(-0.45, 0.65, 0.65)), n), v), 0.0), 80.0);
          float beat = 0.5 + 0.5 * sin(uTime * (3.0 + uHover * 5.0));
          float core = exp(-dot(vLocal.xy, vLocal.xy) * 60.0) * (0.6 + 0.4 * beat) * (1.0 + uHover * 2.5);
          vec3 color = mix(${EMERALD}, vec3(0.8, 1.0, 0.95), 0.35) * (fresnel * (0.8 + uHover) + core * 2.2) + vec3(spec * 3.0);
          float alpha = clamp(fresnel * 0.75 + core * 0.8 + spec + 0.08, 0.0, 1.0);
          gl_FragColor = vec4(color, alpha);
          ${OUTPUT}
        }`,
      uniforms: { uTime: { value: 0 }, uHover: { value: 0 }, uActive: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
  }
}

/**
 * O cone de projeção do holograma: do botão nas costas até a base do painel
 * HTML. Um quad deformado em trapézio no vertex shader (pontos em mundo por
 * uniform), aditivo, com varredura subindo e falhas de sinal.
 */
export class BeamMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        uniform vec3 uBottom;
        uniform vec3 uTop;
        uniform float uTopHalf;
        uniform float uStrength;
        varying vec2 vUv;
        void main() {
          if (uStrength <= 0.001) { ${DORMANT} }
          float k = position.y + 0.5;
          float width = mix(0.06, uTopHalf, k);
          vec3 p = mix(uBottom, uTop, k) + vec3(position.x * 2.0 * width, 0.0, 0.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          vUv = vec2(position.x + 0.5, k);
        }`,
      fragmentShader: glsl`
        ${commonChunk}
        uniform float uTime;
        uniform float uStrength;
        uniform float uGlitch;
        varying vec2 vUv;
        void main() {
          float edge = abs(vUv.x - 0.5) * 2.0;
          float body = (1.0 - edge * edge) * 0.25 + pow(edge, 10.0) * 0.6;
          float scan = 0.65 + 0.35 * sin(vUv.y * 140.0 - uTime * 9.0);
          float band = step(0.5, hash12(vec2(floor(vUv.y * 24.0), floor(uTime * 18.0))) ) * uGlitch;
          float fade = smoothstep(0.0, 0.08, vUv.y) * (0.35 + 0.65 * vUv.y);
          vec3 color = mix(${EMERALD}, vec3(0.7, 1.0, 0.9), 0.3) * body * scan * fade * uStrength * (1.0 - band);
          gl_FragColor = vec4(color, 1.0);
        }`,
      uniforms: {
        uBottom: { value: new Vector3() },
        uTop: { value: new Vector3() },
        uTopHalf: { value: 1 },
        uStrength: { value: 0 },
        uGlitch: { value: 0 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    });
  }
}

// ── Sobreposição (pós-composer): terminal e estilhaço ───────────────────────

/**
 * O terminal interceptado. Quad em NDC (o retângulo vem do layout HTML), a
 * textura é o Canvas2D do painel. O shader faz o que custaria uploads:
 * digitação (máscara da linha atual), cursor piscando e a corrupção do sinal
 * (fatias deslocadas, separação RGB, flicker).
 */
export class TerminalMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        uniform vec4 uRect;   // NDC: x0, y0, x1, y1
        uniform float uActive;
        varying vec2 vUv;
        void main() {
          if (uActive < 0.5) { ${DORMANT} }
          vUv = position.xy + 0.5;
          gl_Position = vec4(mix(uRect.xy, uRect.zw, vUv), 0.0, 1.0);
        }`,
      fragmentShader: glsl`
        ${commonChunk}
        uniform sampler2D uMap;
        uniform vec2 uSize;     // px CSS
        uniform vec2 uLine;     // faixa (px) da fala sendo digitada
        uniform float uReveal;  // px já revelados nela
        uniform float uCharW;
        uniform float uTime;
        uniform float uGlitch;
        uniform float uAlpha;
        varying vec2 vUv;

        void main() {
          vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uSize;
          float tick = floor(uTime * 16.0);
          float band = floor(px.y / mix(26.0, 7.0, hash11(tick)));
          float shove = hash12(vec2(band, tick));
          float glitch = uGlitch * (0.25 + 0.75 * step(0.82, hash11(tick * 1.7)));
          px.x += (shove - 0.5) * 70.0 * glitch * step(0.7, shove);
          float split = (1.5 + 6.0 * glitch) * (0.5 + 0.5 * sin(uTime * 23.0));

          vec2 uv = vec2(px.x, uSize.y - px.y) / uSize;
          vec2 off = vec2(split / uSize.x, 0.0);
          vec4 base = texture2D(uMap, uv);
          vec3 color = vec3(texture2D(uMap, uv + off).r, base.g, texture2D(uMap, uv - off).b);
          float alpha = base.a;

          // Digitação: na linha atual, só o que já foi "teclado" aparece.
          bool onLine = px.y >= uLine.x && px.y < uLine.y;
          if (onLine && px.x > uReveal) {
            color = texture2D(uMap, vec2(4.0, uSize.y - px.y) / uSize).rgb;
          }
          float cursor = step(uReveal, px.x) * step(px.x, uReveal + uCharW * 0.9) * step(0.5, fract(uTime * 2.2));
          if (onLine && abs(px.y - (uLine.x + uLine.y) * 0.5) < (uLine.y - uLine.x) * 0.32) color = mix(color, vec3(0.99, 0.79, 0.79), cursor);

          float flicker = 0.92 + 0.08 * hash11(tick * 3.1) - glitch * 0.3 * step(0.9, hash11(tick + 4.0));
          float noise = (hash12(px + fract(uTime) * 91.0) - 0.5) * 0.06 * (0.3 + glitch);
          gl_FragColor = vec4((color + noise) * flicker, alpha * uAlpha);
          #include <colorspace_fragment>
        }`,
      uniforms: {
        uMap: { value: null },
        uRect: { value: new Vector4(-0.5, -0.5, 0.5, 0.5) },
        uSize: { value: new Vector2(1, 1) },
        uLine: { value: new Vector2(-1, -1) },
        uReveal: { value: 0 },
        uCharW: { value: 9 },
        uTime: { value: 0 },
        uGlitch: { value: 0 },
        uAlpha: { value: 1 },
        uActive: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }
}

/** Duração da queda dos cacos (s) — o vertex shader converte progresso em tempo físico. */
const SHATTER_SECONDS = 1.9;

/**
 * A TELA estilhaça. Cada caco é um triângulo de uma teia polar (raios +
 * anéis log-espaçados ao redor do clique, pré-gerada): 1 draw call, todos os
 * movimentos no vertex shader — trinca que se propaga, cacos se soltando
 * escalonados pela distância, girando em 3D em torno do próprio centro,
 * mergulhando no vazio com perspectiva e gravidade; alguns voam contra a
 * câmera. O fragment só amostra o frame capturado (cru: já está em sRGB),
 * escurece as faces que giram para longe da luz e acende as arestas.
 */
export class ShatterMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        attribute vec2 aCenter;
        attribute vec3 aBary;
        attribute vec3 aSeed;
        uniform vec2 uOrigin;
        uniform float uAspect;
        uniform float uProgress;
        uniform float uActive;
        varying vec2 vUv;
        varying vec3 vBary;
        varying float vCrack;
        varying float vShade;
        varying float vGlint;
        varying float vFall;

        vec3 rotate(vec3 v, vec3 axis, float angle) {
          float c = cos(angle);
          float s = sin(angle);
          return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
        }

        void main() {
          if (uActive < 0.5) { ${DORMANT} }
          vec2 aspect = vec2(uAspect, 1.0);
          vec2 origin = uOrigin * aspect;
          float dist = length(aCenter);
          float reach = length(aspect);

          // A teia corre do impacto para as bordas.
          float front = smoothstep(0.0, 0.2, uProgress) * reach * 1.25;
          vCrack = 1.0 - smoothstep(front - 0.12, front, dist);

          // Soltam-se do centro para fora; t = segundos desde que se soltou.
          float release = 0.18 + (dist / reach) * 0.3 + aSeed.x * 0.07;
          float t = max(0.0, uProgress - release) * ${float(SHATTER_SECONDS)};
          vFall = smoothstep(0.0, 0.25, t);

          vec3 axis = normalize(aSeed * 2.0 - 1.0 + vec3(0.0, 0.0, 0.35));
          float spin = (1.6 + aSeed.y * 5.0) * t * (aSeed.z > 0.5 ? 1.0 : -1.0);
          vec3 local = rotate(vec3(position.xy - aCenter, 0.0), axis, spin);
          vec3 normal = rotate(vec3(0.0, 0.0, 1.0), axis, spin);

          vec2 out2 = aCenter / max(dist, 1e-3);
          float punch = exp(-dist * 2.2);
          float toward = step(0.9, aSeed.x) * (1.0 - punch) * 1.1;
          vec3 velocity = vec3(out2 * (0.12 + 0.55 * punch) * (0.6 + aSeed.z), -(0.5 + aSeed.y) * punch * 1.6 + toward);
          vec3 p = vec3(origin + aCenter, 0.0) + local + velocity * t + vec3(0.0, -2.4, 0.0) * t * t * 0.5;
          p.xy += out2 * 0.0035 * vCrack * (1.0 - vFall); // a trinca: cacos se afastam um fio

          // Perspectiva de uma câmera a 2.2 alturas da tela.
          vec2 screenCenter = aspect * 0.5;
          float depth = 2.2 / (2.2 - clamp(p.z, -6.0, 1.7));
          vec2 projected = screenCenter + (p.xy - screenCenter) * depth;
          gl_Position = vec4(projected / aspect * 2.0 - 1.0, 0.0, 1.0);

          vUv = (origin + position.xy) / aspect;
          vBary = aBary;
          vec3 light = normalize(vec3(-0.35, 0.55, 0.75));
          vShade = mix(1.0, 0.25 + 0.75 * abs(dot(normal, light)), vFall);
          vGlint = pow(max(dot(reflect(-light, normal), vec3(0.0, 0.0, 1.0)), 0.0), 40.0) * vFall;
        }`,
      fragmentShader: glsl`
        uniform sampler2D uCapture;
        uniform float uProgress;
        varying vec2 vUv;
        varying vec3 vBary;
        varying float vCrack;
        varying float vShade;
        varying float vGlint;
        varying float vFall;
        void main() {
          vec3 image = texture2D(uCapture, clamp(vUv, 0.0, 1.0)).rgb;
          float e = min(vBary.x, min(vBary.y, vBary.z));
          float line = 1.0 - smoothstep(0.0, fwidth(e) * 1.1, e);
          vec3 color = image * vShade + vec3(0.85, 1.0, 0.95) * (line * vCrack * (0.5 - 0.3 * vFall) + vGlint * 0.6);
          color *= 1.0 - smoothstep(0.82, 1.0, uProgress);
          gl_FragColor = vec4(color, 1.0);
        }`,
      uniforms: {
        uCapture: { value: null },
        uOrigin: { value: new Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
        uProgress: { value: 0 },
        uActive: { value: 0 },
      },
      // Os cacos giram em 3D: as duas faces do vidro aparecem.
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }
}
