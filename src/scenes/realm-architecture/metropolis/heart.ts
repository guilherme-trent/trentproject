import { mulberry32 } from '@/engine/lib/random';
import { CORE_CENTER } from './city';
import { TUNNEL } from './config';
import { ellipse, polyline, quadratic, subdivide as subdivideLine, type V3 } from './lineart';

/**
 * O CORAÇÃO — o fim da jornada. Uma tecnologia viva, feita do mesmo traço de
 * luz da cidade, que pulsa (sístole e diástole, o "tum-tum") e chama quem se
 * aproxima: a cidade esquenta de cor, as linhas pulsam no ritmo dele e o
 * batimento acelera conforme você chega.
 *
 * Camadas (aHeart.x), de dentro para fora:
 *   0 SEMENTE  raios de luz no centro, que se estendem a cada batida;
 *   1 REDE     conexões entre três cascas de pontos — por onde a onda de cada
 *              batida se propaga de dentro para fora;
 *   2, 3 FIBRAS  hélices sobre a superfície, em duas camadas de sentidos
 *              opostos. É anatomia: o músculo cardíaco é uma faixa enrolada em
 *              hélice, e o coração não só aperta — ele TORCE, como quem
 *              espreme um pano. Aqui também;
 *   4 ÓRBITAS  anéis lentos em volta: a parte de máquina;
 *   5 VASOS    nascem nas paredes do túnel e levam luz até ele — a cidade
 *              inteira o alimenta;
 *   6 GRANDES VASOS  o arco da aorta, o tronco pulmonar e a veia cava, no topo.
 *
 * A silhueta é anatômica sem ser caricata: ápice afinado e inclinado (o
 * coração aponta para baixo e para o lado), topo arredondado, os grandes
 * vasos saindo por cima. A inclinação (TILT) é aplicada no shader, depois da
 * contração — o coração bate no próprio eixo.
 *
 * aHeart: x camada · y parâmetro da camada (altura nas fibras, raio na rede,
 * distância ao coração nos vasos) · z semente · w vez na montagem (0 primeiro).
 * Posições locais, em torno de CORE_CENTER. Tudo animado no vertex shader.
 */

export const HEART_LAYER = { seed: 0, lattice: 1, outer: 2, inner: 3, orbit: 4, vessel: 5, great: 6 } as const;

/** O eixo do coração: o ápice aponta para baixo e para a direita de quem chega, levemente para frente. */
const TILT = { roll: 0.38, pitch: 0.15 } as const;
const tiltPoint = ([x, y, z]: V3): V3 => {
  const cr = Math.cos(TILT.roll);
  const sr = Math.sin(TILT.roll);
  const x1 = x * cr - y * sr;
  const y1 = x * sr + y * cr;
  const cp = Math.cos(TILT.pitch);
  const sp = Math.sin(TILT.pitch);
  return [x1, y1 * cp - z * sp, y1 * sp + z * cp];
};
/** A mesma inclinação para o shader (mat3, por colunas). */
export const HEART_TILT: number[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].flatMap((axis) => tiltPoint(axis as V3));

/** Raios do corpo (elipsoide de ápice afinado). */
const BODY = { x: 1.15, y: 1.3, z: 1.1 } as const;

export interface HeartGeometry {
  position: Float32Array;
  heart: Float32Array;
  count: number;
}

export function createHeartGeometry(): HeartGeometry {
  const rng = mulberry32(0x4ea7);
  const position: number[] = [];
  const heart: number[] = [];
  const seg = (a: V3, b: V3, layer: number, pa: number, pb: number, seed: number, order: number) => {
    position.push(...a, ...b);
    heart.push(layer, pa, seed, order, layer, pb, seed, order);
  };

  // ── Semente ──
  for (let i = 0; i < 160; i++) {
    const z = rng() * 2 - 1;
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    const dir: V3 = [r * Math.cos(a), z, r * Math.sin(a)];
    const inner = 0.05;
    const outer = 0.2 + rng() * 0.14;
    seg([dir[0] * inner, dir[1] * inner, dir[2] * inner], [dir[0] * outer, dir[1] * outer, dir[2] * outer], HEART_LAYER.seed, 0, 1, rng(), rng() * 0.08);
  }

  // ── Rede: três cascas (pontos de Fibonacci), cada ponto ligado aos 2 mais próximos da casca de fora ──
  const shells = [0.34, 0.6, 0.86].map((k, s) => {
    const n = [48, 110, 190][s];
    return Array.from({ length: n }, (_, i): V3 => {
      const y = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.399963 + s;
      return [Math.cos(a) * r * BODY.x * 0.78 * k, y * BODY.y * 0.78 * k, Math.sin(a) * r * BODY.z * 0.78 * k];
    });
  });
  const radiusOf = (s: number) => [0.34, 0.6, 0.86][s];
  shells[0].forEach((p) => seg([0, 0, 0], p, HEART_LAYER.lattice, 0, radiusOf(0), rng(), 0.1 + rng() * 0.05));
  for (let s = 0; s < shells.length - 1; s++)
    shells[s].forEach((p) => {
      const nearest = shells[s + 1]
        .map((q) => [q, (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2] as const)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 2);
      for (const [q] of nearest) seg(p, q, HEART_LAYER.lattice, radiusOf(s), radiusOf(s + 1), rng(), 0.14 + 0.1 * s + rng() * 0.05);
    });
  // Conexões laterais na casca do meio: a rede não é só radial.
  shells[1].forEach((p, i) => { if (i % 2 === 0) seg(p, shells[1][(i + 7) % shells[1].length], HEART_LAYER.lattice, radiusOf(1), radiusOf(1), rng(), 0.24); });

  // ── Fibras: hélices sobre o corpo, do ápice (embaixo) à base (em cima) ──
  // Perfil: cone arredondado que afina até o ápice, cúpula no topo; os átrios insinuam dois lóbulos.
  const surface = (u: number, theta: number, scale: number): V3 => {
    const r = u < 0.72 ? Math.pow(Math.sin((Math.PI / 2) * (u / 0.72)), 0.75) : Math.pow(Math.max(0, Math.cos((Math.PI / 2) * ((u - 0.72) / 0.28))), 0.55);
    const lobes = 1 + 0.12 * Math.sin(2 * theta) * u * u;
    return [Math.cos(theta) * BODY.x * r * lobes * scale, (2 * u - 1) * BODY.y * scale, Math.sin(theta) * BODY.z * r * scale];
  };
  const fibers = (layer: number, strands: number, turns: number, scale: number) => {
    const SAMPLES = 26;
    for (let f = 0; f < strands; f++) {
      const theta0 = (f / strands) * Math.PI * 2;
      const seed = rng();
      for (let k = 0; k < SAMPLES; k++) {
        const u0 = 0.03 + (0.94 * k) / SAMPLES;
        const u1 = 0.03 + (0.94 * (k + 1)) / SAMPLES;
        seg(surface(u0, theta0 + turns * Math.PI * 2 * u0, scale), surface(u1, theta0 + turns * Math.PI * 2 * u1, scale), layer, u0, u1, seed, 0.35 + 0.45 * u0);
      }
    }
  };
  fibers(HEART_LAYER.outer, 40, 1.2, 1);
  fibers(HEART_LAYER.inner, 30, -0.9, 0.8);

  // ── Grandes vasos: tubos (6 linhas em volta da linha central + anéis) ──
  const tube = (centerline: V3[], radius: number, order0: number) => {
    const n = centerline.length;
    for (let k = 0; k < n; k++) {
      const a = centerline[Math.max(0, k - 1)];
      const b = centerline[Math.min(n - 1, k + 1)];
      const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const tl = Math.hypot(...t) || 1;
      const T = t.map((v) => v / tl);
      const ref = Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const N = [T[1] * ref[2] - T[2] * ref[1], T[2] * ref[0] - T[0] * ref[2], T[0] * ref[1] - T[1] * ref[0]];
      const nl = Math.hypot(...N) || 1;
      const Nn = N.map((v) => v / nl);
      const B = [T[1] * Nn[2] - T[2] * Nn[1], T[2] * Nn[0] - T[0] * Nn[2], T[0] * Nn[1] - T[1] * Nn[0]];
      const ring = Array.from({ length: 6 }, (_, i): V3 => {
        const ang = (i / 6) * Math.PI * 2;
        return [0, 1, 2].map((d) => centerline[k][d] + (Nn[d] * Math.cos(ang) + B[d] * Math.sin(ang)) * radius) as V3;
      });
      const order = order0 + (0.12 * k) / n;
      if (k % 3 === 0 || k === n - 1) polyline((p, q) => seg(p, q, HEART_LAYER.great, k / n, k / n, 0, order), ring, 0, 0, true);
      if (k < n - 1) {
        const next = centerline[k + 1];
        // Cada linha do tubo segue a sua posição no anel até o próximo ponto da linha central.
        ring.forEach((p) => seg(p, [0, 1, 2].map((d) => next[d] + p[d] - centerline[k][d]) as V3, HEART_LAYER.great, k / n, (k + 1) / n, 0, order));
      }
    }
  };
  const top = BODY.y;
  // O arco da aorta: sobe do topo e se curva para trás e para a esquerda.
  tube(quadratic([0.05, top * 0.8, 0.1], [0, top + 0.75, 0.05], [-0.7, top + 0.05, -0.5], 14), 0.17, 0.72);
  // O tronco pulmonar: sobe para a frente e se divide em dois.
  tube(quadratic([0.3, top * 0.72, 0.38], [0.35, top + 0.3, 0.5], [0.0, top + 0.38, 0.55], 8), 0.14, 0.74);
  for (const side of [-1, 1]) tube(quadratic([0.0, top + 0.38, 0.55], [side * 0.3, top + 0.48, 0.5], [side * 0.7, top + 0.28, 0.35], 8), 0.09, 0.8);
  // A veia cava superior: reta, do átrio direito para cima.
  tube(subdivideLine([-0.45, top * 0.7, 0.12], [-0.5, top + 0.55, 0.08], 8), 0.12, 0.76);

  // ── Órbitas ──
  [[2.1, 0.5, 0.2], [2.45, -0.35, 1.1], [2.8, 0.15, 2.2]].forEach(([r, tilt, spin], i) => {
    const ring = ellipse(0, 0, 0, r, r, 96).map(([x, , z]): V3 => {
      const y = z * Math.sin(tilt);
      const zz = z * Math.cos(tilt);
      return [x * Math.cos(spin) - zz * Math.sin(spin), y, x * Math.sin(spin) + zz * Math.cos(spin)];
    });
    polyline((a, b) => seg(a, b, HEART_LAYER.orbit, 0, 0, i / 3, 0.82 + 0.04 * i), ring, 0, 0, true);
  });

  // ── Vasos: das paredes do túnel (atrás de quem chega) até o topo do coração ──
  const F = TUNNEL.floor - CORE_CENTER[1];
  const C = TUNNEL.ceiling - CORE_CENTER[1];
  const ends: V3[] = [[-4.6, F + 0.05, 9], [4.6, F + 0.05, 10.5], [-4.2, C - 0.05, 12], [4.2, C - 0.05, 8], [-6, 0.3, 14], [6, -0.2, 13], [-2.6, F + 0.05, 16], [2.6, C - 0.05, 15]];
  ends.forEach((end, i) => {
    const theta = Math.atan2(end[2], end[0]);
    const start = tiltPoint(surface(0.82, theta, 1)); // os vasos não giram com o coração no shader: já saem inclinados
    const control: V3 = [end[0] * 0.55, end[1] * 0.4 + 1.4, end[2] * 0.35];
    const points = quadratic(start, control, end, 30);
    for (let k = 0; k < 30; k++) seg(points[k], points[k + 1], HEART_LAYER.vessel, k / 30, (k + 1) / 30, i / 8, 0.02 + 0.33 * (1 - k / 30));
  });

  return { position: new Float32Array(position), heart: new Float32Array(heart), count: position.length / 3 };
}
