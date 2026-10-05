/**
 * Perfis de performance.
 *
 * O motor tem dois "botões" de qualidade com custos muito diferentes:
 *   - DPR (resolução): ajuste fino, contínuo, quase imperceptível. É o primeiro a ceder.
 *   - Tier (features): ajuste grosso — liga/desliga sombras, pós-processamento, densidade
 *     de partículas. Só muda quando o DPR já esgotou sua faixa dentro do tier atual.
 *
 * As cenas NUNCA leem FPS diretamente: elas consomem `TIER_PROFILES[tier]` e se adaptam.
 */

export const PERFORMANCE_TIERS = ['low', 'mid', 'high'] as const;

export type PerformanceTier = (typeof PERFORMANCE_TIERS)[number];

export interface TierProfile {
  /** Faixa de DPR permitida neste tier: [mínimo, máximo]. */
  dpr: readonly [min: number, max: number];
  shadows: boolean;
  postprocessing: boolean;
  /** Multiplicador (0–1) aplicado a contagens de partículas/instâncias nas cenas. */
  particleBudget: number;
}

export const TIER_PROFILES: Record<PerformanceTier, TierProfile> = {
  high: { dpr: [1, 2], shadows: true, postprocessing: true, particleBudget: 1 },
  mid: { dpr: [0.75, 1.5], shadows: false, postprocessing: true, particleBudget: 0.5 },
  low: { dpr: [0.5, 1], shadows: false, postprocessing: false, particleBudget: 0.2 },
};

/** Granularidade dos ajustes de DPR. Passos pequenos evitam saltos visíveis de nitidez. */
export const DPR_STEP = 0.25;

const EPSILON = 1e-3;

const snapToStep = (value: number) => Math.round(value / DPR_STEP) * DPR_STEP;

/**
 * Faixa efetiva de DPR do tier, limitada pelo DPR físico da tela
 * (não faz sentido renderizar a 2x num monitor 1x).
 */
export function getDprBounds(tier: PerformanceTier): [min: number, max: number] {
  const [min, max] = TIER_PROFILES[tier].dpr;
  const device = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return [min, Math.max(min, Math.min(max, device))];
}

export function clampDpr(tier: PerformanceTier, dpr: number): number {
  const [min, max] = getDprBounds(tier);
  return Math.min(max, Math.max(min, dpr));
}

/** DPR inicial: ponto médio da faixa. "Comece conservador, conquiste fidelidade." */
export function getInitialDpr(tier: PerformanceTier): number {
  const [min, max] = getDprBounds(tier);
  return clampDpr(tier, snapToStep((min + max) / 2));
}

/** Próximo DPR na direção pedida, ou `null` se a faixa do tier se esgotou. */
export function stepDpr(tier: PerformanceTier, dpr: number, direction: 1 | -1): number | null {
  const next = clampDpr(tier, snapToStep(dpr + direction * DPR_STEP));
  return Math.abs(next - dpr) > EPSILON ? next : null;
}

/** Tier vizinho na direção pedida, ou `null` se já está no extremo. */
export function stepTier(tier: PerformanceTier, direction: 1 | -1): PerformanceTier | null {
  const index = PERFORMANCE_TIERS.indexOf(tier) + direction;
  return PERFORMANCE_TIERS[index] ?? null;
}

/**
 * Palpite inicial de tier a partir de sinais baratos do dispositivo.
 * É só o ponto de partida — o PerformanceGovernor corrige em runtime com FPS real.
 * Função pura e síncrona: segura para usar em inicializador de useState.
 */
export function detectInitialTier(): PerformanceTier {
  if (typeof window === 'undefined') return 'mid';

  const nav = navigator as Navigator & {
    deviceMemory?: number; // Chromium only
    connection?: { saveData?: boolean };
  };
  const cores = nav.hardwareConcurrency ?? 4;
  const memoryGb = nav.deviceMemory ?? 8;
  const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches;

  if (nav.connection?.saveData || cores <= 2 || memoryGb <= 2) return 'low';
  if (isTouchPrimary || cores <= 4 || memoryGb <= 4) return 'mid';
  return 'high';
}
