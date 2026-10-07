/**
 * Curvas de easing das transições.
 *
 * `cubicBezier` é o mesmo modelo do CSS `cubic-bezier(x1, y1, x2, y2)`: dado o
 * progresso no tempo (x), resolve o parâmetro t da curva por Newton-Raphson
 * (com bisseção de reserva) e devolve y(t). Pré-calculada em tabela de 64
 * amostras: por frame, o custo é uma interpolação — zero alocação.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const bx = (t: number) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
  const by = (t: number) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  const dbx = (t: number) => 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;

  const solveT = (x: number) => {
    let t = x;
    for (let i = 0; i < 6; i++) {
      const slope = dbx(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= (bx(t) - x) / slope;
    }
    if (t >= 0 && t <= 1 && Math.abs(bx(t) - x) < 1e-4) return t;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      t = (lo + hi) / 2;
      if (bx(t) < x) lo = t;
      else hi = t;
    }
    return t;
  };

  const SAMPLES = 64;
  const table = Float32Array.from({ length: SAMPLES + 1 }, (_, i) => by(solveT(i / SAMPLES)));
  return (x: number) => {
    const clamped = Math.min(1, Math.max(0, x)) * SAMPLES;
    const i = Math.min(SAMPLES - 1, Math.floor(clamped));
    return table[i] + (table[i + 1] - table[i]) * (clamped - i);
  };
}

/**
 * O "Mergulho Warp": quase parado por 60% do tempo, depois violento. É a
 * hesitação seguida de puxão que vende a sensação de ser sugado pelo fruto.
 */
export const warpEase = cubicBezier(0.72, 0, 0.96, 0.22);

export const easeInCubic = (x: number) => x * x * x;
