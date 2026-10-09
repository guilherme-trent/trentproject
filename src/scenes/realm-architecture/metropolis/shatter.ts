import { BufferGeometry, DoubleSide, Float32BufferAttribute, ShaderMaterial, Vector2 } from 'three';
import { mulberry32 } from '@/engine/lib/random';
import { float, glsl } from '@/shaders/glsl';
import { noiseChunk } from '@/shaders/chunks/noise.glsl';
import { FORGE, SHATTER } from './config';

/**
 * ESTILHAÇO ZERO-G — a tela vira vidro e explode CONTRA a câmera; os cacos
 * desaceleram até parar no ar (bullet-time, sem gravidade), ficam suspensos
 * e se desintegram em poeira digital. Cada grão dessa poeira é uma partícula
 * da Etapa 2, nascida exatamente sobre o pixel do caco que se desfez.
 *
 * Para isso a pose FINAL de cada caco é uma função fechada (sem simulação):
 * o vertex shader a interpola com easeOutCubic, e `ParticleSeeder` a aplica
 * em JS aos pontos de onde as partículas nascem. Mesmas fórmulas, mesmas
 * constantes, nos dois lados.
 */

/** Distância da câmera virtual dos cacos (em alturas de tela). */
const PERSPECTIVE = 2.2;

/** Por caco (a partir do impacto): v0, v1, v2, centro (xy cada) · eixo (xyz), giro, empurrão (xyz), semente x. */
const STRIDE = 16;
const AT = { a: 0, b: 2, c: 4, center: 6, axis: 8, spin: 11, push: 12, seed: 15 } as const;

export interface ShardField {
  geometry: BufferGeometry;
  data: Float32Array;
  count: number;
}

/** A pose final de um caco — compartilhada (em espírito e números) com o vertex shader abaixo. */
function finalPose(cx: number, cy: number, sx: number, sy: number, sz: number) {
  const ax = sx * 2 - 1;
  const ay = sy * 2 - 1;
  const az = sz * 2 - 1 + 0.35;
  const al = Math.hypot(ax, ay, az) || 1;
  const spin = (0.5 + 1.6 * sy) * (sz > 0.5 ? 1 : -1);
  const dist = Math.hypot(cx, cy);
  const ox = cx / Math.max(dist, 1e-3);
  const oy = cy / Math.max(dist, 1e-3);
  const punch = Math.exp(-dist * 1.6);
  const out = (0.025 + 0.1 * punch) * (0.5 + sz);
  return { axis: [ax / al, ay / al, az / al], spin, push: [ox * out, oy * out, (0.08 + 0.42 * sy) * (0.45 + 0.55 * punch)] };
}

/**
 * Teia de vidro por impacto: raios + anéis log-espaçados (pó perto do
 * clique, placas largas na periferia), jitter compartilhado entre vizinhos
 * (sem frestas), cada célula em dois triângulos. Unidades: alturas de tela
 * a partir do ponto de impacto.
 */
export function createShardField(): ShardField {
  const SPOKES = 30;
  const RINGS = 15;
  const INNER = 0.018;
  const OUTER = 3.2;
  const rng = mulberry32(0x5ca7);
  const grid: [number, number][][] = [];
  for (let j = 0; j <= RINGS; j++) {
    const row: [number, number][] = [];
    const radius = j === 0 ? 0 : INNER * Math.pow(OUTER / INNER, (j - 1) / (RINGS - 1));
    for (let i = 0; i < SPOKES; i++) {
      const angle = ((i + (j === 0 ? 0 : (rng() - 0.5) * 0.7)) / SPOKES) * Math.PI * 2;
      const r = radius * (1 + (j > 1 && j < RINGS ? (rng() - 0.5) * 0.45 : 0));
      row.push([Math.cos(angle) * r, Math.sin(angle) * r]);
    }
    grid.push(row);
  }
  const positions: number[] = [];
  const centers: number[] = [];
  const bary: number[] = [];
  const seeds: number[] = [];
  const data: number[] = [];
  const shard = (a: [number, number], b: [number, number], c: [number, number]) => {
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    const seed = [rng(), rng(), rng()];
    [a, b, c].forEach((p, k) => {
      positions.push(p[0], p[1], 0);
      centers.push(cx, cy);
      bary.push(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0);
      seeds.push(...seed);
    });
    const pose = finalPose(cx, cy, seed[0], seed[1], seed[2]);
    data.push(...a, ...b, ...c, cx, cy, ...pose.axis, pose.spin, ...pose.push, seed[0]);
  };
  for (let j = 0; j < RINGS; j++)
    for (let i = 0; i < SPOKES; i++) {
      const n = (i + 1) % SPOKES;
      const [a, b, c, d] = [grid[j][i], grid[j][n], grid[j + 1][n], grid[j + 1][i]];
      if (j === 0) {
        shard(a, c, d);
        continue;
      }
      if (rng() < 0.5) {
        shard(a, b, c);
        shard(a, c, d);
      } else {
        shard(a, b, d);
        shard(b, c, d);
      }
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aCenter', new Float32BufferAttribute(centers, 2));
  geometry.setAttribute('aBary', new Float32BufferAttribute(bary, 3));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 3));
  return { geometry, data: new Float32Array(data), count: data.length / STRIDE };
}

/** Quando a poeira de um caco começa a se soltar (s desde o clique). */
const dissolveAt = (dist: number, reach: number, sx: number) => SHATTER.dissolveStart + (dist / reach) * 0.35 + sx * 0.15;

/**
 * As partículas nascem SOBRE os cacos congelados: amostra pontos nos cacos
 * (proporcional à área — densidade de pixels), descarta o que caiu fora da
 * tela original, aplica a pose final do caco e converte para o mundo da
 * forja (câmera que reproduz a perspectiva dos cacos).
 *
 * FATIADO: `run(budget)` processa no máximo `budget` partículas por chamada
 * — o trabalho se espalha pelos frames da interrupção (medido: 34 ms num
 * frame só, para 32 mil partículas).
 *
 * Saída: position = xyz mundo + w semente · seed = uv no frame capturado, aleatório, instante de nascimento.
 */
export class ParticleSeeder {
  readonly position: Float32Array;
  readonly seed: Float32Array;
  private readonly cdf: Float32Array;
  private readonly total: number;
  private readonly rng = mulberry32(0x9e37);
  private next = 0;

  constructor(
    private readonly field: ShardField,
    private readonly origin: Vector2,
    private readonly aspect: number,
    readonly count: number,
  ) {
    const { data } = field;
    const ox = origin.x * aspect;
    const oy = origin.y;
    // CDF por área — só dos cacos que tocam a tela (a teia polar é bem maior que ela).
    this.cdf = new Float32Array(field.count);
    let total = 0;
    for (let i = 0; i < field.count; i++) {
      const o = i * STRIDE;
      const ax = data[o + AT.a];
      const ay = data[o + AT.a + 1];
      const bx = data[o + AT.b];
      const by = data[o + AT.b + 1];
      const cx = data[o + AT.c];
      const cy = data[o + AT.c + 1];
      const outside = Math.max(ax, bx, cx) + ox < 0 || Math.min(ax, bx, cx) + ox > aspect || Math.max(ay, by, cy) + oy < 0 || Math.min(ay, by, cy) + oy > 1;
      if (!outside) total += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
      this.cdf[i] = total;
    }
    this.total = total;
    this.position = new Float32Array(count * 4);
    this.seed = new Float32Array(count * 4);
  }

  get done() {
    return this.next >= this.count;
  }

  run(budget = Infinity) {
    const { data } = this.field;
    const { rng, cdf, total, aspect, position, seed } = this;
    const S = FORGE.worldScale;
    const ox = this.origin.x * aspect;
    const oy = this.origin.y;
    const reach = Math.hypot(aspect, 1);
    const end = Math.min(this.count, this.next + budget);
    for (let i = this.next; i < end; i++) {
      for (let attempt = 0; attempt < 16; attempt++) {
        const pick = rng() * total;
        let lo = 0;
        let hi = this.field.count - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (cdf[mid] < pick) lo = mid + 1;
          else hi = mid;
        }
        const o = lo * STRIDE;
        let r1 = rng();
        let r2 = rng();
        if (r1 + r2 > 1) {
          r1 = 1 - r1;
          r2 = 1 - r2;
        }
        const ax = data[o + AT.a];
        const ay = data[o + AT.a + 1];
        const px = ax + (data[o + AT.b] - ax) * r1 + (data[o + AT.c] - ax) * r2;
        const py = ay + (data[o + AT.b + 1] - ay) * r1 + (data[o + AT.c + 1] - ay) * r2;
        const u = (ox + px) / aspect;
        const v = oy + py;
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;

        const cx = data[o + AT.center];
        const cy = data[o + AT.center + 1];
        const kx = data[o + AT.axis];
        const ky = data[o + AT.axis + 1];
        const kz = data[o + AT.axis + 2];
        const spin = data[o + AT.spin];
        // Rodrigues com v = (lx, ly, 0): v·cos + (k × v)·sen + k·(k·v)·(1 − cos).
        const lx = px - cx;
        const ly = py - cy;
        const c = Math.cos(spin);
        const s = Math.sin(spin);
        const kv = (kx * lx + ky * ly) * (1 - c);
        const rx = lx * c - kz * ly * s + kx * kv;
        const ry = ly * c + kz * lx * s + ky * kv;
        const rz = (kx * ly - ky * lx) * s + kz * kv;

        const k = i * 4;
        position[k] = (ox + cx + rx + data[o + AT.push] - aspect / 2) * S;
        position[k + 1] = (oy + cy + ry + data[o + AT.push + 1] - 0.5) * S;
        position[k + 2] = (rz + data[o + AT.push + 2]) * S;
        position[k + 3] = rng();
        seed[k] = u;
        seed[k + 1] = v;
        seed[k + 2] = rng();
        seed[k + 3] = dissolveAt(Math.sqrt(cx * cx + cy * cy), reach, data[o + AT.seed]) + rng() * SHATTER.dissolve * 0.8;
        break;
      }
    }
    this.next = end;
    return this.done;
  }
}

/**
 * O vidro: trinca correndo, explosão contra a câmera com easeOutCubic (os
 * cacos param no ar), giro congelado, desintegração por limiar de ruído com
 * borda incandescente. Desenhado depois do composer (cores do frame
 * capturado intactas). 1 draw call.
 */
export class ZeroGShatterMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        attribute vec2 aCenter;
        attribute vec3 aBary;
        attribute vec3 aSeed;
        uniform vec2 uOrigin;
        uniform float uAspect;
        uniform float uClock;
        uniform float uActive;
        varying vec2 vUv;
        varying vec3 vBary;
        varying float vCrack;
        varying float vShade;
        varying float vGlint;
        varying float vDissolve;

        vec3 rotate(vec3 v, vec3 axis, float angle) {
          float c = cos(angle);
          float s = sin(angle);
          return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
        }

        void main() {
          if (uActive < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          vec2 aspect = vec2(uAspect, 1.0);
          vec2 origin = uOrigin * aspect;
          float dist = length(aCenter);
          float reach = length(aspect);
          float front = smoothstep(0.0, ${float(SHATTER.crack)}, uClock) * reach * 1.25;
          vCrack = 1.0 - smoothstep(front - 0.12, front, dist);

          float release = ${float(SHATTER.crack * 0.6)} + (dist / reach) * 0.18 + aSeed.x * 0.05;
          float e = 1.0 - pow(1.0 - clamp((uClock - release) / ${float(SHATTER.explode)}, 0.0, 1.0), 3.0);

          vec3 axis = normalize(aSeed * 2.0 - 1.0 + vec3(0.0, 0.0, 0.35));
          float spin = (0.5 + 1.6 * aSeed.y) * (aSeed.z > 0.5 ? 1.0 : -1.0) * e;
          vec3 local = rotate(vec3(position.xy - aCenter, 0.0), axis, spin);
          vec3 normal = rotate(vec3(0.0, 0.0, 1.0), axis, spin);
          vec2 outward = aCenter / max(dist, 1e-3);
          float punch = exp(-dist * 1.6);
          vec3 push = vec3(outward * (0.025 + 0.1 * punch) * (0.5 + aSeed.z), (0.08 + 0.42 * aSeed.y) * (0.45 + 0.55 * punch));
          vec3 p = vec3(origin + aCenter, 0.0) + local + push * e;
          p.xy += outward * 0.0035 * vCrack * (1.0 - e);

          vec2 screenCenter = aspect * 0.5;
          vec2 projected = screenCenter + (p.xy - screenCenter) * (${float(PERSPECTIVE)} / (${float(PERSPECTIVE)} - p.z));
          gl_Position = vec4(projected / aspect * 2.0 - 1.0, 0.0, 1.0);

          vUv = (origin + position.xy) / aspect;
          vBary = aBary;
          vec3 light = normalize(vec3(-0.35, 0.55, 0.75));
          vShade = mix(1.0, 0.45 + 0.75 * abs(dot(normal, light)), e);
          vGlint = pow(max(dot(reflect(-light, normal), vec3(0.0, 0.0, 1.0)), 0.0), 40.0) * e;
          float start = ${float(SHATTER.dissolveStart)} + (dist / reach) * 0.35 + aSeed.x * 0.15;
          vDissolve = clamp((uClock - start) / ${float(SHATTER.dissolve)}, 0.0, 1.0);
        }`,
      fragmentShader: glsl`
        ${noiseChunk}
        uniform sampler2D uCapture;
        varying vec2 vUv;
        varying vec3 vBary;
        varying float vCrack;
        varying float vShade;
        varying float vGlint;
        varying float vDissolve;
        void main() {
          // Desintegração: o vidro vira grão — some onde o ruído fica abaixo do limiar.
          float grain = valueNoise(vUv * 140.0) * 0.6 + valueNoise(vUv * 31.0) * 0.4;
          float threshold = vDissolve * 1.2 - 0.1;
          if (grain < threshold) discard;
          float burn = (1.0 - smoothstep(threshold, threshold + 0.07, grain)) * step(0.001, vDissolve);

          vec3 image = texture2D(uCapture, clamp(vUv, 0.0, 1.0)).rgb;
          float e = min(vBary.x, min(vBary.y, vBary.z));
          float line = 1.0 - smoothstep(0.0, fwidth(e) * 1.1, e);
          vec3 color = image * vShade + vec3(0.8, 0.95, 1.0) * (line * (0.25 + 0.35 * vCrack) + vGlint * 0.5) + vec3(0.45, 0.85, 1.0) * burn * 1.2;
          gl_FragColor = vec4(color, 1.0);
        }`,
      uniforms: {
        uCapture: { value: null },
        uOrigin: { value: new Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
        uClock: { value: 0 },
        uActive: { value: 0 },
      },
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }
}
