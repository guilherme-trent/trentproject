import {
  BufferGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  LatheGeometry,
  TetrahedronGeometry,
  TorusGeometry,
  Vector2,
} from 'three';
import { mulberry32 } from '@/engine/lib/random';
import type { FruitAnchor } from './layout';

/**
 * Geometrias procedurais dos Frutos. Nenhuma posição de instância é escrita
 * pela CPU: correntes e cacos recebem só atributos estáticos (quem são,
 * sementes) e o vertex shader calcula tudo a partir de uniforms.
 */

/**
 * A gota: uma Fissura que amadureceu em fruto. Ponta para cima (presa ao
 * caule), fundo arredondado e pesado. Unidades de mundo.
 */
export const DROP = { top: 0.56, bottom: -0.74, width: 0.44 } as const;

/**
 * Superfície de revolução da curva da gota, x = sen(t)·sen(t/2), y = cos(t):
 * ponta fina em t = 0, fundo redondo em t = π. Lisa (as facetas eram do
 * cristal; o tecido líquido pede curvatura contínua para os reflexos fluírem).
 */
export function createDropGeometry(): BufferGeometry {
  const STEPS = 28;
  const profile = Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = (i / STEPS) * Math.PI;
    const x = Math.sin(t) * Math.pow(Math.sin(t / 2), 0.9) * DROP.width;
    const y = DROP.bottom + ((Math.cos(t) + 1) / 2) * (DROP.top - DROP.bottom);
    return new Vector2(Math.max(x, 1e-4), y);
  });
  const geometry = new LatheGeometry(profile, 36);
  geometry.deleteAttribute('uv');
  return geometry;
}

// ── Caules ───────────────────────────────────────────────────────────────────

const STEM = { threads: 80, samples: 24, baseRadius: 0.34, tipRadius: 0.045, twist: 6.5 } as const;
/**
 * Região (ver aThread.z da árvore) na ponta do caule. Abaixo do início do
 * esmaecimento das pontas da copa (0,68): o caule chega inteiro ao fruto.
 */
export const STEM_END_REGION = 0.66;

type Vec3 = [number, number, number];

/**
 * Os caules SÃO fios da Yggdrasil: mesmo formato de vértice da árvore
 * (`aThread`), renderizados com o MESMO material dela. Por isso herdam tudo:
 * a cor dos galhos, os pacotes de luz, a respiração, o crescimento a partir
 * do feixe e o pulso do despertar (que passa da forquilha para o caule sem
 * costura). A região continua a do galho na forquilha e avança até
 * STEM_END_REGION no fruto; `aThread.w = galho + 10` marca o fio como caule.
 *
 * Bézier cúbica: continua a direção do galho, depois pende até a ponta da gota.
 */
export function createStemGeometry(anchors: readonly FruitAnchor[], forkRegions: Float32Array): BufferGeometry {
  const rng = mulberry32(0x57e3);
  const positions: number[] = [];
  const thread: number[] = [];
  const index: number[] = [];

  anchors.forEach((anchor) => {
    const forkRegion = forkRegions[anchor.branch];
    const p0 = anchor.fork;
    const p3: Vec3 = [anchor.center[0], anchor.center[1] + DROP.top - 0.03, anchor.center[2]];
    const out = Math.hypot(p0[0], p0[2]) || 1;
    const p1: Vec3 = [p0[0] + (p0[0] / out) * 1.0, p0[1] + 0.25, p0[2] + (p0[2] / out) * 1.0];
    const p2: Vec3 = [p3[0], p3[1] + 1.1, p3[2]];
    const bezier = (t: number): Vec3 => {
      const s = 1 - t;
      return [0, 1, 2].map((k) => s * s * s * p0[k] + 3 * s * s * t * p1[k] + 3 * s * t * t * p2[k] + t * t * t * p3[k]) as Vec3;
    };

    for (let fiber = 0; fiber < STEM.threads; fiber++) {
      const seed = rng();
      const radial = Math.sqrt(rng());
      const phase = rng() * Math.PI * 2;
      const base = positions.length / 3;
      for (let k = 0; k < STEM.samples; k++) {
        const t = k / (STEM.samples - 1);
        const c = bezier(t);
        const ahead = bezier(Math.min(1, t + 0.01));
        const behind = bezier(Math.max(0, t - 0.01));
        const tangent = [ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]];
        const tl = Math.hypot(...tangent) || 1;
        const T = tangent.map((v) => v / tl);
        const reference = Math.abs(T[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
        const N = [T[1] * reference[2] - T[2] * reference[1], T[2] * reference[0] - T[0] * reference[2], T[0] * reference[1] - T[1] * reference[0]];
        const nl = Math.hypot(...N) || 1;
        for (let i = 0; i < 3; i++) N[i] /= nl;
        const B = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
        const r = (STEM.baseRadius + (STEM.tipRadius - STEM.baseRadius) * Math.pow(t, 0.6)) * radial;
        const angle = phase + t * STEM.twist;
        for (let i = 0; i < 3; i++) positions.push(c[i] + (N[i] * Math.cos(angle) + B[i] * Math.sin(angle)) * r);
        thread.push(seed, 0.55 + t * 0.45, forkRegion + (STEM_END_REGION - forkRegion) * t, anchor.branch + 10);
        if (k < STEM.samples - 1) index.push(base + k, base + k + 1);
      }
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aThread', new Float32BufferAttribute(thread, 4));
  geometry.setIndex(index);
  return geometry;
}

// ── Correntes ────────────────────────────────────────────────────────────────

/** Laços de corrente por fruto e elos por laço (o vertex shader sabe a órbita de cada laço). */
export const CHAIN = { loops: 3, links: 18 } as const;

/**
 * Um elo: toro achatado de baixa contagem (6 × 12 segmentos, 144 triângulos),
 * esticado no eixo X (o eixo do elo, alinhado à corrente no shader).
 * aLink (instanciado): x fruto · y laço · z elo · w semente
 */
export function createChainGeometry(fruits: number): BufferGeometry {
  const link = new TorusGeometry(0.085, 0.024, 6, 12);
  link.scale(1.55, 1, 1);
  const rng = mulberry32(0xc4a1);
  const data: number[] = [];
  for (let f = 0; f < fruits; f++)
    for (let l = 0; l < CHAIN.loops; l++) for (let k = 0; k < CHAIN.links; k++) data.push(f, l, k, rng());
  link.setAttribute('aLink', new InstancedBufferAttribute(new Float32Array(data), 4));
  return link;
}

export const chainInstances = (fruits: number) => fruits * CHAIN.loops * CHAIN.links;

/** Cacos por fruto, além dos próprios elos, quando as correntes explodem. */
export const SHARDS_PER_FRUIT = 220;

/** Um caco: tetraedro (4 triângulos). aShard: x fruto · yzw sementes. */
export function createShardGeometry(fruits: number): BufferGeometry {
  const shard = new TetrahedronGeometry(1, 0);
  shard.deleteAttribute('uv');
  const rng = mulberry32(0x5a4d);
  const data: number[] = [];
  for (let f = 0; f < fruits; f++) for (let i = 0; i < SHARDS_PER_FRUIT; i++) data.push(f, rng(), rng(), rng());
  shard.setAttribute('aShard', new InstancedBufferAttribute(new Float32Array(data), 4));
  return shard;
}
