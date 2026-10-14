import { BUILD, cameraZ, reachAt, span, TUNNEL } from './config';
import { box, ellipse, lathe, polyline, quadratic, subdivide, type Pen, type V3 } from './lineart';

/**
 * OS MONUMENTOS — obras famosas da humanidade, desenhadas em linhas como o
 * resto da Metrópole e montadas pela MESMA janela de construção: surgem linha
 * a linha conforme a câmera se aproxima e se desfazem se ela recua. Custo:
 * zero draw calls a mais (são segmentos da cidade, com os mesmos reflexos).
 *
 * Uma linha do tempo da criação humana, em ordem cronológica em cada
 * distrito — à esquerda a ESTRUTURA (de Stonehenge ao Viaduto de Millau), à
 * direita a FORMA (do Taj Mahal ao Burj Khalifa). Os veículos (vehicles.ts)
 * passam entre eles, nas suas épocas.
 *
 * Coordenadas LOCAIS de cada desenho: `lx` cresce para LONGE do corredor
 * (o mesmo desenho serve aos dois lados), `ly` sobe a partir do chão, `lz`
 * corre ao longo do túnel. Altura útil do túnel: 4 unidades (chão a teto).
 */

type Shape = (pen: Pen) => void;

export interface Landmark {
  id: string;
  side: -1 | 1;
  /** Progresso da jornada em que a câmera passa pelo centro da peça. */
  at: number;
  /** Distância do centro da peça ao eixo do corredor. */
  offset: number;
  /** Meia-extensão ao longo do túnel (z). */
  reach: number;
  shape: Shape;
  /**
   * Onde o nome flutua (local) — logo abaixo da linha dos olhos, para não
   * disputar com as frases do manifesto. Sem `label`: estrutura de apoio, sem nome.
   */
  label?: { id: string; anchor: V3 };
  /** Abre clareira na cidade genérica ao redor (padrão: sim). */
  clears?: boolean;
  /**
   * Peças muito longas (trilhos) se constroem ACOMPANHANDO a câmera: cada
   * segmento na janela do seu próprio z, como a cidade genérica — em vez de a
   * peça inteira se montar de uma vez lá na frente.
   */
  follows?: boolean;
}

// ── Estrutura ────────────────────────────────────────────────────────────────

/** Stonehenge: o círculo de sarsens com lintéis (com falhas, como hoje), a ferradura de trilitos, o fosso e a Heel Stone. */
const stonehenge: Shape = (pen) => {
  const N = 30;
  const R = 1.0;
  const h = 0.42;
  const missing = new Set([3, 4, 9, 13, 14, 15, 19, 22, 26]);
  const at = (a: number, r: number, y: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r];
  for (let i = 0; i < N; i++) {
    if (missing.has(i)) continue;
    const a = (i / N) * Math.PI * 2;
    const o = 0.1 + 0.4 * (i / N);
    for (const d of [-0.04, 0.04]) pen(at(a + d / R, R, 0), at(a + d / R, R, h), o);
    pen(at(a - 0.04 / R, R, h), at(a + 0.04 / R, R, h), o + 0.1);
    if (!missing.has((i + 1) % N)) pen(at(a, R, h + 0.04), at(a + (Math.PI * 2) / N, R, h + 0.04), o + 0.2);
  }
  // A ferradura de cinco trilitos, mais altos no fundo.
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * (0.25 + (k * 1.5) / 4);
    const height = 0.5 + 0.14 * (1 - Math.abs(k - 2) / 2);
    const r = 0.56;
    for (const d of [-0.1, 0.1]) {
      pen(at(a + d / r - 0.035 / r, r, 0), at(a + d / r - 0.035 / r, r, height), 0.5 + 0.05 * k);
      pen(at(a + d / r + 0.035 / r, r, 0), at(a + d / r + 0.035 / r, r, height), 0.5 + 0.05 * k);
    }
    pen(at(a - 0.15 / r, r, height + 0.05), at(a + 0.15 / r, r, height + 0.05), 0.7 + 0.04 * k);
  }
  polyline(pen, ellipse(0, 0.01, 0, 1.5, 1.5, 40), 0, 0.1, true);
  pen([-1.9, 0, 0.1], [-1.9, 0.36, 0.13], 0.9);
};

/** Partenon: o estilóbato em degraus, a colunata dórica (8 × 17), o entablamento e os frontões. */
const parthenon: Shape = (pen) => {
  const X = 0.5;
  const Z = 1.15;
  const H = 0.62;
  for (let s = 0; s < 3; s++) polyline(pen, [[-X - 0.12 + s * 0.04, s * 0.04, -Z - 0.12 + s * 0.04], [X + 0.12 - s * 0.04, s * 0.04, -Z - 0.12 + s * 0.04], [X + 0.12 - s * 0.04, s * 0.04, Z + 0.12 - s * 0.04], [-X - 0.12 + s * 0.04, s * 0.04, Z + 0.12 - s * 0.04]], 0.02 * s, 0.02 * s, true);
  const base = 0.12;
  const columns: [number, number][] = [];
  for (let i = 0; i < 8; i++) for (const z of [-Z, Z]) columns.push([-X + (2 * X * i) / 7, z]);
  for (let i = 1; i < 16; i++) for (const x of [-X, X]) columns.push([x, -Z + (2 * Z * i) / 16]);
  columns.forEach(([x, z], i) => {
    const o = 0.1 + 0.4 * ((z + Z) / (2 * Z));
    pen([x - 0.03, base, z], [x - 0.025, base + H, z], o + 0.002 * i);
    pen([x + 0.03, base, z], [x + 0.025, base + H, z], o + 0.002 * i);
    polyline(pen, [[x - 0.045, base + H, z - 0.045], [x + 0.045, base + H, z - 0.045], [x + 0.045, base + H, z + 0.045], [x - 0.045, base + H, z + 0.045]], o + 0.25, o + 0.25, true);
  });
  for (const y of [base + H + 0.01, base + H + 0.1]) polyline(pen, [[-X - 0.05, y, -Z - 0.05], [X + 0.05, y, -Z - 0.05], [X + 0.05, y, Z + 0.05], [-X - 0.05, y, Z + 0.05]], 0.75, 0.75, true);
  // Os frontões triangulares e a cumeeira.
  const eave = base + H + 0.1;
  for (const z of [-Z - 0.05, Z + 0.05]) polyline(pen, [[-X - 0.05, eave, z], [0, eave + 0.22, z], [X + 0.05, eave, z]], 0.85, 0.9);
  pen([0, eave + 0.22, -Z - 0.05], [0, eave + 0.22, Z + 0.05], 0.95);
};

/** Torre de Pisa: oito andares de galerias num cilindro inclinado ~4° (para longe do corredor), com o campanário. */
const pisa: Shape = (pen) => {
  const tilt = (4 * Math.PI) / 180;
  const lean = ([x, y, z]: V3): V3 => [x * Math.cos(tilt) + y * Math.sin(tilt), -x * Math.sin(tilt) + y * Math.cos(tilt), z];
  const leaning: Pen = (a, b, order) => pen(lean(a), lean(b), order);
  const r = 0.24;
  const levels = [0, 0.32, 0.52, 0.72, 0.92, 1.12, 1.32, 1.52];
  lathe(leaning, levels.map((y): [number, number] => [r, y]), 0, 0, 12, 0, 0.75);
  // As galerias: um arco entre cada par de colunas, em cada andar.
  for (let k = 1; k < levels.length - 1; k++)
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2;
      const a1 = ((i + 1) / 12) * Math.PI * 2;
      const top = levels[k + 1];
      polyline(leaning, [0, 0.5, 1].map((t): V3 => { const a = a0 + (a1 - a0) * t; return [Math.cos(a) * (r + 0.03), top - 0.06 + 0.04 * Math.sin(Math.PI * t), Math.sin(a) * (r + 0.03)]; }), 0.2 + 0.07 * k);
    }
  lathe(leaning, [[0.16, 1.52], [0.16, 1.78], [0.12, 1.86]], 0, 0, 10, 0.8, 0.95);
};

/** Pirâmide de Gizé: base quadrada, arestas até o ápice e as fiadas de blocos. */
const pyramid: Shape = (pen) => {
  const b = 1.15;
  const H = 1.45;
  const COURSES = 12;
  const square = (s: number, y: number): V3[] => [[-s, y, -s], [s, y, -s], [s, y, s], [-s, y, s]];
  polyline(pen, square(b, 0), 0, 0.08, true);
  for (const corner of square(b, 0)) polyline(pen, subdivide(corner, [0, H, 0], 6), 0.05, 0.85);
  for (let k = 1; k < COURSES; k++) polyline(pen, square(b * (1 - k / COURSES), (H * k) / COURSES), 0.1 + (0.8 * k) / COURSES, 0.12 + (0.8 * k) / COURSES, true);
};

/** Coliseu: elipse de arcadas em três ordens + ático; o anel externo ruiu do lado do corredor (vê-se a arena). */
const colosseum: Shape = (pen) => {
  const A = 1.5; // z
  const B = 1.15; // x
  const N = 28;
  const h = 0.34;
  const attic = 0.26;
  const at = (a: number, y: number, s = 1): V3 => [Math.cos(a) * B * s, y, Math.sin(a) * A * s];
  const intact = (a: number) => Math.cos(a) > 0.1; // o lado longe do corredor guarda a altura toda
  for (let j = 0; j < N; j++) {
    const a0 = (j / N) * Math.PI * 2;
    const a1 = ((j + 1) / N) * Math.PI * 2;
    const tall = intact((a0 + a1) / 2);
    const levels = tall ? 3 : 2;
    const o = j / N;
    for (let L = 0; L < levels; L++) {
      pen(at(a0, L * h), at(a0, (L + 1) * h), 0.1 + 0.22 * L + 0.04 * o);
      // O arco da baia: semicírculo entre os pilares.
      polyline(pen, Array.from({ length: 5 }, (_, i) => at(a0 + ((a1 - a0) * i) / 4, L * h + h * (0.55 + 0.35 * Math.sin((Math.PI * i) / 4)))), 0.16 + 0.22 * L + 0.04 * o);
      pen(at(a0, (L + 1) * h), at(a1, (L + 1) * h), 0.2 + 0.22 * L + 0.04 * o);
    }
    pen(at(a0, 0), at(a1, 0), 0.04 * o);
    if (tall) {
      pen(at(a0, 3 * h), at(a0, 3 * h + attic), 0.8 + 0.04 * o);
      pen(at(a0, 3 * h + attic), at(a1, 3 * h + attic), 0.84 + 0.04 * o);
    }
  }
  // Anel interno (a cávea), arena e as escadarias que descem até ela.
  for (let k = 0; k <= 2; k++) polyline(pen, ellipse(0, k * h, 0, B * 0.72, A * 0.72, 32), 0.3 + 0.12 * k, 0.4 + 0.12 * k, true);
  for (let j = 0; j < N; j += 2) {
    const a = (j / N) * Math.PI * 2;
    pen(at(a, 0, 0.72), at(a, 2 * h, 0.72), 0.35 + 0.02 * (j / N));
    pen(at(a, 2 * h, 0.72), at(a, 0.4 * h, 0.45), 0.6 + 0.02 * (j / N));
  }
  polyline(pen, ellipse(0, 0.01, 0, B * 0.42, A * 0.4, 28), 0.5, 0.6, true);
};

/** Torre Eiffel: quatro pernas curvas que se unem, plataformas, treliça em X, os arcos da base e a antena. */
const eiffel: Shape = (pen) => {
  const H = 3.55;
  const s = (u: number) => 0.05 + 0.73 * Math.pow(1 - u, 2.6);
  const leg = (u: number) => (u < 0.38 ? 0.3 * (1 - u / 0.38) : 0);
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const;
  const corner = (i: number, u: number): V3 => [corners[i][0] * s(u), u * H, corners[i][1] * s(u)];
  for (let i = 0; i < 4; i++) {
    const [sx, sz] = corners[i];
    polyline(pen, Array.from({ length: 25 }, (_, k) => corner(i, (k / 24) * 0.88)), 0, 0.8);
    // As faces internas de cada perna, até se fundirem no 2º andar.
    polyline(pen, Array.from({ length: 11 }, (_, k) => { const u = (k / 10) * 0.38; return [sx * s(u), u * H, sz * (s(u) - leg(u))] as V3; }), 0.02, 0.32);
    polyline(pen, Array.from({ length: 11 }, (_, k) => { const u = (k / 10) * 0.38; return [sx * (s(u) - leg(u)), u * H, sz * s(u)] as V3; }), 0.02, 0.32);
  }
  const ring = (u: number, grow = 0) => [0, 1, 2, 3].map((i) => { const c = corner(i, u); return [c[0] * (1 + grow / s(u)), c[1], c[2] * (1 + grow / s(u))] as V3; });
  for (let u = 0.05; u <= 0.851; u += 0.05) polyline(pen, ring(u), u * 0.9, u * 0.9, true);
  for (const u of [0.19, 0.38]) polyline(pen, ring(u, 0.06), u * 0.9 + 0.03, u * 0.9 + 0.03, true); // as plataformas
  for (let u = 0.38; u < 0.84; u += 0.05)
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      pen(corner(i, u), corner(j, u + 0.05), u * 0.9 + 0.02);
      pen(corner(j, u), corner(i, u + 0.05), u * 0.9 + 0.02);
    }
  // Os arcos da base, um por face, de perna a perna.
  const inner = s(0) - leg(0);
  for (let f = 0; f < 4; f++)
    polyline(pen, Array.from({ length: 9 }, (_, k) => {
      const t = -1 + (2 * k) / 8;
      const y = 0.13 * H * Math.pow(1 - t * t, 0.7);
      const out = s(y / H);
      const along = t * inner;
      return (f === 0 ? [out, y, along] : f === 1 ? [-out, y, along] : f === 2 ? [along, y, out] : [along, y, -out]) as V3;
    }), 0.12, 0.2);
  box(pen, [-0.06, 0.88 * H, -0.06], [0.06, 0.93 * H, 0.06], 0.86, 0.9);
  pen([0, 0.93 * H, 0], [0, H + 0.25, 0], 0.95);
};

/** Ponte Golden Gate (ao longo do túnel): torres com pórticos, tabuleiro treliçado, cabos em parábola e pendurais. */
const goldenGate: Shape = (pen) => {
  const deck = 0.95;
  const top = 3.2;
  const span = 1.9;
  const end = 3.1;
  for (const zt of [-span, span]) {
    for (const x of [-0.28, 0.28]) pen([x * 1.12, 0, zt], [x, top, zt], 0.05);
    for (const y of [1.3, 2.0, 2.6, 3.12]) pen([-0.28, y, zt], [0.28, y, zt], 0.15 + y * 0.06);
  }
  for (const x of [-0.25, 0.25]) {
    polyline(pen, subdivide([x, deck, -end], [x, deck, end], 20), 0.32, 0.5);
    polyline(pen, subdivide([x, deck - 0.12, -end], [x, deck - 0.12, end], 20), 0.34, 0.52);
    for (let z = -end; z <= end + 1e-6; z += 0.31) pen([x, deck - 0.12, z], [x, deck, z], 0.42 + 0.06 * ((z + end) / (2 * end)));
  }
  const low = deck + 0.12;
  const cable = (z: number) => low + (top - 0.05 - low) * (z / span) ** 2;
  for (const x of [-0.28, 0.28]) {
    polyline(pen, Array.from({ length: 25 }, (_, i) => { const z = -span + (2 * span * i) / 24; return [x, cable(z), z] as V3; }), 0.55, 0.78);
    for (const dir of [-1, 1])
      polyline(pen, Array.from({ length: 7 }, (_, i) => { const t = i / 6; return [x, top - 0.05 + (deck + 0.05 - (top - 0.05)) * t - 0.15 * Math.sin(Math.PI * t), dir * (span + (end - span) * t)] as V3; }), 0.6, 0.75);
    for (let z = -span + 0.2; z < span - 0.1; z += 0.2) pen([x, cable(z), z], [x * 0.9, deck, z], 0.8 + 0.12 * Math.abs(z / span));
  }
};

/** Viaduto de Millau: sete pilares altíssimos, o tabuleiro em curva suave e os mastros com os estais em leque. */
const millau: Shape = (pen) => {
  const deck = 2.7;
  const top = 3.7;
  const half = 4.3;
  const bend = (z: number) => 0.12 * (z / 4.2) ** 2;
  for (const x of [-0.16, 0.16]) polyline(pen, Array.from({ length: 29 }, (_, i) => { const z = -half + (2 * half * i) / 28; return [x + bend(z), deck, z] as V3; }), 0.4, 0.6);
  polyline(pen, Array.from({ length: 29 }, (_, i) => { const z = -half + (2 * half * i) / 28; return [bend(z), deck - 0.08, z] as V3; }), 0.42, 0.62);
  for (let i = 0; i < 7; i++) {
    const z = (i - 3) * 1.2;
    const o = Math.abs(i - 3) / 3;
    const depth = (y: number) => 0.11 - 0.05 * (y / deck);
    const split = 0.62 * deck;
    for (const x of [-0.1, 0.1]) {
      const px = x + bend(z);
      pen([px, 0, z - depth(0)], [px, deck, z - depth(deck)], 0.05 + 0.1 * o);
      pen([px, 0, z + depth(0)], [px, deck, z + depth(deck)], 0.05 + 0.1 * o);
      pen([px, split, z - 0.02], [px, deck, z - 0.02], 0.25 + 0.1 * o); // o pilar se divide em dois no terço de cima
      pen([px, split, z + 0.02], [px, deck, z + 0.02], 0.25 + 0.1 * o);
      pen([px, 0, z - depth(0)], [px, 0, z + depth(0)], 0.02);
    }
    const mx = bend(z);
    pen([mx, deck, z - 0.1], [mx, top, z], 0.62 + 0.06 * o);
    pen([mx, deck, z + 0.1], [mx, top, z], 0.62 + 0.06 * o);
    for (let k = 0; k <= 10; k++) {
      const y = deck + 0.35 + ((top - deck - 0.4) * k) / 10;
      const reachZ = 0.08 + (0.5 * k) / 10;
      pen([mx, y, z], [mx, deck, z - reachZ], 0.72 + 0.022 * k);
      pen([mx, y, z], [mx, deck, z + reachZ], 0.72 + 0.022 * k);
    }
  }
};

/** A base de lançamento do Saturn V: plataforma, torre umbilical treliçada e os braços que seguram o foguete. */
const launchPad: Shape = (pen) => {
  box(pen, [-0.45, 0, -0.45], [0.45, 0.12, 0.45], 0, 0.1);
  const tx = 0.42;
  const w = 0.11;
  const H = 3.1;
  const floors = 14;
  const ring = (y: number): V3[] => [[tx - w, y, -w], [tx + w, y, -w], [tx + w, y, w], [tx - w, y, w]];
  ring(0.12).forEach((p, i) => pen(p, ring(H)[i], 0.15));
  for (let k = 0; k <= floors; k++) {
    const y = 0.12 + ((H - 0.12) * k) / floors;
    polyline(pen, ring(y), 0.2 + (0.6 * k) / floors, 0.2 + (0.6 * k) / floors, true);
    if (k < floors) {
      const y1 = 0.12 + ((H - 0.12) * (k + 1)) / floors;
      pen([tx - w, y, -w], [tx - w, y1, w], 0.22 + (0.6 * k) / floors);
    }
  }
  for (const y of [1.25, 2.05, 2.55]) {
    pen([tx - w, y, -0.04], [0.16, y, -0.04], 0.85);
    pen([tx - w, y, 0.04], [0.16, y, 0.04], 0.85);
  }
};

// ── Forma ────────────────────────────────────────────────────────────────────

/** Calota de revolução: meridianos e paralelos (`concave`: tigela virada para cima). */
function bowl(pen: Pen, cx: number, y0: number, cz: number, profile: (t: number) => [number, number], meridians: number, steps: number, rings: number[], order0: number, order1: number) {
  for (let m = 0; m < meridians; m++) {
    const a = (m / meridians) * Math.PI * 2;
    polyline(pen, Array.from({ length: steps + 1 }, (_, j) => { const [r, y] = profile(j / steps); return [cx + Math.cos(a) * r, y0 + y, cz + Math.sin(a) * r] as V3; }), order0, order1);
  }
  rings.forEach((t) => { const [r, y] = profile(t); polyline(pen, ellipse(cx, y0 + y, cz, r, r, 18), order0 + (order1 - order0) * t, order0 + (order1 - order0) * t, true); });
}

/** Taj Mahal: a plataforma, o mausoléu de cantos chanfrados com os iwans, a cúpula em cebola, os chhatris e os quatro minaretes. */
const taj: Shape = (pen) => {
  box(pen, [-0.8, 0, -0.8], [0.8, 0.12, 0.8], 0, 0.08);
  const s = 0.42;
  const c = 0.12;
  const octagon = (y: number): V3[] => [[-s + c, y, -s], [s - c, y, -s], [s, y, -s + c], [s, y, s - c], [s - c, y, s], [-s + c, y, s], [-s, y, s - c], [-s, y, -s + c]];
  octagon(0.12).forEach((p, i) => pen(p, octagon(0.72)[i], 0.15));
  polyline(pen, octagon(0.12), 0.1, 0.1, true);
  polyline(pen, octagon(0.72), 0.3, 0.3, true);
  // Os iwans: um arco ogival grande no meio de cada face.
  const faces: [V3, V3][] = [[[1, 0, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0]], [[0, 0, -1], [1, 0, 0]]];
  for (const [n, t] of faces)
    polyline(pen, Array.from({ length: 9 }, (_, i): V3 => {
      const u = -1 + (2 * i) / 8;
      const y = 0.12 + (Math.abs(u) > 0.999 ? 0 : 0.36 + 0.16 * Math.pow(1 - Math.abs(u), 0.6));
      return [n[0] * s + t[0] * u * 0.16, i === 0 || i === 8 ? 0.12 : y, n[2] * s + t[2] * u * 0.16];
    }), 0.3, 0.4);
  // A cúpula em cebola sobre o tambor, com o pináculo.
  lathe(pen, [[0.2, 0.72], [0.2, 0.84], [0.27, 0.95], [0.29, 1.05], [0.24, 1.16], [0.12, 1.25], [0.03, 1.32], [0.0, 1.42]], 0, 0, 10, 0.4, 0.8);
  for (const [x, z] of [[-0.27, -0.27], [0.27, -0.27], [0.27, 0.27], [-0.27, 0.27]])
    lathe(pen, [[0.07, 0.72], [0.07, 0.8], [0.08, 0.85], [0.04, 0.92], [0, 0.96]], x, z, 6, 0.6, 0.75);
  for (const [x, z] of [[-0.75, -0.75], [0.75, -0.75], [0.75, 0.75], [-0.75, 0.75]]) {
    lathe(pen, [[0.05, 0.12], [0.045, 0.45], [0.04, 0.78], [0.035, 1.1]], x, z, 6, 0.2, 0.6);
    for (const y of [0.45, 0.78, 1.1]) polyline(pen, ellipse(x, y, z, 0.075, 0.075, 8), 0.4 + y * 0.2, 0.4 + y * 0.2, true);
    lathe(pen, [[0.06, 1.1], [0.06, 1.16], [0.03, 1.21], [0, 1.25]], x, z, 6, 0.85, 0.92);
  }
};

/** Atomium: nove esferas (os átomos de um cristal de ferro, cubo de corpo centrado) de pé sobre um vértice, os tubos e o tripé. */
const atomium: Shape = (pen) => {
  const a = 0.55;
  const center: V3 = [0, 1.2, 0];
  // Cubo girado para a diagonal principal ficar vertical: (1,1,1) → (0,1,0).
  const axis = [1 / Math.sqrt(2), 0, -1 / Math.sqrt(2)];
  const angle = Math.acos(1 / Math.sqrt(3));
  const turn = ([x, y, z]: V3): V3 => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const dot = axis[0] * x + axis[1] * y + axis[2] * z;
    const cross = [axis[1] * z - axis[2] * y, axis[2] * x - axis[0] * z, axis[0] * y - axis[1] * x];
    return [x * c + cross[0] * s + axis[0] * dot * (1 - c), y * c + cross[1] * s + axis[1] * dot * (1 - c), z * c + cross[2] * s + axis[2] * dot * (1 - c)];
  };
  const place = (p: V3): V3 => { const q = turn(p); return [center[0] + q[0], center[1] + q[1], center[2] + q[2]]; };
  const corners: V3[] = [];
  for (const x of [-a, a]) for (const y of [-a, a]) for (const z of [-a, a]) corners.push([x, y, z]);
  const atoms = [...corners.map(place), center];
  const order = (p: V3) => 0.15 + 0.6 * ((p[1] - 0.2) / 2);
  for (const p of atoms) {
    const r = 0.16;
    for (let g = 0; g < 3; g++)
      polyline(pen, Array.from({ length: 12 }, (_, i): V3 => {
        const t = (i / 12) * Math.PI * 2;
        const u = Math.cos(t) * r;
        const v = Math.sin(t) * r;
        return g === 0 ? [p[0] + u, p[1] + v, p[2]] : g === 1 ? [p[0], p[1] + u, p[2] + v] : [p[0] + u, p[1], p[2] + v];
      }), order(p), order(p), true);
  }
  // Os tubos: as 12 arestas do cubo e as 8 diagonais até o centro.
  for (let i = 0; i < 8; i++) {
    for (let j = i + 1; j < 8; j++) {
      const d = corners[i].reduce((sum, v, k) => sum + (v !== corners[j][k] ? 1 : 0), 0);
      if (d === 1) pen(atoms[i], atoms[j], Math.min(order(atoms[i]), order(atoms[j])) + 0.1);
    }
    pen(atoms[i], center, order(atoms[i]) + 0.12);
  }
  // O tripé que sustenta o átomo de baixo.
  const bottom = atoms.reduce((low, p) => (p[1] < low[1] ? p : low));
  for (let k = 0; k < 3; k++) {
    const t = (k / 3) * Math.PI * 2;
    pen([bottom[0] + Math.cos(t) * 0.45, 0, bottom[2] + Math.sin(t) * 0.45], bottom, 0.05);
  }
};

/** Pirâmide do Louvre: a malha de losangos de vidro de I. M. Pei nas quatro faces e as três pirâmides menores. */
const louvre: Shape = (pen) => {
  const pyramidOf = (cx: number, cz: number, b: number, h: number, grid: number, order0: number) => {
    const apex: V3 = [cx, h, cz];
    const base: V3[] = [[cx - b, 0, cz - b], [cx + b, 0, cz - b], [cx + b, 0, cz + b], [cx - b, 0, cz + b]];
    polyline(pen, base, order0, order0, true);
    base.forEach((p) => pen(p, apex, order0 + 0.15));
    // Em cada face, duas famílias de linhas paralelas às arestas: losangos.
    for (let f = 0; f < 4; f++) {
      const A = base[f];
      const B = base[(f + 1) % 4];
      for (let k = 1; k < grid; k++) {
        const t = k / grid;
        const onBase: V3 = [A[0] + (B[0] - A[0]) * t, 0, A[2] + (B[2] - A[2]) * t];
        const towardB: V3 = [B[0] + (apex[0] - B[0]) * (1 - t), B[1] + (apex[1] - B[1]) * (1 - t), B[2] + (apex[2] - B[2]) * (1 - t)];
        const towardA: V3 = [A[0] + (apex[0] - A[0]) * t, A[1] + (apex[1] - A[1]) * t, A[2] + (apex[2] - A[2]) * t];
        pen(onBase, towardB, order0 + 0.2 + 0.3 * t);
        pen(onBase, towardA, order0 + 0.2 + 0.3 * (1 - t));
      }
    }
  };
  pyramidOf(0, 0, 0.6, 0.75, 9, 0);
  pyramidOf(-0.05, 1.05, 0.2, 0.25, 3, 0.55);
  pyramidOf(0.9, 0.1, 0.2, 0.25, 3, 0.6);
  pyramidOf(-0.05, -1.05, 0.2, 0.25, 3, 0.65);
};

/** Congresso Nacional: a esplanada, a cúpula do Senado, a tigela da Câmara e as torres gêmeas em H. */
const congress: Shape = (pen) => {
  box(pen, [-0.45, 0, -1.5], [0.45, 0.22, 1.5], 0, 0.12);
  const r = 0.42;
  bowl(pen, 0, 0.22, -0.75, (t) => [r * Math.cos((t * Math.PI) / 2), r * Math.sin((t * Math.PI) / 2) * 0.85], 10, 5, [0, 0.4, 0.75], 0.2, 0.55);
  bowl(pen, 0, 0.22, 0.75, (t) => [0.16 + 0.46 * Math.pow(t, 0.55), 0.3 * t], 12, 4, [0.33, 0.66, 1], 0.25, 0.6);
  for (const zc of [-0.13, 0.13]) {
    const ring = (y: number): V3[] => [[0.72, y, zc - 0.07], [1.08, y, zc - 0.07], [1.08, y, zc + 0.07], [0.72, y, zc + 0.07]];
    ring(0).forEach((p, i) => pen(p, ring(2.6)[i], 0.15));
    for (let k = 0; k <= 13; k++) polyline(pen, ring((2.6 * k) / 13), 0.15 + (0.7 * k) / 13, 0.15 + (0.7 * k) / 13, true);
  }
  // A passarela que faz o H.
  for (const y of [1.2, 1.5]) polyline(pen, [[0.72, y, -0.06], [1.08, y, -0.06], [1.08, y, 0.06], [0.72, y, 0.06]], 0.5, 0.5, true);
};

/** Catedral de Brasília: 16 pilares curvos (bumerangues) que se tocam na cintura — um hiperboloide de linhas — e o campanário. */
const cathedral: Shape = (pen) => {
  const N = 16;
  const H = 1.5;
  const R0 = 0.72;
  const waist = 0.34;
  const uw = 0.58;
  const Rt = 0.66;
  const radius = (u: number) => (u < uw ? waist + (R0 - waist) * Math.pow((uw - u) / uw, 1.6) : waist + (Rt - waist) * Math.pow((u - uw) / (1 - uw), 1.3));
  const width = (u: number) => 0.05 + 0.05 * Math.abs(u - uw) / uw;
  for (let i = 0; i < N; i++) {
    const theta = (i / N) * Math.PI * 2;
    for (const side of [-1, 1])
      polyline(pen, Array.from({ length: 11 }, (_, k) => {
        const u = k / 10;
        const r = radius(u);
        const a = theta + (side * width(u)) / r;
        return [Math.cos(a) * r, u * H, Math.sin(a) * r] as V3;
      }), 0.02 * (i / N), 0.82 + 0.02 * (i / N));
  }
  polyline(pen, ellipse(0, 0, 0, R0, R0, 32), 0, 0.05, true);
  polyline(pen, ellipse(0, uw * H, 0, waist, waist, 32), 0.55, 0.6, true);
  // O campanário: dois montantes, a travessa, a cruz e os quatro sinos.
  const bx = 1.05;
  const bz = -0.6;
  for (const dz of [-0.06, 0.06]) pen([bx, 0, bz + dz], [bx, 1.1, bz + dz], 0.3);
  pen([bx, 1.1, bz - 0.06], [bx, 1.1, bz + 0.06], 0.45);
  pen([bx, 1.1, bz], [bx, 1.24, bz], 0.5);
  pen([bx, 1.2, bz - 0.04], [bx, 1.2, bz + 0.04], 0.5);
  for (const y of [0.72, 0.8, 0.88, 0.96]) polyline(pen, ellipse(bx, y, bz, 0.035, 0.035, 6), 0.4 + y * 0.1, 0.4 + y * 0.1, true);
};

/** Ópera de Sydney: o pódio com a escadaria e duas fileiras de conchas — bocas voltadas para quem chega, nervuras nas costas. */
const opera: Shape = (pen) => {
  box(pen, [-0.75, 0, -1.35], [0.75, 0.25, 1.35], 0, 0.1);
  for (let k = 1; k <= 4; k++) pen([-0.45, 0.25 - 0.06 * k, 1.35 + 0.07 * k], [0.45, 0.25 - 0.06 * k, 1.35 + 0.07 * k], 0.08);
  const halls: [number, number][] = [[-0.32, 1], [0.38, 0.88]];
  halls.forEach(([x, scale], hall) =>
    [1.05, 0.95, 0.8, 0.55].forEach((height, i) => {
      const h = height * scale;
      const w = (0.56 - i * 0.06) * scale;
      const zb = 0.95 - i * 0.55;
      const lean = 0.35 * h;
      const y0 = 0.25;
      const left: V3 = [x - w / 2, y0, zb];
      const right: V3 = [x + w / 2, y0, zb];
      const peak: V3 = [x, y0 + h, zb - lean];
      const o = 0.2 + 0.15 * i + 0.05 * hall;
      const mouthL = quadratic(left, [x - w * 0.18, y0 + h * 0.75, zb + 0.05], peak, 8);
      const mouthR = quadratic(right, [x + w * 0.18, y0 + h * 0.75, zb + 0.05], peak, 8);
      polyline(pen, mouthL, o, o + 0.25);
      polyline(pen, mouthR, o, o + 0.25);
      const spine = quadratic(peak, [x, y0 + h * 0.7, zb - lean - 0.3], [x, y0, zb - lean - 0.42], 8);
      polyline(pen, spine, o + 0.25, o + 0.4);
      // As nervuras: arcos por cima das costas, da boca esquerda à direita, passando pela espinha.
      for (const t of [0.3, 0.55, 0.8]) {
        const l = mouthL[Math.round(t * 8)];
        const r = mouthR[Math.round(t * 8)];
        const s = spine[Math.round((1 - t) * 8 * 0.6)];
        const control: V3 = [2 * s[0] - (l[0] + r[0]) / 2, 2 * s[1] - (l[1] + r[1]) / 2, 2 * s[2] - (l[2] + r[2]) / 2];
        polyline(pen, quadratic(l, control, r, 6), o + 0.3 + t * 0.1);
      }
    }),
  );
};

/** Burj Khalifa: planta em Y de três asas que recuam em espiral, andar a andar, até o núcleo e a agulha. */
const burj: Shape = (pen) => {
  const H = 3.95;
  const body = 0.8 * H;
  const LEVELS = 18;
  const L0 = 0.46;
  const W = 0.17;
  const notch = W / Math.sqrt(3);
  const wings = [0, 1, 2].map((i) => Math.PI + (i * Math.PI * 2) / 3);
  const arm = (i: number, k: number) => Math.max(0.11, L0 * (1 - Math.floor((k + i) / 3) * (3 / LEVELS) * 0.95));
  const plan = (k: number): V3[] => {
    const y = (body * k) / LEVELS;
    const points: V3[] = [];
    wings.forEach((theta, i) => {
      const d = [Math.cos(theta), Math.sin(theta)];
      const n = [-d[1], d[0]];
      const L = arm(i, k);
      points.push([d[0] * L - (n[0] * W) / 2, y, d[1] * L - (n[1] * W) / 2]);
      points.push([d[0] * L + (n[0] * W) / 2, y, d[1] * L + (n[1] * W) / 2]);
      const bisector = theta + Math.PI / 3;
      points.push([Math.cos(bisector) * notch, y, Math.sin(bisector) * notch]);
    });
    return points;
  };
  for (let k = 0; k <= LEVELS; k++) {
    const ring = plan(k);
    polyline(pen, ring, (0.85 * k) / LEVELS, (0.85 * k) / LEVELS, true);
    if (k < LEVELS) {
      const next = plan(k + 1);
      ring.forEach((p, j) => pen(p, next[j], (0.85 * k) / LEVELS + 0.02));
    }
  }
  lathe(pen, [[0.1, body], [0.07, 0.86 * H], [0.03, 0.93 * H]], 0, 0, 6, 0.86, 0.94);
  pen([0, 0.93 * H, 0], [0, H, 0], 0.97);
};

// ── Apoio dos veículos ───────────────────────────────────────────────────────

/** Os trilhos do trem-bala, no chão do corredor (lado direito), com dormentes. */
const RAIL_HALF = 18.5;
const rails: Shape = (pen) => {
  const half = RAIL_HALF;
  for (const x of [-0.14, 0.14]) polyline(pen, subdivide([x, 0.004, -half], [x, 0.004, half], 40), 0.1, 0.9);
  for (let z = -half; z <= half; z += 0.6) pen([-0.2, 0.003, z], [0.2, 0.003, z], 0.1 + 0.8 * ((half - z) / (2 * half)));
};

// ── A linha do tempo ─────────────────────────────────────────────────────────

/** Progressos de passagem dos veículos (a cena e os apoios estáticos combinam com eles). */
export const VEHICLE_AT = { bis: 0.53, saturn: 0.7, iss: 0.64, concorde: 0.68, shinkansen: 0.78 } as const;

/**
 * Espaçamento: cada obra fica pronta ~5 unidades antes de a câmera chegar a
 * ela (ver landmarkWindow), com tempo para o nome aparecer. A primeira fica a
 * 13 unidades do começo — mais perto, ela se montaria com você já passando.
 */
export const LANDMARKS: readonly Landmark[] = [
  // Estrutura, de c. 3000 a.C. a 2004.
  { id: 'stonehenge', side: -1, at: 0.14, offset: 2.9, reach: 1.5, shape: stonehenge, label: { id: 'stonehenge', anchor: [-0.9, 1.2, 1.0] } },
  { id: 'pyramid', side: -1, at: 0.22, offset: 2.95, reach: 1.2, shape: pyramid, label: { id: 'pyramid', anchor: [-0.9, 1.25, 0.9] } },
  { id: 'parthenon', side: -1, at: 0.3, offset: 2.7, reach: 1.3, shape: parthenon, label: { id: 'parthenon', anchor: [-0.8, 1.3, 1.0] } },
  { id: 'colosseum', side: -1, at: 0.37, offset: 2.85, reach: 1.55, shape: colosseum, label: { id: 'colosseum', anchor: [-0.7, 1.45, 1.2] } },
  { id: 'pisa', side: -1, at: 0.44, offset: 2.4, reach: 0.4, shape: pisa, label: { id: 'pisa', anchor: [-0.75, 1.3, 0.3] } },
  { id: 'eiffel', side: -1, at: 0.51, offset: 2.6, reach: 0.8, shape: eiffel, label: { id: 'eiffel', anchor: [-0.8, 1.25, 0.6] } },
  { id: 'goldengate', side: -1, at: 0.6, offset: 3.3, reach: 3.1, shape: goldenGate, label: { id: 'goldengate', anchor: [-0.9, 1.35, 2.4] } },
  { id: 'launchpad', side: -1, at: VEHICLE_AT.saturn, offset: 3.4, reach: 0.6, shape: launchPad },
  { id: 'millau', side: -1, at: 0.86, offset: 3.5, reach: 4.3, shape: millau, label: { id: 'millau', anchor: [-0.9, 1.3, 3.2] } },
  // Forma, de 1653 a 2010.
  { id: 'taj', side: 1, at: 0.18, offset: 2.9, reach: 0.85, shape: taj, label: { id: 'taj', anchor: [-0.85, 1.3, 0.8] } },
  { id: 'atomium', side: 1, at: 0.33, offset: 2.7, reach: 0.9, shape: atomium, label: { id: 'atomium', anchor: [-0.85, 1.2, 0.7] } },
  { id: 'congress', side: 1, at: 0.47, offset: 3.0, reach: 1.5, shape: congress, label: { id: 'congress', anchor: [-0.8, 1.2, 1.2] } },
  { id: 'cathedral', side: 1, at: 0.55, offset: 2.9, reach: 0.9, shape: cathedral, label: { id: 'cathedral', anchor: [-0.85, 1.25, 0.7] } },
  { id: 'opera', side: 1, at: 0.64, offset: 3.2, reach: 1.6, shape: opera, label: { id: 'opera', anchor: [-0.9, 1.35, 1.4] } },
  { id: 'louvre', side: 1, at: 0.74, offset: 2.8, reach: 1.2, shape: louvre, label: { id: 'louvre', anchor: [-0.85, 1.15, 1.0] } },
  { id: 'burj', side: 1, at: 0.82, offset: 3.0, reach: 0.5, shape: burj, label: { id: 'burj', anchor: [-0.75, 1.3, 0.4] } },
  // Os trilhos acompanham o percurso do trem-bala (de 26 à frente a 8 atrás da câmera no gatilho).
  { id: 'rails', side: 1, at: VEHICLE_AT.shinkansen + span(9), offset: 0.86, reach: RAIL_HALF, shape: rails, clears: false, follows: true },
];

/** Centro (z) da peça no mundo. */
export const landmarkZ = (landmark: Landmark) => cameraZ(landmark.at);

/** Janela de construção da peça inteira: começa quando a ponta mais próxima entra no alcance da construção. */
export function landmarkWindow(landmark: Landmark): [number, number] {
  const dur = span(4.8 + Math.min(landmark.reach, 4) * 0.5);
  const start = Math.max(0.004, reachAt(landmarkZ(landmark) + landmark.reach) - BUILD.lookahead - span(0.3));
  return [Math.min(start, 0.975 - dur), dur];
}

/** Local → mundo. */
export function landmarkToWorld(landmark: Landmark, [lx, ly, lz]: V3): V3 {
  return [landmark.side * (landmark.offset + lx), TUNNEL.floor + ly, landmarkZ(landmark) + lz];
}

/** O monumento (ou apoio) ocupa este trecho do seu lado? (a cidade genérica abre clareira) */
export function inLandmarkZone(side: number, z: number, margin = 1.1) {
  return LANDMARKS.some((l) => l.side === side && l.clears !== false && Math.abs(z - landmarkZ(l)) < l.reach + margin);
}
