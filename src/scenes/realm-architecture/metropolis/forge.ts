import {
  AdditiveBlending,
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  FloatType,
  HalfFloatType,
  LatheGeometry,
  LineSegments,
  Mesh,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Camera,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { GPUComputationRenderer, type Variable } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { warmGpu } from '@/engine/gl/warmup';
import { debugLog } from '@/engine/debug';

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
import type { PerformanceTier } from '@/engine/config/performance';
import { mulberry32 } from '@/engine/lib/random';
import { glsl } from '@/shaders/glsl';
import { simplexChunk } from '@/shaders/chunks/simplex.glsl';
import { ParticleSeeder, type ShardField } from './shatter';

/**
 * A FORJA DO ORQUESTRADOR — dezenas de milhares de partículas simuladas
 * inteiramente na GPU (GPGPU: posição e velocidade vivem em texturas float
 * de ping-pong; cada pixel é uma partícula; a CPU só escreve uniforms).
 *
 *   CAOS     o campo de velocidade é o ROTACIONAL de um potencial de simplex
 *            noise (curl noise): divergência zero — as partículas fluem em
 *            redemoinhos sem se aglomerar nem esvaziar regiões;
 *   ATRATOR  perto do ponteiro, a velocidade é puxada para uma órbita (cada
 *            partícula com seu raio e plano): o ponteiro em movimento arrasta
 *            anéis de luz — os rastros harmônicos;
 *   FORJA    em 100% de ressonância, implodem no centro e se depositam na
 *            superfície da Gota de Seiva Pura (pontos pré-amostrados na malha).
 *
 * Desenho: cada partícula é um segmento da posição até posição − v·Δt (o
 * rastro vem da própria velocidade), aditivo. 1 draw call.
 */

/** Partículas por tier (textura de simulação). */
export const FORGE_SIZE: Record<PerformanceTier, readonly [number, number]> = { high: [256, 256], mid: [256, 128], low: [128, 128] };

/** A gota: ponta fina em cima, fundo pesado e redondo (mesma curva das gotas da hub). */
const SAP = { top: 1.55, bottom: -1.45, width: 1.0 } as const;
function sapProfile() {
  const STEPS = 40;
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = (i / STEPS) * Math.PI;
    const x = Math.sin(t) * Math.pow(Math.sin(t / 2), 0.9) * SAP.width;
    return new Vector2(Math.max(x, 1e-4), SAP.bottom + ((Math.cos(t) + 1) / 2) * (SAP.top - SAP.bottom));
  });
}

const velocityShader = glsl`
${simplexChunk}
uniform float uDt;
uniform float uTime;
uniform float uChaos;
uniform float uOrder;
uniform float uActive;
uniform float uRadius;
uniform float uForge;
uniform vec3 uAttractor;
uniform vec3 uAttractorVel;
uniform vec3 uBounds;
uniform vec3 uCenter;

/** Rotacional 2D de um potencial ψ: (∂ψ/∂y, −∂ψ/∂x) — campo sem divergência. */
vec2 curl2(vec3 q) {
  const float E = 0.07;
  float n0 = snoise(q);
  return vec2(snoise(q + vec3(0.0, E, 0.0)) - n0, -(snoise(q + vec3(E, 0.0, 0.0)) - n0)) / E;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 P = texture2D(texturePosition, uv);
  vec4 V = texture2D(textureVelocity, uv);
  vec3 p = P.xyz;
  vec3 v = V.xyz;
  float h = P.w;

  if (uForge > 0.0) {
    // Na forja a posição é guiada diretamente; a velocidade só desenha o rastro do mergulho.
    vec3 pull = (uCenter - p) * 1.4 * (1.0 - smoothstep(0.4, 0.85, uForge));
    gl_FragColor = vec4(mix(v, pull, 1.0 - exp(-uDt * 6.0)), V.w);
    return;
  }

  vec2 flow = curl2(vec3(p.xy * 0.24, uTime * 0.08)) + 0.5 * curl2(vec3(p.xy * 0.55 + 3.1, uTime * 0.13));
  float depth = snoise(vec3(p.yx * 0.3, uTime * 0.1 + 7.0));
  vec3 chaos = vec3(flow * 0.55, depth * 0.45) * uChaos;
  chaos -= max(abs(p) - uBounds, 0.0) * sign(p) * 1.6;     // contenção suave

  vec3 toA = uAttractor - p;
  float d = length(toA) + 1e-3;
  vec3 dir = toA / d;
  float ring = uRadius * (0.25 + 1.35 * fract(h * 7.31)); // anéis espalhados: órbitas em camadas, não um nó
  float reach = uRadius * (2.2 + 0.7 * uOrder);
  float capture = uActive * (1.0 - smoothstep(reach * 0.55, reach, d));
  vec3 axis = normalize(vec3((fract(h * 3.7) - 0.5) * 0.9, (fract(h * 5.3) - 0.5) * 0.9, 1.0));
  vec3 tangent = normalize(cross(axis, dir) + 1e-5);
  // Órbita firme (mola forte até o anel) que acompanha o ponteiro por inteiro.
  vec3 orbit = tangent * (2.2 + 2.4 * uOrder) * sqrt(uRadius / (d + 0.2)) + dir * (d - ring) * 4.5 + uAttractorVel;
  // Gravidade de longo alcance: mesmo fora do anel de captura, o fluxo é puxado para o ponteiro.
  vec3 gravity = dir * uActive * 2.6 * (1.0 - smoothstep(reach, reach * 1.7, d)) * (1.0 - capture);

  vec3 target = mix(chaos + gravity, orbit, capture);
  v += (target - v) * (1.0 - exp(-uDt * mix(2.2, 11.0, capture)));
  gl_FragColor = vec4(v, mix(V.w, capture, 1.0 - exp(-uDt * 4.0)));
}
`;

const positionShader = glsl`
uniform float uDt;
uniform float uForge;
uniform float uSapAngle;
uniform float uSapScale;
uniform vec3 uCenter;
uniform sampler2D uSap;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 P = texture2D(texturePosition, uv);
  vec4 V = texture2D(textureVelocity, uv);
  vec3 p = P.xyz;
  if (uForge > 0.0) {
    vec3 s = texture2D(uSap, uv).xyz;
    float c = cos(uSapAngle);
    float n = sin(uSapAngle);
    vec3 surface = uCenter + vec3(c * s.x + n * s.z, s.y, -n * s.x + c * s.z) * uSapScale;
    // Primeiro implodem num núcleo minúsculo; depois se depositam na casca da gota.
    vec3 target = mix(uCenter + (surface - uCenter) * 0.18, surface, smoothstep(0.42, 0.85, uForge));
    p = mix(p, target, 1.0 - exp(-uDt * (2.5 + 7.0 * uForge)));
  } else {
    p += V.xyz * uDt;
  }
  gl_FragColor = vec4(p, P.w);
}
`;

/** Os rastros: segmento da posição até posição − direção·comprimento, aditivo. */
class ParticleTrailMaterial extends ShaderMaterial {
  constructor(seed: Texture) {
    super({
      vertexShader: glsl`
        attribute vec2 aRef;
        attribute float aEnd;
        uniform sampler2D uPosition;
        uniform sampler2D uVelocity;
        uniform sampler2D uSeed;
        uniform sampler2D uCapture;
        uniform float uClock;
        uniform float uAwake;
        uniform float uFade;
        uniform float uOrder;
        uniform float uTrail;
        varying vec3 vColor;

        void main() {
          vec4 S = texture2D(uSeed, aRef);
          float visible = smoothstep(S.w, S.w + 0.3, uClock) * uFade * step(0.001, S.w);
          if (visible <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          vec4 P = texture2D(uPosition, aRef);
          vec4 V = texture2D(uVelocity, aRef);
          float speed = length(V.xyz);
          vec3 dir = speed > 1e-4 ? V.xyz / speed : normalize(vec3(S.z - 0.5, fract(S.z * 7.13) - 0.5, 0.05));
          // Quem orbita deixa rastro mais longo (a luz "desenha" a órbita) — moderado: milhares se sobrepõem no mesmo lugar.
          vec3 p = P.xyz - dir * max(speed * uTrail * (1.0 + V.w * 0.9), 0.02) * aEnd;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);

          // Nasce com a cor do pixel do vidro; desperta para a paleta do fluxo.
          vec3 captured = pow(texture2D(uCapture, S.xy).rgb, vec3(2.2)) * 1.6 + vec3(0.05, 0.1, 0.14);
          // O grão acende ao se soltar do vidro (faísca de nascimento).
          float birth = smoothstep(S.w, S.w + 0.12, uClock) * (1.0 - smoothstep(S.w + 0.12, S.w + 0.9, uClock));
          captured += vec3(0.45, 0.85, 1.0) * birth * 1.6;
          vec3 chaos = mix(vec3(0.38, 0.26, 0.95), vec3(0.14, 0.6, 1.0), S.z) * 0.55;
          // Em órbita, milhares de rastros se sobrepõem (aditivo): cada um é tênue para o conjunto
          // desenhar anéis de luz, e não saturar num borrão branco.
          vec3 order = mix(vec3(0.1, 0.85, 0.6), vec3(0.35, 0.85, 1.0), S.z) * (0.045 + min(speed, 4.0) * 0.009);
          vec3 color = mix(chaos, order, clamp(V.w + uOrder * 0.35, 0.0, 1.0));
          vColor = mix(captured, color, uAwake) * visible * (1.0 - aEnd * 0.92);
        }`,
      fragmentShader: glsl`
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      uniforms: {
        uPosition: { value: null },
        uVelocity: { value: null },
        uSeed: { value: seed },
        uCapture: { value: null },
        uClock: { value: 0 },
        uAwake: { value: 0 },
        uFade: { value: 0 },
        uOrder: { value: 0 },
        uTrail: { value: 0.05 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    });
  }
}

/**
 * A Gota de Seiva Pura: líquido de luz na cor da Yggdrasil. Os vértices
 * ondulam com simplex noise (superfície viva), a gota pulsa como um coração,
 * veios de energia sobem por dentro, borda de fresnel e reflexo especular.
 * Ela se ENCHE de baixo para cima (o menisco brilha) enquanto as partículas
 * pousam na sua casca. HDR: o bloom faz o resto.
 */
class SapMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        ${simplexChunk}
        uniform float uTime;
        uniform float uReveal;
        uniform float uBeat;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLocal;
        varying float vNoise;
        void main() {
          float n = snoise(position * 1.4 + vec3(0.0, uTime * 0.7, uTime * 0.3));
          vec3 p = position * (1.0 + uBeat * 0.035) + normal * n * 0.07 * (0.4 + 0.6 * uReveal);
          vec4 view = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * view;
          vNormal = normalize(normalMatrix * normal);
          vView = view.xyz;
          vLocal = position;
          vNoise = n;
        }`,
      fragmentShader: glsl`
        uniform float uReveal;
        uniform float uTime;
        uniform float uGlow;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLocal;
        varying float vNoise;
        void main() {
          float h = (vLocal.y - (${SAP.bottom.toFixed(2)})) / ${(SAP.top - SAP.bottom).toFixed(2)};
          float level = uReveal * 1.08 - 0.04;
          float meniscus = exp(-pow((h - level) * 40.0, 2.0)) * step(uReveal, 0.999);
          if (h > level + 0.01 && meniscus < 0.02) discard;
          vec3 n = normalize(vNormal);
          vec3 v = normalize(-vView);
          float facing = max(dot(n, v), 0.0);
          float fresnel = pow(1.0 - facing, 3.0);
          float spec = pow(max(dot(reflect(-normalize(vec3(-0.4, 0.7, 0.6)), n), v), 0.0), 70.0);
          float flow = 0.5 + 0.5 * sin(vLocal.y * 9.0 - uTime * 2.2 + vNoise * 3.0);
          vec3 sap = vec3(0.05, 0.95, 0.55);
          float heart = exp(-dot(vLocal.xz, vLocal.xz) * 2.0) * 0.6;
          // Contida: o bloom já dá a aura — sem isto, a gota estourava em branco (no retrato, ainda mais).
          vec3 color = sap * (0.7 + 0.3 * flow + heart) * (0.35 + 0.55 * facing) * (0.75 + uGlow)
                     + vec3(0.7, 1.0, 0.9) * fresnel * 0.9 + vec3(1.0) * spec * 1.6 + vec3(0.8, 1.0, 0.95) * meniscus * 2.4;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      uniforms: { uReveal: { value: 0 }, uTime: { value: 0 }, uGlow: { value: 0 }, uBeat: { value: 0 } },
    });
  }
}

/** Pontos na superfície da gota, proporcionais à área (onde cada partícula pousa). Sem alocação por ponto. */
function surfaceTargets(geometry: BufferGeometry, out: Float32Array, count: number) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = flat.getAttribute('position').array as Float32Array;
  const triangles = p.length / 9;
  const cdf = new Float32Array(triangles);
  let total = 0;
  for (let t = 0; t < triangles; t++) {
    const o = t * 9;
    const ux = p[o + 3] - p[o];
    const uy = p[o + 4] - p[o + 1];
    const uz = p[o + 5] - p[o + 2];
    const vx = p[o + 6] - p[o];
    const vy = p[o + 7] - p[o + 1];
    const vz = p[o + 8] - p[o + 2];
    total += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    cdf[t] = total;
  }
  const rng = mulberry32(0x9715);
  for (let i = 0; i < count; i++) {
    // Busca binária na CDF (a gota tem ~3.800 triângulos).
    const pick = rng() * total;
    let lo = 0;
    let hi = triangles - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < pick) lo = mid + 1;
      else hi = mid;
    }
    let r1 = rng();
    let r2 = rng();
    if (r1 + r2 > 1) {
      r1 = 1 - r1;
      r2 = 1 - r2;
    }
    const o = lo * 9;
    const k = i * 4;
    for (let c = 0; c < 3; c++) out[k + c] = p[o + c] + (p[o + 3 + c] - p[o + c]) * r1 + (p[o + 6 + c] - p[o + c]) * r2;
    out[k + 3] = 1;
  }
  if (flat !== geometry) flat.dispose();
}

function dataTexture(data: Float32Array, width: number, height: number) {
  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export interface ForgeFrame {
  dt: number;
  time: number;
  chaos: number;
  order: number;
  active: number;
  radius: number;
  forge: number;
  sapAngle: number;
  /** Onde a gota se forma e em que escala (no retrato, menor e mais alta: a janela da relíquia fica embaixo). */
  sapCenter: Vector3;
  sapScale: number;
  attractor: Vector3;
  attractorVel: Vector3;
  bounds: Vector3;
}

export class ParticleForge {
  readonly width: number;
  readonly height: number;
  readonly count: number;
  private readonly gpu: GPUComputationRenderer;
  private readonly position: Variable;
  private readonly velocity: Variable;
  private readonly seedTexture: DataTexture;
  private readonly sapTexture: DataTexture;
  readonly trails: LineSegments<BufferGeometry, ParticleTrailMaterial>;
  readonly sap: Mesh<BufferGeometry, SapMaterial>;
  private seeder: { key: string; job: ParticleSeeder } | null = null;
  private readonly zero: DataTexture;

  constructor(gl: WebGLRenderer, tier: PerformanceTier) {
    const t0 = performance.now();
    [this.width, this.height] = FORGE_SIZE[tier];
    this.count = this.width * this.height;
    this.gpu = new GPUComputationRenderer(this.width, this.height, gl);
    // Precisão: float de 32 bits onde dá para renderizar nele; meio float no resto.
    if (!gl.extensions.has('EXT_color_buffer_float')) this.gpu.setDataType(HalfFloatType);
    this.zero = dataTexture(new Float32Array(this.count * 4), this.width, this.height);
    this.velocity = this.gpu.addVariable('textureVelocity', velocityShader, this.gpu.createTexture());
    this.position = this.gpu.addVariable('texturePosition', positionShader, this.gpu.createTexture());
    this.gpu.setVariableDependencies(this.velocity, [this.velocity, this.position]);
    this.gpu.setVariableDependencies(this.position, [this.velocity, this.position]);

    const sapGeometry = new LatheGeometry(sapProfile(), 48);
    sapGeometry.deleteAttribute('uv');
    // Os alvos na gota só importam na forja: calculados depois, num frame próprio (ver fillTargets).
    this.sapTexture = dataTexture(new Float32Array(this.count * 4), this.width, this.height);
    Object.assign(this.velocity.material.uniforms, {
      uDt: { value: 0 },
      uTime: { value: 0 },
      uChaos: { value: 1 },
      uOrder: { value: 0 },
      uActive: { value: 0 },
      uRadius: { value: 0.6 },
      uForge: { value: 0 },
      uAttractor: { value: new Vector3() },
      uAttractorVel: { value: new Vector3() },
      uBounds: { value: new Vector3(5, 3, 2) },
      uCenter: { value: new Vector3() },
    });
    Object.assign(this.position.material.uniforms, {
      uDt: { value: 0 },
      uForge: { value: 0 },
      uSapAngle: { value: 0 },
      uSapScale: { value: 1 },
      uCenter: { value: new Vector3() },
      uSap: { value: this.sapTexture },
    });
    const t1 = performance.now();
    const error = this.gpu.init();
    if (error) console.error('[forja]', error);
    const t2 = performance.now();

    this.seedTexture = dataTexture(new Float32Array(this.count * 4), this.width, this.height);
    const ref = new Float32Array(this.count * 4);
    const end = new Float32Array(this.count * 2);
    for (let i = 0; i < this.count; i++) {
      const u = ((i % this.width) + 0.5) / this.width;
      const v = (Math.floor(i / this.width) + 0.5) / this.height;
      ref.set([u, v, u, v], i * 4);
      end[i * 2 + 1] = 1;
    }
    const trails = new BufferGeometry();
    trails.setAttribute('position', new Float32BufferAttribute(new Float32Array(this.count * 6), 3));
    trails.setAttribute('aRef', new Float32BufferAttribute(ref, 2));
    trails.setAttribute('aEnd', new Float32BufferAttribute(end, 1));
    this.trails = Object.assign(new LineSegments(trails, new ParticleTrailMaterial(this.seedTexture)), { frustumCulled: false, renderOrder: 5, name: 'forge-trails' });
    this.sap = Object.assign(new Mesh(sapGeometry, new SapMaterial()), { frustumCulled: false, renderOrder: 6, name: 'forge-sap', visible: false });
    debugLog(`[warmup] forja: texturas ${(t1 - t0).toFixed(0)}ms · gpu.init ${(t2 - t1).toFixed(0)}ms · rastros ${(performance.now() - t2).toFixed(0)}ms`);
  }

  private targetsReady = false;

  /** Onde cada partícula pousa na gota (CPU). Idempotente; separado da construção para não pesar no mesmo frame. */
  fillTargets() {
    if (this.targetsReady) return;
    surfaceTargets(this.sap.geometry, this.sapTexture.image.data as Float32Array, this.count);
    this.sapTexture.needsUpdate = true;
    this.targetsReady = true;
  }

  /**
   * Calcula (CPU) onde cada partícula nasce, `budget` partículas por chamada
   * — durante a interrupção, com a origem da falha (o botão) já conhecida.
   */
  prepare(field: ShardField, origin: Vector2, aspect: number, budget = Infinity) {
    const key = `${origin.x.toFixed(4)}:${origin.y.toFixed(4)}:${aspect.toFixed(4)}`;
    if (this.seeder?.key !== key) this.seeder = { key, job: new ParticleSeeder(field, origin.clone(), aspect, this.count) };
    if (!this.seeder.job.done) this.seeder.job.run(budget);
    return this.seeder.job;
  }

  /** No frame da falha: termina o que faltar e sobe o nascimento das partículas para a GPU. */
  seed(field: ShardField, origin: Vector2, aspect: number) {
    const { position, seed } = this.prepare(field, origin, aspect);
    const start = dataTexture(position, this.width, this.height);
    for (const target of this.position.renderTargets) this.gpu.renderTexture(start, target);
    for (const target of this.velocity.renderTargets) this.gpu.renderTexture(this.zero, target);
    start.dispose();
    (this.seedTexture.image.data as Float32Array).set(seed);
    this.seedTexture.needsUpdate = true;
  }

  /** Um passo de simulação (2 passes de tela cheia na textura de partículas). */
  step(frame: ForgeFrame) {
    const v = this.velocity.material.uniforms;
    v.uDt.value = frame.dt;
    v.uTime.value = frame.time;
    v.uChaos.value = frame.chaos;
    v.uOrder.value = frame.order;
    v.uActive.value = frame.active;
    v.uRadius.value = frame.radius;
    v.uForge.value = frame.forge;
    v.uAttractor.value.copy(frame.attractor);
    v.uAttractorVel.value.copy(frame.attractorVel);
    v.uBounds.value.copy(frame.bounds);
    const p = this.position.material.uniforms;
    p.uDt.value = frame.dt;
    p.uForge.value = frame.forge;
    p.uSapAngle.value = frame.sapAngle;
    p.uSapScale.value = frame.sapScale;
    p.uCenter.value.copy(frame.sapCenter);
    v.uCenter.value.copy(frame.sapCenter);
    this.gpu.compute();
  }

  /** Uniforms de desenho (após `step`): as texturas atuais do ping-pong. */
  render(capture: Texture | null, clock: number, awake: number, fade: number, order: number) {
    const u = this.trails.material.uniforms;
    u.uPosition.value = this.gpu.getCurrentRenderTarget(this.position).texture;
    u.uVelocity.value = this.gpu.getCurrentRenderTarget(this.velocity).texture;
    u.uCapture.value = capture;
    u.uClock.value = clock;
    u.uAwake.value = awake;
    u.uFade.value = fade;
    u.uOrder.value = order;
    u.uTrail.value = 0.06 + 0.06 * order;
  }

  /**
   * Aquece os programas de simulação e de desenho (no aquecimento, nunca no
   * meio da cena) — com um draw de verdade: sem KHR_parallel_shader_compile
   * o driver adia o LINK até o primeiro uso, e só compilar não basta (medido:
   * 45 ms de getProgramParameter na entrada do caos).
   */
  async compile(gl: WebGLRenderer, camera: Camera) {
    this.fillTargets();
    await nextFrame();
    // Um programa por frame: aquecer tudo de uma vez travava a hub (visível) num frame só.
    const quad = new PlaneGeometry(2, 2);
    const sap = Object.assign(this.sap.clone(), { visible: true });
    const steps: [Mesh | LineSegments, boolean][] = [
      [new Mesh(quad, this.velocity.material), true],
      [new Mesh(quad, this.position.material), true],
      [this.trails.clone(), false],
      [sap, false],
    ];
    for (const [object, offscreen] of steps) {
      const stage = new Scene();
      stage.add(Object.assign(object, { frustumCulled: false }));
      await warmGpu(gl, stage, camera, offscreen || undefined);
      await nextFrame();
    }
    quad.dispose();
  }

  dispose() {
    this.gpu.dispose();
    this.zero.dispose();
    this.seedTexture.dispose();
    this.sapTexture.dispose();
    this.trails.geometry.dispose();
    this.trails.material.dispose();
    this.sap.geometry.dispose();
    this.sap.material.dispose();
  }
}
