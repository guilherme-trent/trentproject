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

export interface BloomProfile {
  /** MSAA do composer. 0 = desligado: com HalfFloat, MSAA custa caro em GPUs integradas. */
  multisampling: number;
  /** Níveis da cadeia de mipmaps do bloom: menos níveis = halo mais curto e mais barato. */
  levels: number;
  intensity: number;
}

export interface TierProfile {
  /** Faixa de DPR permitida neste tier: [mínimo, máximo]. */
  dpr: readonly [min: number, max: number];
  shadows: boolean;
  /** `null` desliga todo o pós-processamento (a cena renderiza direto na tela). */
  bloom: BloomProfile | null;
  /** Multiplicador (0–1) aplicado a contagens de partículas/instâncias nas cenas. */
  particleBudget: number;
}

export const TIER_PROFILES: Record<PerformanceTier, TierProfile> = {
  high: {
    dpr: [1, 2],
    shadows: true,
    bloom: { multisampling: 4, levels: 8, intensity: 1.35 },
    particleBudget: 1,
  },
  mid: {
    dpr: [0.75, 1.5],
    shadows: false,
    bloom: { multisampling: 0, levels: 6, intensity: 1.15 },
    particleBudget: 0.5,
  },
  low: { dpr: [0.5, 1], shadows: false, bloom: null, particleBudget: 0.2 },
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

/**
 * DPR inicial: 1× (resolução nativa de CSS) dentro da faixa do tier. Abaixo
 * disso, linhas de 1px borram visivelmente; acima, só se conquista nas
 * cortinas (trocas de cena) — ver `queueUpgrade` no store.
 */
export function getInitialDpr(tier: PerformanceTier): number {
  return clampDpr(tier, 1);
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

// ── Passos de qualidade (funções puras, usadas pelo store) ───────────────────

export interface QualityBudget {
  performanceTier: PerformanceTier;
  dpr: number;
}

/** Escalar ordenável de qualidade: tier domina, DPR desempata. */
export const qualityRank = ({ performanceTier, dpr }: QualityBudget) =>
  PERFORMANCE_TIERS.indexOf(performanceTier) * 10 + dpr;

/**
 * Melhoria em cascata: recupera resolução primeiro, features depois — nunca
 * acima de `maxTier` (o teto da classe de GPU). Sob vsync, FPS cravado em 60
 * não prova que sobra GPU para um salto de tier (medido: uma Intel UHD estável
 * em 'mid' "conquistou" 'high' e voltou a engasgar).
 */
export function upgradeStep(
  { performanceTier, dpr }: QualityBudget,
  maxTier: PerformanceTier = 'high',
): QualityBudget | null {
  const nextDpr = stepDpr(performanceTier, dpr, 1);
  if (nextDpr !== null) return { performanceTier, dpr: nextDpr };
  const higher = stepTier(performanceTier, 1);
  if (!higher || PERFORMANCE_TIERS.indexOf(higher) > PERFORMANCE_TIERS.indexOf(maxTier)) return null;
  return { performanceTier: higher, dpr: clampDpr(higher, dpr) };
}

/**
 * Piso de direção de arte: abaixo disto o motor NÃO degrada em runtime.
 *   - tier 'mid': mantém o bloom (sem ele a árvore perde o branco e muda de cor);
 *   - DPR 1.0: abaixo da resolução nativa, linhas de 1px borram e serrilham.
 * Decisão de produto: 45 fps bonitos > 60 fps com a direção de arte destruída.
 * Só um palpite inicial 'low' (GPU por software, aparelho muito fraco) rebaixa o piso.
 */
export const ART_DIRECTION_FLOOR: QualityBudget = { performanceTier: 'mid', dpr: 1 };

/** O piso efetivo: o de arte, rebaixado apenas se o dispositivo começou abaixo dele. */
export function floorFor(startTier: PerformanceTier): QualityBudget {
  const floorTier = PERFORMANCE_TIERS.indexOf(startTier) < PERFORMANCE_TIERS.indexOf(ART_DIRECTION_FLOOR.performanceTier)
    ? startTier
    : ART_DIRECTION_FLOOR.performanceTier;
  return { performanceTier: floorTier, dpr: clampDpr(floorTier, ART_DIRECTION_FLOOR.dpr) };
}

/** `budget` respeita o piso? Tier não pode cair abaixo dele; DPR também não (até onde o tier permite). */
function respectsFloor(budget: QualityBudget, floor: QualityBudget): boolean {
  const tierOk = PERFORMANCE_TIERS.indexOf(budget.performanceTier) >= PERFORMANCE_TIERS.indexOf(floor.performanceTier);
  const dprFloor = Math.min(floor.dpr, getDprBounds(budget.performanceTier)[1]);
  return tierOk && budget.dpr >= dprFloor - EPSILON;
}

/**
 * Queda em cascata: sacrifica resolução primeiro, features depois — o
 * primeiro candidato que respeita o piso vence; nenhum = já estamos no piso.
 */
export function degradeStep({ performanceTier, dpr }: QualityBudget, floor: QualityBudget): QualityBudget | null {
  const candidates: QualityBudget[] = [];
  const nextDpr = stepDpr(performanceTier, dpr, -1);
  if (nextDpr !== null) candidates.push({ performanceTier, dpr: nextDpr });
  const lower = stepTier(performanceTier, -1);
  if (lower) candidates.push({ performanceTier: lower, dpr: clampDpr(lower, dpr) });
  return candidates.find((candidate) => respectsFloor(candidate, floor)) ?? null;
}

/** Aplica até `steps` melhorias, parando antes de alcançar o teto (exclusivo). */
export function upgradeWithin(
  budget: QualityBudget,
  steps: number,
  ceiling = Infinity,
  maxTier: PerformanceTier = 'high',
): QualityBudget {
  let current = budget;
  for (let i = 0; i < steps; i++) {
    const next = upgradeStep(current, maxTier);
    if (!next || qualityRank(next) >= ceiling) break;
    current = next;
  }
  return current;
}

/**
 * Teto de tier pela GPU real (string do renderer WebGL). Núcleos e memória
 * dizem pouco sobre a GPU: uma Intel UHD num notebook de 8 núcleos era
 * classificada 'high' e engasgava até o governor reagir.
 */
export function tierCapFromRenderer(renderer: string): PerformanceTier {
  const name = renderer.toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software/.test(name)) return 'low';
  if (/intel|mali|adreno|powervr|videocore|uhd|iris/.test(name)) return 'mid';
  return 'high';
}
