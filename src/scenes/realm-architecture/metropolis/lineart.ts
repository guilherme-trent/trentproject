/**
 * Desenho técnico em LINHAS — as primitivas com que monumentos e veículos
 * são modelados à mão, em código (nenhum arquivo 3D é baixado).
 *
 * Tudo passa por uma `Pen`: recebe um segmento e a sua VEZ na montagem
 * (`order`, 0 = primeiro a nascer … 1 = último). Os monumentos traduzem a vez
 * numa janela de construção (a peça se desenha conforme a câmera se
 * aproxima); os veículos ignoram (nascem inteiros).
 */

export type V3 = [number, number, number];
export type Pen = (a: V3, b: V3, order: number) => void;

export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** `n` pedaços iguais de a até b (n + 1 pontos). */
export const subdivide = (a: V3, b: V3, n: number): V3[] => Array.from({ length: n + 1 }, (_, i) => lerp3(a, b, i / n));

/** Bézier quadrática a → c → b em `n` pedaços. */
export const quadratic = (a: V3, c: V3, b: V3, n: number): V3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const s = 1 - t;
    return [0, 1, 2].map((k) => s * s * a[k] + 2 * s * t * c[k] + t * t * b[k]) as V3;
  });

/** Liga os pontos em sequência; a vez cresce de `order0` a `order1` ao longo da linha. */
export function polyline(pen: Pen, points: V3[], order0 = 0, order1 = order0, closed = false) {
  const n = points.length - (closed ? 0 : 1);
  for (let i = 0; i < n; i++) pen(points[i], points[(i + 1) % points.length], order0 + ((order1 - order0) * i) / Math.max(1, n));
}

/** Contorno de elipse no plano horizontal (raios rx em x, rz em z), entre os ângulos `from` e `to`. */
export function ellipse(cx: number, y: number, cz: number, rx: number, rz: number, n: number, from = 0, to = Math.PI * 2): V3[] {
  const closed = Math.abs(to - from - Math.PI * 2) < 1e-6;
  return Array.from({ length: closed ? n : n + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / n;
    return [cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz];
  });
}

/**
 * Sólido de revolução em torno do eixo Y por (cx, cz): `profile` são pares
 * [raio, altura] de baixo para cima. Desenha os meridianos (`sides`) e um
 * anel em cada ponto do perfil.
 */
export function lathe(pen: Pen, profile: [number, number][], cx: number, cz: number, sides: number, order0 = 0, order1 = 1, spin = 0) {
  const at = (r: number, y: number, a: number): V3 => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
  for (let s = 0; s < sides; s++) {
    const a = spin + (s / sides) * Math.PI * 2;
    polyline(pen, profile.map(([r, y]) => at(r, y, a)), order0, order1);
  }
  profile.forEach(([r, y], i) => {
    if (r < 1e-4) return;
    const order = order0 + ((order1 - order0) * i) / Math.max(1, profile.length - 1);
    polyline(pen, Array.from({ length: sides }, (_, s) => at(r, y, spin + (s / sides) * Math.PI * 2)), order, order, true);
  });
}

/** As 12 arestas de uma caixa alinhada aos eixos. */
export function box(pen: Pen, min: V3, max: V3, order0 = 0, order1 = order0) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const ring = (y: number): V3[] => [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
  polyline(pen, ring(y0), order0, order0, true);
  ring(y0).forEach((p, i) => pen(p, ring(y1)[i], order0 + (order1 - order0) * 0.5));
  polyline(pen, ring(y1), order1, order1, true);
}
