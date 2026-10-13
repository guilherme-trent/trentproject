/**
 * Gerador procedural da Yggdrasil Cósmica (CPU, determinístico, roda num Worker).
 *
 * MODELO — a árvore não é desenhada como galhos; ela EMERGE de fios.
 *   1. Um ESQUELETO recursivo define galhos (copa) e raízes: cada ramo é um
 *      arco com pontos de controle e um raio de "feixe" que afina nas pontas.
 *   2. Cada FIO (linha do tempo) é um caminho completo: ponta de uma raiz →
 *      tronco → ponta de um galho, escolhidos ao acaso.
 *   3. O fio percorre esse caminho com um deslocamento dentro do feixe, que
 *      GIRA com a distância percorrida (torção helicoidal).
 *
 *   Resultado: milhares de fios se comprimem num tronco torcido como uma corda e
 *   se dividem naturalmente nos galhos — a espessura de cada galho é apenas a
 *   quantidade de fios que passa por ele. Nas pontas, o feixe se abre: as
 *   linhas do tempo se desfiam.
 *
 * SAÍDA — formato final da GPU (typed arrays transferíveis):
 *   position  vec3 por vértice
 *   aThread   vec4 por vértice: (semente do fio, t ao longo do fio 0→1,
 *             região assinada: −1 ponta da raiz … 0 meio do tronco … +1 ponta do galho,
 *             índice do galho principal da copa por onde o fio sobe)
 *   index     pares (k, k+1) → LineSegments indexado: 1 draw call para tudo.
 *
 * Os fios saem em ordem aleatória: qualquer prefixo é uma amostra uniforme da
 * árvore. O orçamento por tier é só um drawRange — nada é realocado.
 */

export const YGGDRASIL = {
  threads: 2600,
  samplesPerThread: 64,
  seed: 0x9667_d7a5,
  /** Rotação do feixe por unidade de comprimento (rad/u): a torção da corda. */
  twist: 0.55,
  trunk: { baseY: -2.2, topY: 3.2, radiusBase: 1.25, radiusTop: 0.85 },
  canopy: {
    branches: 7,
    elevation: [0.45, 0.85] as const, // rad acima da horizontal
    levels: [
      { length: 4.4, radius: 0.6, children: 3, spread: 0.55, lift: 0.18 },
      { length: 3.4, radius: 0.34, children: 2, spread: 0.6, lift: 0.08 },
      { length: 2.6, radius: 0.2, children: 0, spread: 0.65, lift: -0.06 },
    ],
    /** Raio do feixe na ponta: afina (a trança fecha a ponta em vez de abrir em leque). */
    tipRadius: 0.16,
    /**
     * Pontas TRANÇADAS: entre `from` e `to` (região do fio) o feixe se divide em
     * `strands` mechas que giram umas em torno das outras (`twist` rad/u) — uma
     * trança que afina até a ponta. `spread`: distância das mechas ao eixo e
     * `ply`: raio de cada mecha, ambos em frações do raio do feixe.
     */
    braid: { from: 0.42, to: 0.72, strands: 3, twist: 2.6, spread: 0.62, ply: 0.42 },
  },
  roots: {
    branches: 6,
    elevation: [-0.95, -0.45] as const,
    levels: [
      { length: 3.6, radius: 0.55, children: 2, spread: 0.5, lift: -0.15 },
      { length: 2.8, radius: 0.28, children: 0, spread: 0.6, lift: -0.25 },
    ],
    tipRadius: 0.3,
  },
} as const;

export interface YggdrasilData {
  threadCount: number;
  samplesPerThread: number;
  positions: Float32Array;
  thread: Float32Array;
  index: Uint32Array;
  /**
   * Forquilhas (pontas) dos galhos principais da copa, espaço local da árvore,
   * xyz concatenados. Fatos do esqueleto: quem decide o que se prende a eles
   * (ex.: os Frutos, ver fruits/layout.ts) é a cena.
   */
  mainBranches: Float32Array;
  /**
   * Região média (ver aThread.z) na forquilha de cada galho principal: onde o
   * pulso de luz que sobe por um galho chega ao ponto do caule de um fruto.
   */
  mainBranchRegions: Float32Array;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

type Vec3 = [number, number, number];

// ── Álgebra mínima (tuplas, sem dependências: roda no Worker) ─────────────────
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1));

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Qualquer vetor unitário perpendicular a `v`. */
function perpendicular(v: Vec3): Vec3 {
  const reference: Vec3 = Math.abs(v[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return normalize(cross(v, reference));
}

/** Rotação de `v` em torno do eixo unitário `axis` (Rodrigues). */
function rotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

// ── 1. Esqueleto ──────────────────────────────────────────────────────────────

/** Caminho do tronco até a ponta de um ramo: pontos de controle + raio do feixe em cada um. */
interface LimbPath {
  points: Vec3[];
  radii: number[];
  /** Galho principal (nível 0) de onde este caminho saiu. */
  main: number;
}

interface LimbSystem {
  branches: number;
  elevation: readonly [number, number];
  levels: readonly { length: number; radius: number; children: number; spread: number; lift: number }[];
  tipRadius: number;
}

function growLimbs(
  system: LimbSystem,
  origin: Vec3,
  originRadius: number,
  rng: () => number,
  onMainBranch?: (index: number, start: Vec3, mid: Vec3, end: Vec3) => void,
): LimbPath[] {
  const leaves: LimbPath[] = [];

  const grow = (start: Vec3, direction: Vec3, level: number, path: LimbPath, mainIndex: number) => {
    const spec = system.levels[level];
    const length = spec.length * (0.8 + rng() * 0.4);
    // Arco: o ponto médio é empurrado para o lado — galhos curvos, não réguas.
    const bend = scale(rotate(perpendicular(direction), direction, rng() * Math.PI * 2), length * 0.14);
    const mid = add(add(start, scale(direction, length * 0.5)), bend);
    const end = add(start, scale(direction, length));
    const isLeaf = level === system.levels.length - 1;
    const nextRadius = isLeaf ? system.tipRadius : system.levels[level + 1].radius;

    const extended: LimbPath = {
      points: [...path.points, mid, end],
      radii: [...path.radii, (spec.radius + nextRadius) / 2, nextRadius],
      main: mainIndex,
    };
    if (level === 0) onMainBranch?.(mainIndex, start, mid, end);
    if (isLeaf) {
      leaves.push(extended);
      return;
    }

    for (let c = 0; c < spec.children; c++) {
      const next = system.levels[level + 1];
      const axis = rotate(perpendicular(direction), direction, (c / spec.children) * Math.PI * 2 + rng());
      const deviated = rotate(direction, axis, next.spread * (0.6 + rng() * 0.6));
      grow(end, normalize(add(deviated, [0, next.lift, 0])), level + 1, extended, mainIndex);
    }
  };

  for (let b = 0; b < system.branches; b++) {
    const azimuth = (b / system.branches) * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const elevation = system.elevation[0] + rng() * (system.elevation[1] - system.elevation[0]);
    const direction: Vec3 = [
      Math.cos(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.sin(azimuth) * Math.cos(elevation),
    ];
    grow(origin, direction, 0, { points: [origin], radii: [originRadius], main: b }, b);
  }
  return leaves;
}

// ── 2. Amostragem de curvas ───────────────────────────────────────────────────

/** Catmull-Rom uniforme entre p1 e p2. */
function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const out: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    out[i] =
      0.5 *
      (2 * p1[i] +
        (-p0[i] + p2[i]) * t +
        (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
        (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
  }
  return out;
}

const DENSE_STEPS = 10;

/**
 * Reamostra a spline em `count` pontos igualmente espaçados por comprimento de
 * arco (pontos de controle irregulares não geram "aglomerados" de vértices).
 */
function resample(points: Vec3[], radii: number[], count: number) {
  const dense: Vec3[] = [];
  const denseRadii: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < DENSE_STEPS; s++) {
      const t = s / DENSE_STEPS;
      dense.push(catmullRom(p0, points[i], points[i + 1], p3, t));
      denseRadii.push(radii[i] + (radii[i + 1] - radii[i]) * t);
    }
  }
  dense.push(points[points.length - 1]);
  denseRadii.push(radii[radii.length - 1]);

  const cumulative = [0];
  for (let i = 1; i < dense.length; i++) cumulative.push(cumulative[i - 1] + length(sub(dense[i], dense[i - 1])));
  const total = cumulative[cumulative.length - 1];

  const centers: Vec3[] = [];
  const outRadii: number[] = [];
  const arc: number[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / (count - 1)) * total;
    while (j < dense.length - 2 && cumulative[j + 1] < target) j++;
    const span = cumulative[j + 1] - cumulative[j] || 1;
    const f = Math.min(1, Math.max(0, (target - cumulative[j]) / span));
    centers.push(add(dense[j], scale(sub(dense[j + 1], dense[j]), f)));
    outRadii.push(denseRadii[j] + (denseRadii[j + 1] - denseRadii[j]) * f);
    arc.push(target);
  }
  return { centers, radii: outRadii, arc, total };
}

// ── 3. Montagem ───────────────────────────────────────────────────────────────

/** smoothstep(0, 1, x). */
const smooth01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export function generateYggdrasil(threadCount: number = YGGDRASIL.threads): YggdrasilData {
  const { trunk, samplesPerThread: samples, twist } = YGGDRASIL;
  const { braid } = YGGDRASIL.canopy;
  const rng = mulberry32(YGGDRASIL.seed);

  const trunkTop: Vec3 = [0, trunk.topY, 0];
  const trunkBase: Vec3 = [0, trunk.baseY, 0];

  const mainBranches = new Float32Array(YGGDRASIL.canopy.branches * 3);
  const canopy = growLimbs(YGGDRASIL.canopy, trunkTop, trunk.radiusTop, rng, (index, _start, _mid, end) =>
    mainBranches.set(end, index * 3),
  );
  const roots = growLimbs(YGGDRASIL.roots, trunkBase, trunk.radiusBase, rng);

  // Pontos interiores do tronco: o meio do caminho de todo fio é idêntico.
  const TRUNK_STEPS = 4;
  const trunkPoints: Vec3[] = [];
  const trunkRadii: number[] = [];
  for (let i = 1; i < TRUNK_STEPS; i++) {
    const f = i / TRUNK_STEPS;
    trunkPoints.push([0, trunk.baseY + (trunk.topY - trunk.baseY) * f, 0]);
    trunkRadii.push(trunk.radiusBase + (trunk.radiusTop - trunk.radiusBase) * f);
  }

  const vertexCount = threadCount * samples;
  const positions = new Float32Array(vertexCount * 3);
  const thread = new Float32Array(vertexCount * 4);
  const forkRegionSum = new Float64Array(YGGDRASIL.canopy.branches);
  const forkRegionCount = new Uint32Array(YGGDRASIL.canopy.branches);
  const index = new Uint32Array(threadCount * (samples - 1) * 2);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (let f = 0; f < threadCount; f++) {
    const root = roots[Math.floor(rng() * roots.length)];
    const branch = canopy[Math.floor(rng() * canopy.length)];

    // Raiz invertida (ponta → base) + tronco + galho (topo → ponta).
    const points = [...[...root.points].reverse(), ...trunkPoints, ...branch.points];
    const radii = [...[...root.radii].reverse(), ...trunkRadii, ...branch.radii];
    const curve = resample(points, radii, samples);

    // Comprimento de arco no meio do tronco: a origem da "região" deste fio
    // (o crescimento parte daqui para as duas pontas).
    const midY = (trunk.baseY + trunk.topY) / 2;
    let trunkMidArc = 0;
    let closest = Infinity;
    for (let k = 0; k < samples; k++) {
      const c = curve.centers[k];
      const distance = Math.abs(c[1] - midY) + Math.hypot(c[0], c[2]) * 4;
      if (distance < closest) {
        closest = distance;
        trunkMidArc = curve.arc[k];
      }
    }

    // Posição do fio na seção transversal do feixe (distribuição uniforme no disco).
    const seed = rng();
    const radial = Math.sqrt(rng()) * 0.95;
    const phase0 = rng() * Math.PI * 2;
    const weave = rng() * 10;
    // Mecha da trança nas pontas: derivada de `weave`, sem consumir o rng (a árvore não muda de forma).
    const strand = Math.floor(((weave * 7.13) % 1) * braid.strands);

    // Região na forquilha do galho principal deste fio (média por galho, ver mainBranchRegions).
    const fork: Vec3 = [mainBranches[branch.main * 3], mainBranches[branch.main * 3 + 1], mainBranches[branch.main * 3 + 2]];
    let forkK = samples - 1;
    let forkDistance = Infinity;
    for (let k = 0; k < samples; k++) {
      const distance = length(sub(curve.centers[k], fork));
      if (distance < forkDistance) {
        forkDistance = distance;
        forkK = k;
      }
    }
    const forkRegion = (curve.arc[forkK] - trunkMidArc) / (curve.total - trunkMidArc || 1);
    forkRegionSum[branch.main] += forkRegion;
    forkRegionCount[branch.main]++;

    // Referencial que acompanha a curva (transporte paralelo aproximado).
    let normal: Vec3 = [0, 0, 0];
    const base = f * samples;
    for (let k = 0; k < samples; k++) {
      const c = curve.centers[k];
      const tangent = normalize(sub(curve.centers[Math.min(samples - 1, k + 1)], curve.centers[Math.max(0, k - 1)]));
      normal = k === 0 ? perpendicular(tangent) : normalize(sub(normal, scale(tangent, dot(normal, tangent))));
      const binormal = cross(tangent, normal);

      const s = curve.arc[k];
      const region =
        s < trunkMidArc ? -(trunkMidArc - s) / (trunkMidArc || 1) : (s - trunkMidArc) / (curve.total - trunkMidArc || 1);
      const angle = phase0 + twist * s;
      // "Trama": o fio entra e sai do feixe, dando textura de corda trançada.
      const r = curve.radii[k] * radial * (1 + 0.15 * Math.sin(s * 1.3 + weave));
      let ox = Math.cos(angle) * r;
      let oy = Math.sin(angle) * r;
      // Pontas da copa: o feixe vira trança — cada mecha orbita o eixo, e o fio, a sua mecha.
      const b = region > 0 ? smooth01((region - braid.from) / (braid.to - braid.from)) : 0;
      if (b > 0) {
        const R = curve.radii[k];
        const orbit = (strand / braid.strands) * Math.PI * 2 + braid.twist * s;
        const bx = Math.cos(orbit) * R * braid.spread + Math.cos(angle) * R * braid.ply * radial;
        const by = Math.sin(orbit) * R * braid.spread + Math.sin(angle) * R * braid.ply * radial;
        ox += (bx - ox) * b;
        oy += (by - oy) * b;
      }
      const p = add(c, add(scale(normal, ox), scale(binormal, oy)));

      const v = (base + k) * 3;
      positions[v] = p[0];
      positions[v + 1] = p[1];
      positions[v + 2] = p[2];
      for (let a = 0; a < 3; a++) {
        if (p[a] < min[a]) min[a] = p[a];
        if (p[a] > max[a]) max[a] = p[a];
      }

      const w = (base + k) * 4;
      thread[w] = seed;
      thread[w + 1] = k / (samples - 1);
      thread[w + 2] = region;
      thread[w + 3] = branch.main;

      if (k < samples - 1) {
        const e = (f * (samples - 1) + k) * 2;
        index[e] = base + k;
        index[e + 1] = base + k + 1;
      }
    }
  }

  return {
    threadCount,
    samplesPerThread: samples,
    positions,
    thread,
    index,
    mainBranches,
    mainBranchRegions: Float32Array.from(forkRegionSum, (sum, b) => sum / Math.max(1, forkRegionCount[b])),
    bounds: { min, max },
  };
}
