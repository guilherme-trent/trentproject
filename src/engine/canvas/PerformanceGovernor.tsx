'use client';

import { useRef } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { useAppStore } from '../store/useAppStore';

/** Inversões de direção (sobe↔desce) toleradas dentro da janela antes de travar. */
const MAX_REVERSALS = 3;
const REVERSAL_WINDOW_MS = 30_000;

/**
 * Ponte entre o PerformanceMonitor do drei e o store.
 *
 * O monitor amostra o FPS em janelas de ~2,5s (10 × 250ms) e emite
 * incline/decline. O governor traduz isso em ações do store, que decidem
 * se cede DPR ou tier (ver `degradePerformance`).
 *
 * Decisões de design:
 *   - `flipflops` do drei fica em Infinity de propósito: internamente ele
 *     incrementa o contador em TODO ajuste, não só em inversões. Um dispositivo
 *     que sobe 4 degraus de DPR legitimamente seria travado. Fazemos a detecção
 *     de oscilação real aqui.
 *   - Callbacks leem o store via `getState()`: o governor nunca re-renderiza.
 *   - Enquanto `isLoaded` é false (download, decode, compilação de shader),
 *     quedas de FPS são esperadas e ignoradas — senão toda troca de cena
 *     derrubaria a qualidade.
 */
export function PerformanceGovernor() {
  const lastDirection = useRef<1 | -1 | 0>(0);
  const reversals = useRef<number[]>([]);

  const handle = (direction: 1 | -1) => {
    const store = useAppStore.getState();
    if (!store.isLoaded || store.isPerformanceLocked) return;

    if (lastDirection.current !== 0 && lastDirection.current !== direction) {
      const now = performance.now();
      reversals.current = reversals.current.filter((t) => now - t < REVERSAL_WINDOW_MS);
      reversals.current.push(now);

      if (reversals.current.length >= MAX_REVERSALS) {
        store.lockPerformance();
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[PerformanceGovernor] oscilação detectada — qualidade travada', {
            tier: store.performanceTier,
          });
        }
        return;
      }
    }
    lastDirection.current = direction;

    if (direction === 1) store.upgradePerformance();
    else store.degradePerformance();
  };

  return (
    <PerformanceMonitor
      flipflops={Infinity}
      onIncline={() => handle(1)}
      onDecline={() => handle(-1)}
    />
  );
}
