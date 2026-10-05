/**
 * Gerador procedural da Constelação Neural (CPU, determinístico).
 *
 * TOPOLOGIA — uma rede neural em camadas concêntricas, enraizada no feixe:
 *   - Tronco: hubs alinhados no eixo Y — exatamente onde o feixe estava.
 *     É a "coluna" da Árvore da Vida, e quase não se move na explosão.
 *   - Camada interna e camada externa: hubs em esferas de Fibonacci.
 *   - Sinapses longas ligam tronco → camada interna → camada externa (axônios).
 *   - Milhares de nós se aglomeram em torno dos hubs ou correm ao longo dos
 *     axônios, e cada nó se conecta aos vizinhos mais próximos.
 *
 * PROPRIEDADE-CHAVE — o grafo é "prefix-closed":
 *   cada nó i só se conecta a nós j < i. Logo, os primeiros N nós formam um
 *   subgrafo completo e suas arestas são exatamente as primeiras
 *   `segmentOffsets[N]`. Reduzir qualidade = desenhar menos instâncias e um
 *   drawRange menor, SEM realocar nenhum buffer na GPU. Os hubs vêm primeiro,
 *   então a estrutura macro sobrevive até no tier 'low'.
 */

export const MAX_NODES = 7000;

const SEED = 0x5eed_c0de;
const NEIGHBORS = 3;
const LINK_RADIUS = 0.85;

const TRUNK_HUBS = 9;
const TRUNK_HALF_HEIGHT = 5.5;
const INNER_HUBS = 14;
const INNER_RADIUS = 3;
const OUTER_HUBS = 30;
const OUTER_RADIUS: readonly [x: number, y: number, z: number] = [6.2, 7, 6.2];

/** |y| máximo usado para normalizar a origem dos nós ao longo do feixe. */
const BEAM_SPAN = 7;

export interface ConstellationData {
  nodeCount: number;
  /** Matrizes de instância (posição final + escala), column-major, 16 floats por nó. */
  matrices: Float32Array;
  /** Aleatório estável por nó, [0, 1). Dirige cor, cintilação e atraso da explosão. */
  seeds: Float32Array;
  /** Ponto de origem no feixe, normalizado em [-1, 1] (o shader multiplica pela meia-altura do feixe). */
  originY: Float32Array;
  /** `segmentOffsets[n]` = nº de sinapses entre os primeiros n nós. Tamanho nodeCount + 1. */
  segmentOffsets: Uint32Array;
  /** Atributos por vértice das sinapses (2 vértices por segmento). */
  lines: {
    positions: Float32Array;
    originY: Float32Array;
    nodeSeed: Float32Array;
    segmentSeed: Float32Array;
    /** 0 no vértice de origem, 1 no destino — o shader interpola para correr o pulso. */
    side: Float32Array;
  };
  /** Raio da esfera envolvente (usado no enquadramento da câmera). */
  radius: number;
}

type Vec3 = [number, number, number];

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

const distSq = (a: Vec3, b: Vec3) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

function fibonacciSphere(count: number, radius: Vec3, jitter: () => number): Vec3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    const theta = i * golden;
    return [
      Math.cos(theta) * r * radius[0] + jitter(),
      y * radius[1] + jitter(),
      Math.sin(theta) * r * radius[2] + jitter(),
    ];
  });
}

function nearest(from: Vec3, candidates: readonly number[], points: readonly Vec3[], k: number) {
  return [...candidates].sort((a, b) => distSq(from, points[a]) - distSq(from, points[b])).slice(0, k);
}

export function generateConstellation(nodeCount = MAX_NODES): ConstellationData {
  const rng = mulberry32(SEED);
  const gauss = () => {
    const u = 1 - rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  };

  // ── 1. Esqueleto macro ────────────────────────────────────────────────────
  const trunk: Vec3[] = Array.from({ length: TRUNK_HUBS }, (_, i) => [
    0,
    -TRUNK_HALF_HEIGHT + (2 * TRUNK_HALF_HEIGHT * i) / (TRUNK_HUBS - 1),
    0,
  ]);
  const inner = fibonacciSphere(INNER_HUBS, [INNER_RADIUS, INNER_RADIUS, INNER_RADIUS], () => gauss() * 0.3);
  const outer = fibonacciSphere(OUTER_HUBS, [...OUTER_RADIUS], () => gauss() * 0.45);
  const hubs = [...trunk, ...inner, ...outer];
  const hubSigma = [...trunk.map(() => 0.3), ...inner.map(() => 0.45), ...outer.map(() => 0.6)];

  const trunkIdx = trunk.map((_, i) => i);
  const innerIdx = inner.map((_, i) => TRUNK_HUBS + i);
  const outerIdx = outer.map((_, i) => TRUNK_HUBS + INNER_HUBS + i);

  const adjacency: Set<number>[] = hubs.map(() => new Set());
  const link = (a: number, b: number) => {
    if (a === b) return;
    adjacency[a].add(b);
    adjacency[b].add(a);
  };
  for (let i = 1; i < TRUNK_HUBS; i++) link(i - 1, i);
  trunkIdx.forEach((t) => nearest(hubs[t], innerIdx, hubs, 2).forEach((n) => link(t, n)));
  innerIdx.forEach((n) => nearest(hubs[n], outerIdx, hubs, 3).forEach((o) => link(n, o)));
  outerIdx.forEach((o) => nearest(hubs[o], outerIdx.filter((x) => x !== o), hubs, 2).forEach((x) => link(o, x)));

  const edges: [number, number][] = [];
  adjacency.forEach((neighbors, a) => neighbors.forEach((b) => a < b && edges.push([a, b])));

  // ── 2. Nós (layout plano xyzxyz… — sem um array alocado por nó) ────────
  const pos = new Float32Array(nodeCount * 3);
  const scales = new Float32Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    const o = i * 3;
    if (i < hubs.length) {
      pos[o] = hubs[i][0];
      pos[o + 1] = hubs[i][1];
      pos[o + 2] = hubs[i][2];
      scales[i] = i < TRUNK_HUBS ? 0.13 : 0.16;
      continue;
    }

    const roll = rng();
    if (roll < 0.06) {
      // Fibra do tronco: o "eco" do feixe que permanece no eixo.
      pos[o] = gauss() * 0.18;
      pos[o + 1] = (rng() * 2 - 1) * TRUNK_HALF_HEIGHT * 1.15;
      pos[o + 2] = gauss() * 0.18;
    } else if (roll < 0.55) {
      // Aglomerado em torno de um hub (gânglio).
      const h = Math.floor(rng() * hubs.length);
      const s = hubSigma[h];
      pos[o] = hubs[h][0] + gauss() * s;
      pos[o + 1] = hubs[h][1] + gauss() * s;
      pos[o + 2] = hubs[h][2] + gauss() * s;
    } else {
      // Ao longo de um axônio, com leve arco para não parecer régua.
      const [a, b] = edges[Math.floor(rng() * edges.length)];
      const t = rng();
      const bow = Math.sin(Math.PI * t) * 0.35;
      pos[o] = hubs[a][0] + (hubs[b][0] - hubs[a][0]) * t + gauss() * 0.1;
      pos[o + 1] = hubs[a][1] + (hubs[b][1] - hubs[a][1]) * t + gauss() * 0.1 + bow;
      pos[o + 2] = hubs[a][2] + (hubs[b][2] - hubs[a][2]) * t + gauss() * 0.1;
    }
    scales[i] = 0.03 + rng() ** 4 * 0.08;
  }

  // ── 3. Sinapses (kNN incremental em grade espacial: O(n)) ─────────────────
  // Hot loop: sem alocação por candidato; top-K mantido por inserção em arrays fixos.
  const cell = (v: number) => Math.floor(v / LINK_RADIUS) + 512;
  const grid = new Map<number, number[]>();
  const segments: number[] = [];
  const segmentOffsets = new Uint32Array(nodeCount + 1);
  const linkRadiusSq = LINK_RADIUS * LINK_RADIUS;
  const bestJ = new Int32Array(NEIGHBORS);
  const bestD = new Float64Array(NEIGHBORS);

  for (let i = 0; i < nodeCount; i++) {
    const px = pos[i * 3];
    const py = pos[i * 3 + 1];
    const pz = pos[i * 3 + 2];
    const isHub = i < hubs.length;

    if (isHub) adjacency[i].forEach((j) => j < i && segments.push(j, i));

    let found = 0;
    const cx = cell(px);
    const cy = cell(py);
    const cz = cell(pz);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(((cx + dx) * 1024 + (cy + dy)) * 1024 + (cz + dz));
          if (!bucket) continue;
          for (let b = 0; b < bucket.length; b++) {
            const j = bucket[b];
            const ex = pos[j * 3] - px;
            const ey = pos[j * 3 + 1] - py;
            const ez = pos[j * 3 + 2] - pz;
            const d = ex * ex + ey * ey + ez * ez;
            if (d > linkRadiusSq || (found === NEIGHBORS && d >= bestD[NEIGHBORS - 1])) continue;
            // Inserção ordenada no top-K.
            let k = found < NEIGHBORS ? found++ : NEIGHBORS - 1;
            while (k > 0 && bestD[k - 1] > d) {
              bestD[k] = bestD[k - 1];
              bestJ[k] = bestJ[k - 1];
              k--;
            }
            bestD[k] = d;
            bestJ[k] = j;
          }
        }
      }
    }
    for (let k = 0; k < found; k++) {
      if (isHub && adjacency[i].has(bestJ[k])) continue; // já ligado pelo esqueleto
      segments.push(bestJ[k], i);
    }

    const key = (cx * 1024 + cy) * 1024 + cz;
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);

    segmentOffsets[i + 1] = segments.length / 2;
  }

  // ── 4. Empacotamento em typed arrays (formato final da GPU) ──────────────
  const matrices = new Float32Array(nodeCount * 16);
  const seeds = new Float32Array(nodeCount);
  const originY = new Float32Array(nodeCount);
  let radius = 0;
  for (let i = 0; i < nodeCount; i++) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    const m = i * 16;
    matrices[m] = matrices[m + 5] = matrices[m + 10] = scales[i];
    matrices[m + 12] = x;
    matrices[m + 13] = y;
    matrices[m + 14] = z;
    matrices[m + 15] = 1;
    seeds[i] = rng();
    originY[i] = Math.max(-1, Math.min(1, y / BEAM_SPAN + gauss() * 0.02));
    radius = Math.max(radius, Math.hypot(x, y, z));
  }

  const vertexCount = segments.length;
  const lines = {
    positions: new Float32Array(vertexCount * 3),
    originY: new Float32Array(vertexCount),
    nodeSeed: new Float32Array(vertexCount),
    segmentSeed: new Float32Array(vertexCount),
    side: new Float32Array(vertexCount),
  };
  for (let v = 0; v < vertexCount; v++) {
    const node = segments[v];
    lines.positions[v * 3] = pos[node * 3];
    lines.positions[v * 3 + 1] = pos[node * 3 + 1];
    lines.positions[v * 3 + 2] = pos[node * 3 + 2];
    lines.originY[v] = originY[node];
    lines.nodeSeed[v] = seeds[node];
    lines.side[v] = v % 2;
    if (v % 2 === 0) {
      const segmentSeed = rng();
      lines.segmentSeed[v] = segmentSeed;
      lines.segmentSeed[v + 1] = segmentSeed;
    }
  }

  return { nodeCount, matrices, seeds, originY, segmentOffsets, lines, radius };
}
