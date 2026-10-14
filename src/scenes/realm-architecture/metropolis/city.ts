import { mulberry32 } from '@/engine/lib/random';
import { BUILD, cameraZ, reachAt, span, TUNNEL } from './config';
import { inLandmarkZone, LANDMARKS, landmarkToWorld, landmarkWindow } from './landmarks';
import type { Pen } from './lineart';

/**
 * A Metrópole Abstrata — gerada uma vez na CPU, determinística (mesma
 * semente, mesma cidade). Só LINHAS e PONTOS: torres em wireframe crescendo
 * do chão e pendendo do teto, pontes de luz sobre o corredor, cabos de dados,
 * trilhas de circuito no chão e no teto e os pórticos do túnel. No fim da
 * jornada, o coração (heart.ts).
 *
 * Cada segmento carrega a sua JANELA DE CONSTRUÇÃO (início, duração) em
 * unidades de progresso do scroll; o vertex shader "desenha" o segmento da
 * origem até o fim conforme o progresso. Nada é escrito por frame: rolar
 * para trás desfaz a construção exatamente, porque tudo é função do scroll.
 *
 * Dois distritos, um de cada lado do corredor: à esquerda a ESTRUTURA
 * (caixas, escalonadas, coroas piramidais, treliças, gêmeas com passarela), à
 * direita a FORMA (torcidas, cilindros, afuniladas, cúpulas, estalactites).
 * A moldura do túnel — pórticos, pontes, cabos, trilhas — e o núcleo do fim
 * continuam simétricos: são o chão comum das duas metades da arquitetura.
 */

export const KIND = { tower: 0, ring: 1, arc: 2, trace: 3, core: 4, frame: 5, landmark: 6 } as const;

type V3 = [number, number, number];
type XZ = [number, number];

const F = TUNNEL.floor;
const C = TUNNEL.ceiling;
export const CORE_CENTER: V3 = [0, (F + C) / 2, TUNNEL.start - TUNNEL.length - TUNNEL.coreGap];

export { cameraZ, reachAt };

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
    const dur = range(span(2.2), span(5.4));
    let start = reachAt(z) - BUILD.lookahead + rng() * span(3.2);
    start = Math.max(start, 0.004 + rng() * span(4.5));
    return [Math.min(start, 0.975 - dur), dur];
  };
  /** Sub-janela `s` (0..1) dentro da janela da peça. */
  const sub = ([start, dur]: [number, number], s: number, length = 0.4): [number, number] => [start + s * dur, Math.max(0.006, dur * length)];

  // ── Construções ──
  // Primitivas: anéis poligonais e prismas (retos ou torcidos) que crescem a partir da base.
  type Win = [number, number];
  /** Sub-janela dentro da fatia `span` da janela da peça (peças compostas dividem a janela entre as partes). */
  const part = (win: Win, span: Win, s: number, length: number) => sub(win, span[0] + s * (span[1] - span[0]), length * (span[1] - span[0]));

  const rect = (x: number, z: number, w: number, d: number, angle = 0): XZ[] =>
    ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([u, v]) => {
      const px = (u * w) / 2;
      const pz = (v * d) / 2;
      return [x + px * Math.cos(angle) - pz * Math.sin(angle), z + px * Math.sin(angle) + pz * Math.cos(angle)];
    });
  const polygon = (x: number, z: number, r: number, n: number, angle = 0): XZ[] =>
    Array.from({ length: n }, (_, i) => {
      const a = angle + (i / n) * Math.PI * 2;
      return [x + Math.cos(a) * r, z + Math.sin(a) * r];
    });

  const ring = (poly: XZ[], y: number, win: Win, span: Win, s: number, kind: number) =>
    poly.forEach(([cx, cz], i) => {
      const [nx, nz] = poly[(i + 1) % poly.length];
      const [start, dur] = part(win, span, s + (i * 0.1) / poly.length, 0.12);
      build.seg([cx, y, cz], [nx, y, nz], start, dur, kind);
    });

  /**
   * Prisma de `floors` andares entre y0 e y1. `at(f)` dá o contorno na fração de
   * altura f (0 base → 1 topo): constante = prisma reto (arestas verticais
   * inteiras); variando = torcido ou afunilado (arestas andar a andar).
   */
  const prism = (at: (f: number) => XZ[], y0: number, y1: number, floors: number, win: Win, span: Win = [0, 1], varying = false) => {
    const yAt = (k: number) => y0 + ((y1 - y0) * k) / floors;
    if (!varying) {
      const top = at(1);
      at(0).forEach(([cx, cz], i) => {
        const [s, l] = part(win, span, i * 0.03, 0.55);
        build.seg([cx, y0, cz], [top[i][0], y1, top[i][1]], s, l, KIND.tower);
      });
    } else {
      for (let k = 0; k < floors; k++) {
        const a = at(k / floors);
        const b = at((k + 1) / floors);
        a.forEach(([cx, cz], i) => {
          const [s, l] = part(win, span, 0.05 + (0.7 * k) / floors + i * 0.01, 0.6 / floors + 0.08);
          build.seg([cx, yAt(k), cz], [b[i][0], yAt(k + 1), b[i][1]], s, l, KIND.tower);
        });
      }
    }
    for (let k = 0; k <= floors; k++) {
      ring(at(k / floors), yAt(k), win, span, k === 0 ? 0 : 0.12 + (0.72 * k) / floors, k === 0 || k === floors ? KIND.tower : KIND.ring);
    }
  };

  /** Agulha de luz no topo (só no chão, sem tocar o teto). */
  const needle = (x: number, z: number, top: number, win: Win, chance: number) => {
    if (rng() >= chance) return;
    const tip = Math.min(C - 0.2, top + range(0.3, 0.9));
    if (tip <= top + 0.1) return;
    const [s, l] = sub(win, 0.9, 0.3);
    build.seg([x, top, z], [x, tip, z], s, l, KIND.arc, 0, 1);
  };

  /**
   * Cada construção recebe (x, z, base, dir, h) — `dir` +1 cresce do chão, −1
   * pende do teto — e devolve nada: emite os próprios segmentos. `reach` é a
   * meia-largura em x (para nunca invadir o corredor).
   */
  interface Spec {
    x: number;
    z: number;
    base: number;
    dir: number;
    h: number;
  }
  type Piece = { reach: number; emit: (spec: Spec) => void };
  type District = Record<'ground' | 'hanging' | 'far', [number, () => Piece][]>;

  // ESTRUTURAL — ortogonal: caixa, escalonada, coroa piramidal, treliça, gêmeas.
  const box = (w: number, d: number): Piece => ({
    reach: w / 2,
    emit: ({ x, z, base, dir, h }) => {
      const win = windowAt(z);
      const top = base + dir * h;
      prism(() => rect(x, z, w, d), base, top, Math.max(1, Math.round(h / (dir < 0 ? 0.3 : 0.38))), win);
      // Montantes na fachada voltada para o corredor: a janela de dados.
      if (w > 0.8 && h > 1.2) {
        const facade = x > 0 ? x - w / 2 : x + w / 2;
        for (const t of [0.33, 0.66]) {
          const [s, l] = sub(win, 0.2 + t * 0.2, 0.6);
          build.seg([facade, base, z - d / 2 + d * t], [facade, top, z - d / 2 + d * t], s, l, KIND.ring);
        }
      }
      if (dir > 0) needle(x, z, top, win, 0.28);
    },
  });
  const setback = (w: number, d: number): Piece => ({
    reach: w / 2,
    emit: ({ x, z, base, dir, h }) => {
      const win = windowAt(z);
      const tiers = h > 1.8 ? 3 : 2;
      const heights = tiers === 3 ? [0.5, 0.3, 0.2] : [0.62, 0.38];
      let y = base;
      heights.forEach((share, i) => {
        const scale = 1 - i * 0.28;
        const next = y + dir * h * share;
        prism(() => rect(x, z, w * scale, d * scale), y, next, Math.max(1, Math.round((h * share) / 0.34)), win, [i / tiers, (i + 1) / tiers]);
        y = next;
      });
      if (dir > 0) needle(x, z, y, win, 0.5);
    },
  });
  const crowned = (w: number, d: number): Piece => ({
    reach: w / 2,
    emit: ({ x, z, base, dir, h }) => {
      const win = windowAt(z);
      const shoulder = base + dir * h * 0.74;
      prism(() => rect(x, z, w, d), base, shoulder, Math.max(1, Math.round((h * 0.74) / 0.38)), win, [0, 0.75]);
      const apex: V3 = [x, base + dir * h, z];
      rect(x, z, w, d).forEach(([cx, cz], i) => {
        const [s, l] = part(win, [0.75, 1], i * 0.05, 0.7);
        build.seg([cx, shoulder, cz], apex, s, l, KIND.tower);
      });
    },
  });
  const truss = (w: number): Piece => ({
    reach: w / 2,
    emit: ({ x, z, base, dir, h }) => {
      const win = windowAt(z);
      const floors = Math.max(2, Math.round(h / 0.34));
      const at = () => rect(x, z, w, w);
      prism(at, base, base + dir * h, floors, win);
      // Contraventamento em X em todas as faces: a estrutura à mostra.
      const corners = at();
      for (let k = 0; k < floors; k++) {
        const y0 = base + (dir * h * k) / floors;
        const y1 = base + (dir * h * (k + 1)) / floors;
        corners.forEach(([ax, az], i) => {
          const [bx, bz] = corners[(i + 1) % 4];
          const [s, l] = sub(win, 0.15 + (0.7 * k) / floors, 0.18);
          build.seg([ax, y0, az], [bx, y1, bz], s, l, KIND.ring);
          build.seg([bx, y0, bz], [ax, y1, az], s, l, KIND.ring);
        });
      }
      if (dir > 0) needle(x, z, base + h, win, 0.8);
    },
  });
  const twins = (w: number, d: number, gap: number): Piece => ({
    reach: w / 2,
    emit: ({ x, z, base, dir, h }) => {
      const win = windowAt(z);
      const offset = (w + gap) / 2;
      const floors = Math.max(1, Math.round(h / 0.38));
      for (const side of [-1, 1]) prism(() => rect(x, z + side * offset, w, d), base, base + dir * h, floors, win, [side < 0 ? 0 : 0.08, side < 0 ? 0.85 : 0.93]);
      // A passarela entre as duas, a 2/3 da altura.
      const y = base + dir * h * 0.66;
      const yTop = y + dir * 0.16;
      for (const [px, py] of [[x - w * 0.3, y], [x + w * 0.3, y], [x - w * 0.3, yTop], [x + w * 0.3, yTop]] as const) {
        const [s, l] = sub(win, 0.82, 0.18);
        build.seg([px, py, z - offset + d / 2], [px, py, z + offset - d / 2], s, l, KIND.arc, 0, 1);
      }
    },
  });

  // PARAMÉTRICO — curvo e rotacional: torcida, cilindro, afunilada, cúpula.
  const twisted = (w: number, turn: number, taper: number): Piece => ({
    reach: w * 0.71,
    emit: ({ x, z, base, dir, h }) => {
      const win = windowAt(z);
      const spin = range(0, Math.PI / 2);
      const floors = Math.max(3, Math.round(h / 0.4));
      prism((f) => rect(x, z, w * (1 - taper * f), w * (1 - taper * f), spin + turn * f), base, base + dir * h, floors, win, [0, 1], true);
      if (dir > 0) needle(x, z, base + h, win, 0.35);
    },
  });
  const cylinder = (r: number, taper: number, sides: number): Piece => ({
    reach: r,
    emit: ({ x, z, base, dir, h }) => {
      const win = windowAt(z);
      const floors = Math.max(2, Math.round(h / (taper > 0 ? 0.55 : 0.42)));
      const spin = range(0, Math.PI);
      prism((f) => polygon(x, z, r * (1 - taper * f), sides, spin), base, base + dir * h, floors, win, [0, 1], taper > 0);
      if (dir > 0) needle(x, z, base + h, win, 0.3);
    },
  });
  const dome = (r: number): Piece => ({
    reach: r,
    emit: ({ x, z, base, dir }) => {
      const win = windowAt(z);
      const MERIDIANS = 7;
      const STEPS = 4;
      const at = (a: number, phi: number): V3 => [x + Math.cos(a) * r * Math.cos(phi), base + dir * r * Math.sin(phi), z + Math.sin(a) * r * Math.cos(phi)];
      for (let m = 0; m < MERIDIANS; m++) {
        const a = (m / MERIDIANS) * Math.PI * 2;
        for (let j = 0; j < STEPS; j++) {
          const p0 = (j / STEPS) * (Math.PI / 2);
          const p1 = ((j + 1) / STEPS) * (Math.PI / 2);
          const [s, l] = sub(win, 0.08 + m * 0.012 + (j / STEPS) * 0.6, 0.16);
          build.seg(at(a, p0), at(a, p1), s, l, KIND.tower);
        }
      }
      // Paralelos: anéis que fecham a cúpula de baixo para cima.
      [0, 0.55, 1.1].forEach((phi, i) =>
        ring(polygon(x, z, r * Math.cos(phi), 12), base + dir * r * Math.sin(phi), win, [0, 1], i === 0 ? 0 : 0.3 + i * 0.18, i === 0 ? KIND.tower : KIND.ring),
      );
    },
  });

  /** Sorteio ponderado de uma construção do repertório. */
  const pick = (options: [number, () => Piece][]) => {
    let roll = rng() * options.reduce((sum, [weight]) => sum + weight, 0);
    for (const [weight, make] of options) if ((roll -= weight) <= 0) return make();
    return options[options.length - 1][1]();
  };

  /**
   * Os dois distritos: a cidade não é mais espelhada. À esquerda, a ESTRUTURA
   * (ortogonal, engenharia à mostra); à direita, a FORMA (curvas, rotação).
   * As duas metades da arquitetura, uma de cada lado do corredor.
   */
  const LEFT: District = {
    ground: [
      [3, () => box(range(0.4, 1.3), range(0.4, 1.1))],
      [2.4, () => setback(range(0.7, 1.3), range(0.6, 1.1))],
      [1.6, () => crowned(range(0.5, 1.0), range(0.5, 1.0))],
      [1.2, () => truss(range(0.3, 0.45))],
      [0.9, () => twins(range(0.35, 0.55), range(0.35, 0.55), range(0.35, 0.6))],
    ],
    hanging: [
      [3, () => box(range(0.4, 1.3), range(0.4, 1.1))],
      [2, () => setback(range(0.7, 1.2), range(0.6, 1.0))],
    ],
    far: [
      [3, () => box(range(0.8, 2.0), range(0.8, 2.0))],
      [2, () => setback(range(1.0, 2.0), range(1.0, 2.0))],
      [1, () => truss(range(0.5, 0.8))],
    ],
  };
  const RIGHT: District = {
    ground: [
      [3, () => twisted(range(0.45, 0.95), range(0.5, 1.5), range(0, 0.3))],
      [2.6, () => cylinder(range(0.25, 0.6), 0, rng() < 0.5 ? 6 : 8)],
      [1.8, () => cylinder(range(0.35, 0.65), range(0.45, 0.8), 8)],
      [1.6, () => dome(range(0.55, 1.1))],
    ],
    hanging: [
      [3, () => cylinder(range(0.3, 0.6), range(0.75, 0.92), rng() < 0.5 ? 5 : 7)],
      [2, () => twisted(range(0.4, 0.8), range(0.6, 1.4), range(0.2, 0.5))],
    ],
    far: [
      [3, () => twisted(range(0.9, 1.7), range(0.4, 1.0), range(0, 0.25))],
      [2.5, () => cylinder(range(0.5, 1.0), range(0, 0.3), 10)],
    ],
  };

  const zEnd = CORE_CENTER[2] - 4;
  const rows: number[] = [];
  // Espaçadas: a cidade genérica abre espaço para os monumentos (landmarks.ts).
  for (let z = TUNNEL.start + 5; z > zEnd; z -= range(1.2, 2.2)) rows.push(z);

  const mirrored = (emit: (side: number) => void) => {
    emit(1);
    emit(-1);
  };

  let rowCount = 0;
  for (const z of rows) {
    if (++rowCount % 6 === 0) yield;
    for (const side of [-1, 1] as const) {
      const district = side < 0 ? LEFT : RIGHT;
      // Perto do corredor: 1–2 construções por lado, do chão ou do teto.
      const near = rng() < 0.4 ? 2 : 1;
      let edge = BUILD.corridor + 0.25;
      for (let k = 0; k < near; k++) {
        const hanging = rng() < 0.35;
        const piece = pick(hanging ? district.hanging : district.ground);
        const x = edge + piece.reach + rng() * 0.6;
        edge = x + piece.reach + range(0.5, 1.2);
        const h = hanging ? range(0.4, 1.7) : range(0.5, 3.2);
        const zz = z + range(-0.3, 0.3);
        if (!inLandmarkZone(side, zz)) piece.emit({ x: side * x, z: zz, base: hanging ? C : F, dir: hanging ? -1 : 1, h });
      }
      // Ao longe: construções altas (sem disputar a silhueta de um monumento).
      if (rng() < 0.5) {
        const piece = pick(district.far);
        const x = Math.max(range(5.6, BUILD.width), edge + piece.reach);
        const zz = z + range(-0.5, 0.5);
        if (!inLandmarkZone(side, zz, 0.4)) piece.emit({ x: side * x, z: zz, base: F, dir: 1, h: range(1.6, C - F - 0.2) });
      }
    }
  }

  yield;
  // ── Os monumentos: cada um na janela da peça inteira (ou acompanhando a câmera, se `follows`) ──
  for (const landmark of LANDMARKS) {
    const [start, dur] = landmarkWindow(landmark);
    const pen: Pen = (a, b, order) => {
      const wa = landmarkToWorld(landmark, a);
      const wb = landmarkToWorld(landmark, b);
      if (landmark.follows) {
        const s = Math.max(0.004, reachAt(Math.max(wa[2], wb[2])) - BUILD.lookahead);
        build.seg(wa, wb, Math.min(s, 0.96), span(1.9), KIND.trace);
      } else build.seg(wa, wb, start + order * dur * 0.8, Math.max(0.006, dur * 0.22), KIND.landmark);
    };
    landmark.shape(pen);
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
