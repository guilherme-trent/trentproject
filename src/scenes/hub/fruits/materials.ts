import { AdditiveBlending, Color, ShaderMaterial, Vector3, type IUniform } from 'three';
import { float, glsl, int, vec3 } from '@/shaders/glsl';
import { commonChunk } from '@/shaders/chunks/common.glsl';
import type { RGB } from '../../shared/palette';
import { depthFogChunk } from '../chunks/depthFog.glsl';
import type { HubUniforms } from '../uniforms';
import { CHAIN, DROP } from './geometry';
import { simplexChunk } from '@/shaders/chunks/simplex.glsl';

/**
 * Shaders dos Frutos Cósmicos.
 *
 * Estado por fruto em ARRAYS de uniforms (posição, desbloqueio, relógio da
 * explosão, surto do caule, hover): o diretor escreve 3 números por fruto
 * por frame e correntes, cacos e caules — centenas de instâncias — leem dali.
 * Nenhuma matriz de instância é atualizada pela CPU, nunca.
 */

export const FRUITS = 3;

/** Cor das runas que selam as correntes: carmesim — perigo, interdição. */
const SEAL = [1.0, 0.14, 0.07] as const satisfies RGB;
/** Centro da gaiola em relação ao centro do cristal (o pavilhão é mais longo que a coroa). */
const CAGE_CENTER_Y = (DROP.top + DROP.bottom) / 2;

export interface FruitUniforms {
  [name: string]: IUniform;
  /** Centro de cada cristal (espaço local da árvore). */
  uFruitPos: IUniform<Vector3[]>;
  uFruitColor: IUniform<Vector3[]>;
  /** 0 acorrentado → 1 desperto (animado). */
  uUnlock: IUniform<number[]>;
  /** Segundos desde que as correntes explodiram; −1 = intactas. */
  uBreak: IUniform<number[]>;
  uHover: IUniform<number[]>;
  /** 1 = o jogador tem o que estas correntes exigem: as runas chamam para serem quebradas. */
  uReady: IUniform<number[]>;
  /**
   * Escala do desabrochar (0 → 1, com um leve overshoot): começa no instante
   * em que o último fio do caule pousa — o fruto nasce na ponta do caule.
   */
  uAppear: IUniform<number>;
}

export function createFruitUniforms(centers: readonly (readonly [number, number, number])[], colors: readonly RGB[]): FruitUniforms {
  return {
    uFruitPos: { value: centers.map((c) => new Vector3(...c)) },
    uFruitColor: { value: colors.map((c) => new Vector3(...c)) },
    uUnlock: { value: [0, 0, 0] },
    uBreak: { value: [-1, -1, -1] },
    uHover: { value: [0, 0, 0] },
    uReady: { value: [0, 0, 0] },
    uAppear: { value: 0 },
  };
}

const fruitArraysChunk = glsl`
uniform vec3 uFruitPos[${int(FRUITS)}];
uniform vec3 uFruitColor[${int(FRUITS)}];
uniform float uUnlock[${int(FRUITS)}];
uniform float uBreak[${int(FRUITS)}];
uniform float uHover[${int(FRUITS)}];
uniform float uReady[${int(FRUITS)}];
uniform float uAppear;
`;

/** Rotação de Rodrigues (eixo unitário, ângulo). */
const rotationChunk = glsl`
mat3 axisRotation(vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  float t = 1.0 - c;
  return mat3(
    t * axis.x * axis.x + c, t * axis.x * axis.y + s * axis.z, t * axis.x * axis.z - s * axis.y,
    t * axis.x * axis.y - s * axis.z, t * axis.y * axis.y + c, t * axis.y * axis.z + s * axis.x,
    t * axis.x * axis.z + s * axis.y, t * axis.y * axis.z - s * axis.x, t * axis.z * axis.z + c
  );
}
`;

const DORMANT = glsl`gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`;

// ── Gota líquida (o Fruto-Fissura) ─────────────────────────────────────────

/**
 * O tecido líquido das antigas Fissuras, numa gota pendurada:
 *   vertex    a superfície ondula ao longo da normal com simplex (tecido vivo),
 *             mais forte desperta e sob o cursor; o desabrochar escala a partir
 *             da ponta presa ao caule (o fruto "brota" do caule, não do ar);
 *   fragment  o mesmo líquido das fissuras (fluxo simplex na cor do pilar +
 *             cristas quentes) com uma segunda camada deslocada pelo ângulo de
 *             visão — paralaxe: o líquido tem PROFUNDIDADE dentro da gota —,
 *             e a energia crepitando no contorno (Fresnel), como a borda do rasgo.
 * Acorrentada, a gota está quase coagulada: escura, lenta, a borda mal crepita.
 */
const liquidVertex = glsl`
${commonChunk}
${simplexChunk}
uniform float uTime;
uniform float uAppear;
uniform float uUnlock;
uniform float uHover;
varying vec3 vObject;
varying vec3 vNormalView;
varying vec3 vView;
varying float vDepth;
void main() {
  float speed = mix(0.25, 1.0, uUnlock);
  float ripple = snoise(position * 3.2 + vec3(0.0, uTime * 0.9 * speed, uTime * 0.4 * speed)) * (0.012 + 0.03 * uUnlock + 0.03 * uHover);
  vec3 p = position + normal * ripple;
  // Desabrocha a partir da ponta (presa ao caule).
  p.y -= ${float(DROP.top)};
  p *= uAppear;
  p.y += ${float(DROP.top)};
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  vObject = position;
  vNormalView = normalize(normalMatrix * normal);
  vView = view.xyz;
  vDepth = -view.z;
}
`;

const liquidFragment = glsl`
${commonChunk}
${simplexChunk}
${depthFogChunk}
uniform float uTime;
uniform vec3 uColor;
uniform float uUnlock;
uniform float uBreak;
uniform float uHover;
varying vec3 vObject;
varying vec3 vNormalView;
varying vec3 vView;
varying float vDepth;
void main() {
  vec3 n = normalize(vNormalView);
  vec3 v = normalize(-vView);
  float facing = abs(dot(n, v));
  float fresnel = pow(1.0 - facing, 2.2);
  float speed = mix(0.15, 1.0, uUnlock);

  // O líquido das fissuras: fluxo + cristas quentes...
  float flow = snoise(vObject * 2.6 + vec3(uTime * 0.25 * speed, uTime * 0.35 * speed, uTime * 0.2 * speed));
  // ...e uma camada mais funda, deslocada pela direção de visão (paralaxe interna).
  float deep = snoise(vec3(vObject.xz * 3.4 - v.xy * 0.45, vObject.y * 2.0 + uTime * 0.4 * speed));
  vec3 hot = mix(uColor, vec3(1.0), 0.55);
  vec3 liquid = uColor * (0.55 + 0.35 * flow) + hot * pow(saturate(flow), 6.0) * 1.5 + uColor * saturate(deep) * 0.35;
  liquid *= mix(0.45, 1.0, facing);

  // A borda do rasgo: energia crepitando no contorno.
  float crackle = 0.55 + 0.45 * snoise(vObject * 14.0 + vec3(0.0, 0.0, uTime * 3.2 * speed));
  float rim = smoothstep(0.35, 0.95, fresnel) * crackle;
  vec3 energy = hot * rim * (2.2 + uHover * 2.5);

  // Coagulada (acorrentada): escura, dessaturada, só um fio de borda.
  vec3 dormant = mix(vec3(dot(uColor, vec3(0.33))), uColor, 0.4);
  vec3 sealed = dormant * (0.05 + 0.1 * saturate(flow)) + dormant * rim * 0.35;
  vec3 color = mix(sealed, liquid + energy, uUnlock) * (1.0 + uHover * 0.35);
  // O estilhaçar: a gota estoura em branco e assenta na sua cor.
  if (uBreak >= 0.0) color += vec3(1.0) * exp(-uBreak * 4.0) * 5.0;

  gl_FragColor = vec4(color * mix(1.0, depthFog(vDepth), 0.6), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class LiquidFruitMaterial extends ShaderMaterial {
  constructor(shared: HubUniforms, fruits: FruitUniforms, color: RGB) {
    super({
      vertexShader: liquidVertex,
      fragmentShader: liquidFragment,
      uniforms: {
        uTime: shared.uTime,
        uFogNear: shared.uFogNear,
        uFogFar: shared.uFogFar,
        uAppear: fruits.uAppear,
        uColor: { value: new Color(...color) },
        uUnlock: { value: 0 },
        uBreak: { value: -1 },
        uHover: { value: 0 },
      },
    });
  }

  setState(unlock: number, breakClock: number, hover: number) {
    this.uniforms.uUnlock.value = unlock;
    this.uniforms.uBreak.value = breakClock;
    this.uniforms.uHover.value = hover;
  }
}

// ── Halo + onda de choque ────────────────────────────────────────────────────

const haloVertex = glsl`
uniform float uSize;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  if (uIntensity <= 0.0) { ${DORMANT} return; }
  vec4 view = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  view.xy += position.xy * uSize;
  gl_Position = projectionMatrix * view;
  vUv = uv;
}
`;

const haloFragment = glsl`
uniform float uSize;
uniform float uIntensity;
uniform vec3 uColor;
uniform float uUnlock;
uniform float uBreak;
uniform float uHover;
uniform float uTime;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * uSize; // raio em unidades de mundo
  float glow = exp(-r * r * 2.2) * mix(0.05, 0.85 + 0.2 * sin(uTime * 2.4), uUnlock) * (1.0 + uHover);
  vec3 color = uColor * glow;
  if (uBreak >= 0.0) {
    float k = uBreak;
    float front = k * 3.4;
    float shock = exp(-pow((r - front) / (0.05 + k * 0.08), 2.0)) * exp(-k * 2.2) * 3.0;
    float flash = exp(-r * r * 1.2) * exp(-k * 6.0) * 6.0;
    color += mix(${vec3(SEAL)}, vec3(1.0), 0.55) * shock + vec3(1.0, 0.9, 0.8) * flash;
  }
  gl_FragColor = vec4(color * uIntensity, 1.0);
}
`;

export class HaloMaterial extends ShaderMaterial {
  constructor(shared: HubUniforms, color: RGB) {
    super({
      vertexShader: haloVertex,
      fragmentShader: haloFragment,
      uniforms: {
        uTime: shared.uTime,
        uSize: { value: 3.2 },
        uIntensity: { value: 0 },
        uColor: { value: new Color(...color) },
        uUnlock: { value: 0 },
        uBreak: { value: -1 },
        uHover: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
  }

  setState(appear: number, unlock: number, breakClock: number, hover: number) {
    const u = this.uniforms;
    u.uIntensity.value = appear;
    u.uUnlock.value = unlock;
    u.uBreak.value = breakClock;
    u.uHover.value = hover;
    // O quad cresce só enquanto a onda de choque precisa de espaço.
    u.uSize.value = breakClock >= 0 && breakClock < 1.6 ? 9 : 3.2;
  }
}

// ── Correntes ────────────────────────────────────────────────────────────────

/**
 * Cada elo é uma instância de um toro de 144 triângulos; o vertex shader:
 *   1. acha o laço do elo (3 laços cruzados por fruto, girando devagar em
 *      sentidos alternados) e o ponto dele na gaiola elipsoidal;
 *   2. monta a base (tangente, normal, binormal) e gira os elos ímpares 90°
 *      em torno da tangente — o encadeamento clássico de uma corrente;
 *   3. na explosão, arremessa o elo para fora (velocidade com arrasto
 *      exponencial + gravidade), girando em torno de um eixo aleatório,
 *      incandescente e encolhendo até sumir. Tudo função de (semente, tempo):
 *      zero física na CPU.
 */
const chainVertex = glsl`
${commonChunk}
${fruitArraysChunk}
${rotationChunk}
attribute vec4 aLink; // x fruto · y laço · z elo · w semente
uniform float uTime;
varying vec3 vNormal;
varying vec3 vView;
varying float vRune;
varying float vHeat;
varying float vHover;
varying float vDepth;

const vec3 CAGE = vec3(0.62, 0.9, 0.62);

vec3 loopNormal(float loop, float fruit) {
  vec3 n = loop < 0.5 ? vec3(0.12, 1.0, 0.18) : loop < 1.5 ? vec3(1.0, 0.42, 0.12) : vec3(-0.55, 0.38, 0.9);
  float a = fruit * 1.7;
  return normalize(vec3(cos(a) * n.x - sin(a) * n.z, n.y, sin(a) * n.x + cos(a) * n.z));
}

vec3 loopPoint(vec3 n, float theta) {
  vec3 u = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 v = cross(n, u);
  return (cos(theta) * u + sin(theta) * v) * CAGE;
}

void main() {
  int f = int(aLink.x + 0.5);
  float k = uBreak[f];
  if (k > 3.0 || uAppear <= 0.0) { ${DORMANT} return; }

  vec3 n = loopNormal(aLink.y, aLink.x);
  float direction = mod(aLink.y, 2.0) < 0.5 ? 1.0 : -1.0;
  float theta = aLink.z / ${int(CHAIN.links)}.0 * 6.2831853 + uTime * 0.1 * direction;
  vec3 onLoop = loopPoint(n, theta);
  vec3 tangent = normalize(loopPoint(n, theta + 0.02) - onLoop);
  vec3 outward = normalize(onLoop - tangent * dot(onLoop, tangent));
  vec3 side = cross(tangent, outward);
  bool odd = mod(aLink.z, 2.0) > 0.5;
  mat3 basis = mat3(tangent, odd ? side : outward, odd ? -outward : side);

  vec3 local = position;
  vec3 localNormal = normal;
  vec3 center = uFruitPos[f] + vec3(0.0, ${float(CAGE_CENTER_Y)}, 0.0) + onLoop * uAppear;
  vHeat = 0.0;
  if (k >= 0.0) {
    vec3 h = hash31(aLink.w * 91.7 + aLink.x * 13.1);
    vec3 fly = normalize(outward * 1.2 + (h - 0.5) * 1.4 + vec3(0.0, 0.4, 0.0));
    float speed = 4.5 + h.x * 8.0;
    center += fly * speed * (1.0 - exp(-2.4 * k)) / 2.4 + vec3(0.0, -1.5 * k * k, 0.0);
    mat3 spin = axisRotation(normalize(h * 2.0 - 1.0 + 1e-3), k * (5.0 + h.y * 14.0));
    local = spin * local * (1.0 - smoothstep(1.3, 2.8, k));
    localNormal = spin * localNormal;
    vHeat = exp(-k * 1.8);
  }

  vec4 view = modelViewMatrix * vec4(center + basis * local * uAppear, 1.0);
  gl_Position = projectionMatrix * view;
  vNormal = normalize(normalMatrix * (basis * localNormal));
  vView = view.xyz;
  vDepth = -view.z;
  // Runas: pulsos carmesins circulando no laço — o selo está vivo.
  // Pronta para quebrar (o jogador tem a relíquia): o pulso acelera e aperta — o selo cede.
  float ready = uReady[f];
  vRune = pow(0.5 + 0.5 * sin(theta * 3.0 - uTime * mix(2.2, 6.0, ready) + aLink.y * 2.1), mix(8.0, 4.0, ready)) * mix(1.4, 2.6, ready) + 0.1 + ready * 0.25;
  vHover = uHover[f];
}
`;

const chainFragment = glsl`
${depthFogChunk}
varying vec3 vNormal;
varying vec3 vView;
varying float vRune;
varying float vHeat;
varying float vHover;
varying float vDepth;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(-vView);
  float key = max(dot(n, normalize(vec3(0.3, 0.8, 0.55))), 0.0);
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 iron = vec3(0.05, 0.05, 0.06) * (0.3 + 1.1 * key) + vec3(0.5, 0.55, 0.7) * fresnel * 0.4;
  vec3 rune = ${vec3(SEAL)} * vRune * (0.8 + vHover * 1.6);
  vec3 hot = mix(vec3(1.0, 0.4, 0.12), vec3(1.0, 0.95, 0.85), smoothstep(0.5, 1.0, vHeat)) * vHeat * 6.0;
  gl_FragColor = vec4((iron + rune + hot) * depthFog(vDepth), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class ChainMaterial extends ShaderMaterial {
  constructor(shared: HubUniforms, fruits: FruitUniforms) {
    super({
      vertexShader: chainVertex,
      fragmentShader: chainFragment,
      uniforms: { ...fruits, uTime: shared.uTime, uFogNear: shared.uFogNear, uFogFar: shared.uFogFar },
    });
  }
}

// ── Cacos ────────────────────────────────────────────────────────────────────

/** Estilhaços de metal incandescente: só existem nos ~2.6s depois da explosão. */
const shardVertex = glsl`
${fruitArraysChunk}
${rotationChunk}
attribute vec4 aShard; // x fruto · yzw sementes
varying vec3 vView;
varying float vHeat;
varying float vDepth;
void main() {
  int f = int(aShard.x + 0.5);
  float k = uBreak[f];
  if (k < 0.0 || k > 2.8) { ${DORMANT} return; }
  vec3 seeds = aShard.yzw;
  vec3 fly = normalize(seeds * 2.0 - 1.0 + vec3(0.0, 0.3, 0.0));
  float speed = 3.5 + seeds.x * 11.0;
  vec3 center = uFruitPos[f] + vec3(0.0, ${float(CAGE_CENTER_Y)}, 0.0) + fly * (0.4 + speed * (1.0 - exp(-2.0 * k)) / 2.0)
              + vec3(0.0, -1.3 * k * k, 0.0);
  mat3 spin = axisRotation(normalize(seeds.zxy * 2.0 - 1.0 + 1e-3), k * (6.0 + seeds.z * 16.0));
  float size = (0.025 + seeds.y * 0.07) * (1.0 - smoothstep(1.5, 2.8, k));
  vec4 view = modelViewMatrix * vec4(center + spin * position * size, 1.0);
  gl_Position = projectionMatrix * view;
  vView = view.xyz;
  vHeat = exp(-k * 1.5);
  vDepth = -view.z;
}
`;

const shardFragment = glsl`
${depthFogChunk}
varying vec3 vView;
varying float vHeat;
varying float vDepth;
void main() {
  vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
  float key = max(dot(n, normalize(vec3(0.3, 0.8, 0.55))), 0.0);
  vec3 iron = vec3(0.06, 0.06, 0.07) * (0.3 + key);
  vec3 hot = mix(vec3(1.0, 0.25, 0.08), vec3(1.0, 0.9, 0.7), smoothstep(0.55, 1.0, vHeat)) * vHeat * (3.0 + key * 2.0);
  gl_FragColor = vec4((iron + hot) * depthFog(vDepth), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class ShardMaterial extends ShaderMaterial {
  constructor(shared: HubUniforms, fruits: FruitUniforms) {
    super({
      vertexShader: shardVertex,
      fragmentShader: shardFragment,
      uniforms: { ...fruits, uFogNear: shared.uFogNear, uFogFar: shared.uFogFar },
    });
  }
}
