import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { SceneId } from '../config/scenes';
import {
  degradeStep,
  getDprBounds,
  getInitialDpr,
  PERFORMANCE_TIERS,
  qualityRank,
  upgradeWithin,
  type PerformanceTier,
  type QualityBudget,
} from '../config/performance';

/**
 * Store global do motor.
 *
 * Regras de uso (performance):
 *   - Componentes React assinam fatias mínimas: `useAppStore((s) => s.dpr)`.
 *   - Código fora do ciclo de render (useFrame, callbacks, sistemas) usa
 *     `useAppStore.getState()` / `useAppStore.subscribe(...)` — zero re-renders.
 *   - `subscribeWithSelector` permite que sistemas reajam a UMA chave
 *     (ex.: useCleanup escuta só `currentScene`) de forma síncrona.
 *
 * O estado inicial é determinístico (sem `window`) para que o HTML do servidor
 * e a primeira renderização do cliente sejam idênticos (sem hydration mismatch).
 */

export interface AppState {
  // ── Cena ────────────────────────────────────────────────────────────────
  currentScene: SceneId;
  previousScene: SceneId | null;
  /** Assets da cena atual resolvidos + shaders compilados + primeiro frame pintado. */
  isLoaded: boolean;

  // ── Performance ─────────────────────────────────────────────────────────
  performanceTier: PerformanceTier;
  dpr: number;
  /** Travado após oscilação detectada: o governor para de ajustar. */
  isPerformanceLocked: boolean;
  /** Já recebeu o palpite inicial do dispositivo (só acontece no cliente). */
  isPerformanceHydrated: boolean;
  /**
   * Melhorias de qualidade aprovadas pelo governor, aguardando a próxima
   * "cortina" (troca de cena). Mudar DPR redimensiona o drawing buffer e todos
   * os render targets — um hitch de ~100ms. Numa troca de cena ele é invisível;
   * no meio da cena, é exatamente o "stutter aleatório" que medimos.
   */
  pendingUpgrades: number;
  /** Orçamento aprendido por cena, retomado a cada visita. */
  sceneBudgets: Partial<Record<SceneId, QualityBudget>>;
  /** Por cena: o rank de qualidade em que ela já engasgou (limite exclusivo para melhorias). */
  sceneCeilings: Partial<Record<SceneId, number>>;

  // ── Áudio ───────────────────────────────────────────────────────────────
  /** 'locked' até o primeiro gesto do usuário; depois espelha AudioContext.state. */
  audioState: AudioState;

  // ── Ações ───────────────────────────────────────────────────────────────
  setScene: (scene: SceneId) => void;
  setLoaded: (loaded: boolean) => void;
  hydratePerformance: (tier: PerformanceTier) => void;
  /** Rebaixa o tier se ele estiver acima do teto indicado (ex.: pela GPU detectada). */
  capTier: (cap: PerformanceTier) => void;
  degradePerformance: () => void;
  queueUpgrade: () => void;
  lockPerformance: () => void;
  setAudioState: (state: AudioState) => void;
}

export type AudioState = AudioContextState | 'locked' | 'unsupported';

const MAX_PENDING_UPGRADES = 2;

const budgetOf = (state: AppState): QualityBudget => ({ performanceTier: state.performanceTier, dpr: state.dpr });

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set) => ({
    currentScene: 'boot',
    previousScene: null,
    isLoaded: false,

    performanceTier: 'mid',
    dpr: 1,
    isPerformanceLocked: false,
    isPerformanceHydrated: false,
    pendingUpgrades: 0,
    sceneBudgets: {},
    sceneCeilings: {},

    audioState: 'locked',

    /**
     * A cortina. Na troca de cena:
     *   1. a cena que SAI memoriza seu orçamento, já com as melhorias que ela
     *      mesma provou suportar (limitadas ao seu teto);
     *   2. a cena que ENTRA retoma o orçamento que aprendeu na última visita —
     *      ou, na primeira visita, herda o nível atual (sem as melhorias, que
     *      foram medidas em outra cena e não valem para esta).
     */
    setScene: (scene) =>
      set((state) => {
        if (state.currentScene === scene) return state;

        const leaving = state.isPerformanceLocked
          ? budgetOf(state)
          : upgradeWithin(budgetOf(state), state.pendingUpgrades, state.sceneCeilings[state.currentScene]);
        const entering = state.isPerformanceLocked ? budgetOf(state) : (state.sceneBudgets[scene] ?? budgetOf(state));

        return {
          previousScene: state.currentScene,
          currentScene: scene,
          // Toda troca de cena reabre o ciclo de carregamento; o
          // SceneReadySignal da nova cena devolve `true` quando ela estiver pronta.
          isLoaded: false,
          ...entering,
          pendingUpgrades: 0,
          sceneBudgets: { ...state.sceneBudgets, [state.currentScene]: leaving },
        };
      }),

    setLoaded: (loaded) => set({ isLoaded: loaded }),

    // Idempotente: o StrictMode executa effects duas vezes em dev.
    hydratePerformance: (tier) =>
      set((state) =>
        state.isPerformanceHydrated
          ? state
          : { performanceTier: tier, dpr: getInitialDpr(tier), isPerformanceHydrated: true },
      ),

    capTier: (cap) =>
      set((state) => {
        if (PERFORMANCE_TIERS.indexOf(state.performanceTier) <= PERFORMANCE_TIERS.indexOf(cap)) return state;
        return { performanceTier: cap, dpr: getInitialDpr(cap) };
      }),

    /**
     * Queda imediata (jank sustentado é pior que um hitch de resize). Registra
     * o nível que falhou como TETO da cena: ela não volta a subir até ele.
     * Retornar `state` intacto evita notificar assinantes à toa.
     */
    degradePerformance: () =>
      set((state) => {
        if (state.isPerformanceLocked) return state;
        const next = degradeStep(budgetOf(state));
        if (!next) return state.pendingUpgrades ? { pendingUpgrades: 0 } : state;

        const failed = qualityRank(budgetOf(state));
        const ceiling = Math.min(state.sceneCeilings[state.currentScene] ?? Infinity, failed);
        return {
          ...next,
          pendingUpgrades: 0,
          sceneCeilings: { ...state.sceneCeilings, [state.currentScene]: ceiling },
        };
      }),

    /** Enfileira uma melhoria — só se ela não esbarrar no teto aprendido desta cena. */
    queueUpgrade: () =>
      set((state) => {
        if (state.isPerformanceLocked || state.pendingUpgrades >= MAX_PENDING_UPGRADES) return state;
        const target = upgradeWithin(budgetOf(state), state.pendingUpgrades + 1, state.sceneCeilings[state.currentScene]);
        const reachable = qualityRank(target) > qualityRank(upgradeWithin(budgetOf(state), state.pendingUpgrades));
        return reachable ? { pendingUpgrades: state.pendingUpgrades + 1 } : state;
      }),

    /** Congela no piso do tier atual: estabilidade > fidelidade quando há oscilação. */
    lockPerformance: () =>
      set((state) => ({
        isPerformanceLocked: true,
        dpr: getDprBounds(state.performanceTier)[0],
        pendingUpgrades: 0,
      })),

    setAudioState: (audioState) => set({ audioState }),
  })),
);
