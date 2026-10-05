import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { SceneId } from '../config/scenes';
import {
  clampDpr,
  getDprBounds,
  getInitialDpr,
  stepDpr,
  stepTier,
  type PerformanceTier,
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

  // ── Áudio ───────────────────────────────────────────────────────────────
  /** 'locked' até o primeiro gesto do usuário; depois espelha AudioContext.state. */
  audioState: AudioState;

  // ── Ações ───────────────────────────────────────────────────────────────
  setScene: (scene: SceneId) => void;
  setLoaded: (loaded: boolean) => void;
  hydratePerformance: (tier: PerformanceTier) => void;
  degradePerformance: () => void;
  upgradePerformance: () => void;
  lockPerformance: () => void;
  setAudioState: (state: AudioState) => void;
}

export type AudioState = AudioContextState | 'locked' | 'unsupported';

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set) => ({
    currentScene: 'boot',
    previousScene: null,
    isLoaded: false,

    performanceTier: 'mid',
    dpr: 1,
    isPerformanceLocked: false,
    isPerformanceHydrated: false,

    audioState: 'locked',

    setScene: (scene) =>
      set((state) =>
        state.currentScene === scene
          ? state
          : {
              previousScene: state.currentScene,
              currentScene: scene,
              // Toda troca de cena reabre o ciclo de carregamento; o
              // SceneReadySignal da nova cena devolve `true` quando ela estiver pronta.
              isLoaded: false,
            },
      ),

    setLoaded: (loaded) => set({ isLoaded: loaded }),

    // Idempotente: o StrictMode executa effects duas vezes em dev.
    hydratePerformance: (tier) =>
      set((state) =>
        state.isPerformanceHydrated
          ? state
          : { performanceTier: tier, dpr: getInitialDpr(tier), isPerformanceHydrated: true },
      ),

    /**
     * Downgrade em cascata: primeiro reduz resolução dentro do tier; só quando
     * o DPR bate no piso do tier é que sacrificamos features (tier abaixo).
     * Retornar `state` intacto evita notificar assinantes à toa.
     */
    degradePerformance: () =>
      set((state) => {
        if (state.isPerformanceLocked) return state;

        const nextDpr = stepDpr(state.performanceTier, state.dpr, -1);
        if (nextDpr !== null) return { dpr: nextDpr };

        const lowerTier = stepTier(state.performanceTier, -1);
        if (!lowerTier) return state;
        return { performanceTier: lowerTier, dpr: clampDpr(lowerTier, state.dpr) };
      }),

    /** Espelho do downgrade: recupera resolução primeiro, features depois. */
    upgradePerformance: () =>
      set((state) => {
        if (state.isPerformanceLocked) return state;

        const nextDpr = stepDpr(state.performanceTier, state.dpr, 1);
        if (nextDpr !== null) return { dpr: nextDpr };

        const higherTier = stepTier(state.performanceTier, 1);
        if (!higherTier) return state;
        return { performanceTier: higherTier, dpr: clampDpr(higherTier, state.dpr) };
      }),

    /** Congela no piso do tier atual: estabilidade > fidelidade quando há oscilação. */
    lockPerformance: () =>
      set((state) => ({
        isPerformanceLocked: true,
        dpr: getDprBounds(state.performanceTier)[0],
      })),

    setAudioState: (audioState) => set({ audioState }),
  })),
);
