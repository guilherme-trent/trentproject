import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '@/engine/lib/random';

/**
 * Geometrias do Despertar. Nenhuma posição animada é escrita pela CPU:
 * cada geometria leva só atributos estáticos (quem é cada vértice) e os
 * shaders fazem o movimento.
 */

/** Grade do tubo: x = t ao longo da Bézier, y = ângulo (0..1). 4 instâncias (aStrand). */
export function createStrandGeometry(strands: number) {
  const ALONG = 56;
  const AROUND = 10;
  const positions: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= ALONG; i++) for (let j = 0; j <= AROUND; j++) positions.push(i / ALONG, j / AROUND, 0);
  for (let i = 0; i < ALONG; i++)
    for (let j = 0; j < AROUND; j++) {
      const a = i * (AROUND + 1) + j;
      const b = a + AROUND + 1;
      index.push(a, a + 1, b, b, a + 1, b + 1); // anti-horário visto de fora: a face externa é a frontal
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.setAttribute('aStrand', new InstancedBufferAttribute(new Float32Array(Array.from({ length: strands }, (_, i) => i)), 1));
  return geometry;
}

/** Parafuso sextavado de frente para a câmera + arruela. 4 instâncias (aNail). */
export function createNailGeometry(nails: number) {
  const head = new CylinderGeometry(0.15, 0.17, 0.09, 6).rotateX(Math.PI / 2).translate(0, 0, 0.05);
  const washer = new CylinderGeometry(0.24, 0.25, 0.03, 10).rotateX(Math.PI / 2);
  const geometry = mergeGeometries([head.toNonIndexed(), washer.toNonIndexed()].map(strip))!;
  head.dispose();
  washer.dispose();
  geometry.setAttribute('aNail', new InstancedBufferAttribute(new Float32Array(Array.from({ length: nails }, (_, i) => i)), 1));
  return geometry;
}

const strip = (geometry: BufferGeometry) => {
  for (const name of Object.keys(geometry.attributes)) if (name !== 'position') geometry.deleteAttribute(name);
  return geometry;
};

/** A membrana: grade em NDC (−1..1), densa o bastante para as bordas dos cortes se repuxarem. */
export const createMembraneGeometry = () => new PlaneGeometry(2, 2, 96, 96);

// ── Autômato ─────────────────────────────────────────────────────────────────

const PART = { shell: 0, neon: 1, leg: 2, eye: 3 } as const;

function tag(geometry: BufferGeometry, part: number, leg: [number, number, number] = [0, 0, 0], hip = new Vector3()) {
  const flat = strip(geometry.index ? geometry.toNonIndexed() : geometry);
  const count = flat.getAttribute('position').count;
  flat.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(count).fill(part), 1));
  const legData = new Float32Array(count * 3);
  const hipData = new Float32Array(count * 3);
  const position = flat.getAttribute('position');
  for (let i = 0; i < count; i++) {
    // t ao longo da pata: distância ao quadril (0 no quadril → 1 no pé).
    const t = part === PART.leg ? Math.min(1, Math.hypot(position.getX(i) - hip.x, position.getY(i) - hip.y) / 0.62) : 0;
    legData.set([leg[0], leg[1], t], i * 3);
    hipData.set([hip.x, hip.y, hip.z], i * 3);
  }
  flat.setAttribute('aLeg', new Float32BufferAttribute(legData, 3));
  flat.setAttribute('aHip', new Float32BufferAttribute(hipData, 3));
  return flat;
}

/**
 * O besouro, olhando para +X, costas para +Z (a câmera). Casco facetado
 * (icosaedros achatados), filetes de neon, 6 patas de dois segmentos,
 * mandíbulas e olhos. Uma geometria, um draw call.
 */
export function createBeetleGeometry() {
  const parts: BufferGeometry[] = [];
  const shell = new IcosahedronGeometry(0.5, 1).scale(1.2, 0.92, 0.42).translate(-0.24, 0, 0.12);
  const thorax = new IcosahedronGeometry(0.3, 0).scale(0.75, 1, 0.5).translate(0.36, 0, 0.1);
  const head = new IcosahedronGeometry(0.19, 0).scale(1, 1.05, 0.7).translate(0.64, 0, 0.08);
  parts.push(tag(shell, PART.shell), tag(thorax, PART.shell), tag(head, PART.shell));

  // Neon: a sutura do élitro e dois filetes laterais.
  parts.push(tag(new BoxGeometry(0.95, 0.025, 0.02).translate(-0.24, 0, 0.335), PART.neon));
  for (const side of [-1, 1]) {
    parts.push(tag(new BoxGeometry(0.7, 0.03, 0.03).rotateZ(side * 0.12).translate(-0.28, side * 0.4, 0.2), PART.neon));
    parts.push(tag(new ConeGeometry(0.035, 0.24, 4).rotateZ(-Math.PI / 2 + side * 0.5).translate(0.86, side * 0.1, 0.06), PART.shell));
    parts.push(tag(new IcosahedronGeometry(0.045, 0).translate(0.74, side * 0.12, 0.14), PART.eye));
  }

  // Patas: quadril no tórax, coxa para fora, canela para baixo/fora.
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const hip = new Vector3(0.48 - i * 0.24, side * 0.2, 0.05);
      const sweep = (i - 1) * 0.55;
      const out = new Vector3(Math.sin(sweep) * 0.32, side * Math.cos(sweep) * 0.32, 0.06).add(hip);
      const foot = new Vector3(Math.sin(sweep * 1.3) * 0.62, side * Math.cos(sweep * 1.3) * 0.62, -0.08).add(hip);
      for (const [from, to, width] of [[hip, out, 0.05], [out, foot, 0.035]] as const) {
        const length = from.distanceTo(to);
        const segment = new BoxGeometry(length, width, width);
        segment.rotateY(-Math.asin((to.z - from.z) / length));
        segment.rotateZ(Math.atan2(to.y - from.y, to.x - from.x));
        segment.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
        parts.push(tag(segment, PART.leg, [i, side, 0], hip));
      }
    }
  const beetle = mergeGeometries(parts)!;
  parts.forEach((part) => part.dispose());
  return beetle;
}

/** A cúpula-botão: meia esfera voltada para a câmera, sobre o élitro. */
export const DOME = { x: -0.2, z: 0.3, radius: 0.17 } as const;
export function createDomeGeometry() {
  const dome = new SphereGeometry(DOME.radius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  dome.deleteAttribute('uv');
  return dome;
}

// ── A teia de cacos ──────────────────────────────────────────────────────────

/**
 * Vidro estilhaçado por impacto: raios + anéis concêntricos com espaçamento
 * logarítmico (pó de vidro perto do clique, placas largas na periferia),
 * vértices com jitter COMPARTILHADO entre vizinhos (os cacos encaixam sem
 * fresta) e cada célula dividida em dois triângulos pela diagonal aleatória.
 * Coordenadas: deslocamento a partir do ponto de impacto, em alturas de
 * tela (o shader soma a origem e corrige o aspect). Raio cobre qualquer tela.
 */
export function createShatterGeometry() {
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
  return geometry;
}
