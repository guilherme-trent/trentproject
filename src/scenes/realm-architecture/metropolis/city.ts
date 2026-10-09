import { EdgesGeometry, IcosahedronGeometry } from 'three';
import { mulberry32 } from '@/engine/lib/random';
import { BUILD, TUNNEL } from './config';

/**
 * A Metrópole Abstrata — gerada uma vez na CPU, determinística (mesma
 * semente, mesma cidade). Só LINHAS e PONTOS: torres em wireframe crescendo
 * do chão e pendendo do teto, pontes de luz sobre o corredor, cabos de dados,
 * trilhas de circuito no chão e no teto, pórticos do túnel e, no fim, um
 * núcleo geodésico perfeitamente simétrico.
 *
 * Cada segmento carrega a sua JANELA DE CONSTRUÇÃO (início, duração) em
 * unidades de progresso do scroll; o vertex shader "desenha" o segmento da
 * origem até o fim conforme o progresso. Nada é escrito por frame: rolar
 * para trás desfaz a construção exatamente, porque tudo é função do scroll.
 *
 * Simetria: cada peça nasce em par espelhado (x ↔ −x) com janelas de tempo
 * diferentes — a construção é assimétrica e viva, o resultado final é simétrico.
 */

export const KIND = { tower: 0, ring: 1, arc: 2, trace: 3, core: 4, frame: 5 } as const;

type V3 = [number, number, number];

const F = TUNNEL.floor;
const C = TUNNEL.ceiling;
export const CORE_CENTER: V3 = [0, (F + C) / 2, TUNNEL.start - TUNNEL.length - TUNNEL.coreGap];

/** Progresso em que a câmera alcança o plano `z`. */
export const reachAt = (z: number) => (TUNNEL.start - z) / TUNNEL.length;
/** Posição Z da câmera no progresso `p`. */
export const cameraZ = (p: number) => TUNNEL.start - p * TUNNEL.length;

export interface CityData {
  lines: { position: Float32Array; from: Float32Array; time: Float32Array; meta: Float32Array; count: number };
  points: { position: Float32Array; from: Float32Array; time: Float32Array; seed: Float32Array; count: number };
}

interface Segment {
  a: V3;
  b: V3;
  start: number;
  dur: number;
}

class Builder {
  readonly position: number[] = [];
  readonly from: number[] = [];
  readonly time: number[] = [];
  readonly meta: number[] = [];
  readonly segments: Segment[] = [];

  /** Segmento que cresce de `a` até `b` durante [start, start + dur] do progresso. */
  seg(a: V3, b: V3, start: number, dur: number, kind: number, along0 = 0, along1 = 0) {
    this.position.push(...a, ...b);
    this.from.push(...a, ...a);
    this.time.push(start, dur, start, dur);
    this.meta.push(kind, along0, kind, along1);
    if (kind !== KIND.trace) this.segments.push({ a, b, start, dur });
  }
}

/**
 * Gerador INCREMENTAL: cede (`yield`) entre blocos de trabalho — o
 * aquecimento o executa um bloco por frame (gerar tudo de uma vez custava
 * ~50 ms num frame da hub). `getCity()` roda tudo de uma vez (fallback).
 */
function* cityGenerator(): Generator<void, CityData> {
  const rng = mulberry32(0xa7c1);
  const range = (min: number, max: number) => min + rng() * (max - min);
  const build = new Builder();

  /** Janela de uma peça em z: nasce `lookahead` à frente da câmera; os arredores imediatos, nos primeiros giros. */
  const windowAt = (z: number): [number, number] => {
    const dur = range(0.035, 0.085);
    let start = reachAt(z) - BUILD.lookahead + rng() * 0.05;
    start = Math.max(start, 0.004 + rng() * 0.07);
    return [Math.min(start, 0.975 - dur), dur];
  };
  /** Sub-janela `s` (0..1) dentro da janela da peça. */
  const sub = ([start, dur]: [number, number], s: number, length = 0.4): [number, number] => [start + s * dur, Math.max(0.006, dur * length)];

  // ── Torres ──
  const tower = (x: number, z: number, w: number, d: number, h: number, base: number, dir: number, ringStep: number) => {
    const win = windowAt(z);
    const xs = [x - w / 2, x + w / 2];
    const zs = [z - d / 2, z + d / 2];
    const corners: [number, number][] = [[xs[0], zs[0]], [xs[1], zs[0]], [xs[1], zs[1]], [xs[0], zs[1]]];
    const top = base + dir * h;
    corners.forEach(([cx, cz], i) => {
      const [s, l] = sub(win, i * 0.03, 0.55);
      build.seg([cx, base, cz], [cx, top, cz], s, l, KIND.tower);
    });
    const ring = (y: number, s: number, kind: number) =>
      corners.forEach(([cx, cz], i) => {
        const [nx, nz] = corners[(i + 1) % 4];
        const [start, dur] = sub(win, s + i * 0.025, 0.12);
        build.seg([cx, y, cz], [nx, y, nz], start, dur, kind);
      });
    ring(base, 0, KIND.tower);
    const rings = Math.max(1, Math.round(h / ringStep));
    for (let k = 1; k <= rings; k++) ring(base + (dir * h * k) / rings, 0.12 + (0.72 * k) / rings, k === rings ? KIND.tower : KIND.ring);
    // Montantes na fachada voltada para o corredor: a janela de dados.
    if (w > 0.8 && h > 1.2) {
      const facade = Math.abs(xs[0]) < Math.abs(xs[1]) ? xs[0] : xs[1];
      for (const t of [0.33, 0.66]) {
        const [s, l] = sub(win, 0.2 + t * 0.2, 0.6);
        build.seg([facade, base, zs[0] + d * t], [facade, top, zs[0] + d * t], s, l, KIND.ring);
      }
    }
    // Agulha de luz no topo de algumas torres do chão.
    if (dir > 0 && rng() < 0.28) {
      const tip = Math.min(C - 0.2, top + range(0.3, 0.9));
      if (tip > top + 0.1) {
        const [s, l] = sub(win, 0.9, 0.3);
        build.seg([x, top, z], [x, tip, z], s, l, KIND.arc, 0, 1);
      }
    }
  };

  const zEnd = CORE_CENTER[2] - 4;
  const rows: number[] = [];
  for (let z = TUNNEL.start + 5; z > zEnd; z -= range(0.9, 1.8)) rows.push(z);

  const mirrored = (emit: (side: number) => void) => {
    emit(1);
    emit(-1);
  };

  let rowCount = 0;
  for (const z of rows) {
    if (++rowCount % 12 === 0) yield;
    // Perto do corredor: 1–2 torres por lado, do chão ou do teto.
    const near = rng() < 0.55 ? 2 : 1;
    for (let k = 0; k < near; k++) {
      const w = range(0.4, 1.3);
      const d = range(0.4, 1.1);
      const x = BUILD.corridor + 0.25 + w / 2 + k * range(1.2, 2.2) + rng() * 0.6;
      const zz = z + range(-0.3, 0.3);
      const hanging = rng() < 0.35;
      const h = hanging ? range(0.4, 1.7) : range(0.5, 3.2);
      mirrored((side) => tower(side * x, zz, w, d, h, hanging ? C : F, hanging ? -1 : 1, hanging ? 0.3 : 0.38));
    }
    // Ao longe: torres altas e simples.
    if (rng() < 0.7) {
      const w = range(0.8, 2.0);
      const d = range(0.8, 2.0);
      const x = range(5.6, BUILD.width);
      const h = range(1.6, C - F - 0.2);
      mirrored((side) => tower(side * x, z + range(-0.5, 0.5), w, d, h, F, 1, 0.6));
    }
  }

  yield;
  // ── Pórticos do túnel (a moldura que os espelhos multiplicam ao infinito) ──
  for (let z = TUNNEL.start - 2; z > CORE_CENTER[2] + 4; z -= 6) {
    const win = windowAt(z);
    const x = BUILD.corridor + 0.05;
    mirrored((side) => {
      const [s, l] = sub(win, 0, 0.5);
      build.seg([side * x, F, z], [side * x, C, z], s, l, KIND.frame);
    });
    const [s, l] = sub(win, 0.5, 0.4);
    build.seg([-x, C, z], [0, C, z], s, l, KIND.frame);
    build.seg([x, C, z], [0, C, z], s, l, KIND.frame);
    build.seg([-x, F, z], [0, F, z], s, l, KIND.frame);
    build.seg([x, F, z], [0, F, z], s, l, KIND.frame);
  }

  // ── Pontes de luz sobre o corredor (Bézier quadráticas), dos dois lados ao centro ──
  for (let z = TUNNEL.start - 1; z > CORE_CENTER[2] + 3; z -= range(2.4, 4.2)) {
    const win = windowAt(z);
    const x = range(BUILD.corridor + 0.6, 4.5);
    const y = range(F + 0.9, C - 0.7);
    const peak = Math.min(C - 0.12, y + range(0.5, 1.3));
    const N = 22;
    const point = (t: number): V3 => {
      const s = 1 - t;
      return [-x * s * s + x * t * t, y * s * s + 2 * s * t * peak + y * t * t, z];
    };
    // Cresce das duas pontas e se encontra no meio.
    for (let i = 0; i < N / 2; i++) {
      const t0 = i / N;
      const t1 = (i + 1) / N;
      const [s, l] = sub(win, (i / (N / 2)) * 0.8, 0.22);
      build.seg(point(t0), point(t1), s, l, KIND.arc, t0, t1);
      build.seg(point(1 - t0), point(1 - t1), s, l, KIND.arc, 1 - t0, 1 - t1);
    }
  }

  // ── Cabos de dados correndo junto ao teto (catenárias entre vãos) ──
  for (let z = TUNNEL.start + 2; z > CORE_CENTER[2] + 2; z -= 3) {
    const win = windowAt(z);
    const N = 10;
    mirrored((side) => {
      const x = side * (BUILD.corridor + 0.7);
      for (let i = 0; i < N; i++) {
        const t0 = i / N;
        const t1 = (i + 1) / N;
        const at = (t: number): V3 => [x, C - 0.12 - Math.sin(t * Math.PI) * 0.35, z - t * 3];
        const [s, l] = sub(win, t0 * 0.8, 0.2);
        build.seg(at(t0), at(t1), s, l, KIND.arc, t0, t1);
      }
    });
  }

  yield;
  // ── Trilhas de circuito no chão e no teto (rotas a 45°) ──
  for (let i = 0; i < 70; i++) {
    const z0 = range(CORE_CENTER[2] + 2, TUNNEL.start + 3);
    const win = windowAt(z0);
    const onFloor = rng() < 0.6;
    const y = onFloor ? F + 0.003 : C - 0.003;
    const x0 = range(2.2, 7);
    const run = range(1.5, 6);
    const jog = range(0.4, 1.2);
    const xIn = BUILD.corridor + range(0.15, 0.5);
    mirrored((side) => {
      const path: V3[] = [
        [side * x0, y, z0],
        [side * (xIn + jog), y, z0],
        [side * xIn, y, z0 - jog],
        [side * xIn, y, z0 - jog - run],
        [side * (xIn + jog * 0.7), y, z0 - jog - run - jog * 0.7],
      ];
      for (let k = 0; k < path.length - 1; k++) {
        const [s, l] = sub(win, k * 0.22, 0.25);
        build.seg(path[k], path[k + 1], s, l, KIND.trace, k / 4, (k + 1) / 4);
      }
    });
  }

  yield;
  // ── O núcleo: geodésicas concêntricas, três grandes círculos e raios ──
  const [cx, cy, cz] = CORE_CENTER;
  const core = (vertices: Float32Array, radius: number, start: number, dur: number) => {
    for (let i = 0; i < vertices.length; i += 6) {
      const a: V3 = [cx + vertices[i] * radius, cy + vertices[i + 1] * radius, cz + vertices[i + 2] * radius];
      const b: V3 = [cx + vertices[i + 3] * radius, cy + vertices[i + 4] * radius, cz + vertices[i + 5] * radius];
      const s = start + rng() * dur * 0.7;
      build.seg(a, b, s, dur * 0.3, KIND.core);
    }
  };
  const edgesOf = (detail: number) => {
    const ico = new IcosahedronGeometry(1, detail);
    const edges = new EdgesGeometry(ico, 1);
    const array = (edges.getAttribute('position').array as Float32Array).slice();
    ico.dispose();
    edges.dispose();
    return array;
  };
  core(edgesOf(1), 1.15, 0.8, 0.12);
  core(edgesOf(0), 1.8, 0.86, 0.1);
  const CIRCLE = 64;
  for (let axis = 0; axis < 3; axis++)
    for (let i = 0; i < CIRCLE; i++) {
      const at = (k: number): V3 => {
        const angle = (k / CIRCLE) * Math.PI * 2;
        const u = Math.cos(angle) * 1.5;
        const v = Math.sin(angle) * 1.5;
        return axis === 0 ? [cx + u, cy + v, cz] : axis === 1 ? [cx, cy + u, cz + v] : [cx + u, cy, cz + v];
      };
      build.seg(at(i), at(i + 1), 0.9 + (i / CIRCLE) * 0.07 + axis * 0.004, 0.01, KIND.core);
    }

  yield;
  // ── Partículas: as que montam a cidade e a poeira de dados do túnel ──
  const ASSEMBLY = 2400;
  const DUST = 1400;
  const points = { position: [] as number[], from: [] as number[], time: [] as number[], seed: [] as number[] };
  const segments = build.segments;
  for (let i = 0; i < ASSEMBLY; i++) {
    const segment = segments[Math.floor(rng() * segments.length)];
    const u = rng();
    const target: V3 = [0, 1, 2].map((k) => segment.a[k] + (segment.b[k] - segment.a[k]) * u) as V3;
    const spread = range(0.6, 2.2);
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(rng() * 2 - 1);
    const from: V3 = [
      target[0] + Math.sin(phi) * Math.cos(theta) * spread,
      Math.min(C - 0.05, Math.max(F + 0.05, target[1] + Math.cos(phi) * spread)),
      target[2] + Math.sin(phi) * Math.sin(theta) * spread,
    ];
    points.position.push(...target);
    points.from.push(...from);
    points.time.push(segment.start - 0.01, segment.dur + 0.02);
    points.seed.push(rng());
  }
  for (let i = 0; i < DUST; i++) {
    const z = range(CORE_CENTER[2] - 3, TUNNEL.start + 4);
    const p: V3 = [range(-10, 10), range(F + 0.08, C - 0.08), z];
    const [start, dur] = windowAt(z);
    points.position.push(...p);
    points.from.push(...p);
    points.time.push(start, dur);
    points.seed.push(1 + rng()); // > 1: poeira (deriva no shader)
  }

  return {
    lines: {
      position: new Float32Array(build.position),
      from: new Float32Array(build.from),
      time: new Float32Array(build.time),
      meta: new Float32Array(build.meta),
      count: build.position.length / 3,
    },
    points: {
      position: new Float32Array(points.position),
      from: new Float32Array(points.from),
      time: new Float32Array(points.time),
      seed: new Float32Array(points.seed),
      count: points.position.length / 3,
    },
  };
}

let city: CityData | null = null;
let pending: Generator<void, CityData> | null = null;

/** A cidade, agora (termina de uma vez o que faltar). */
export function getCity(): CityData {
  if (city) return city;
  pending ??= cityGenerator();
  let step = pending.next();
  while (!step.done) step = pending.next();
  pending = null;
  return (city = step.value);
}

/** A cidade, um bloco de trabalho por frame (aquecimento). */
export async function prepareCity(): Promise<CityData> {
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  while (!city) {
    pending ??= cityGenerator();
    const step = pending.next();
    if (step.done) {
      city = step.value;
      pending = null;
    } else await frame();
  }
  return city;
}
