'use client';

import { useRef } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { useAppStore } from '../store/useAppStore';

/** Inversões de direção (sobe↔desce) toleradas dentro da janela antes de travar. */
const MAX_REVERSALS = 3;
const REVERSAL_WINDOW_MS = 30_000;
/** Sinais de folga consecutivos exigidos antes de enfileirar uma melhoria. */
const INCLINES_TO_UPGRADE = 2;

/**
 * Limites de FPS corrigidos para o viés do drei.
 *
 * O PerformanceMonitor calcula `frames.length / msPassed`: conta N frames
 * sobre N−1 intervalos, superestimando o FPS em ~6% (reporta ~64 numa tela de
 * 60Hz). Com o limite padrão [40, 60], isso fazia o motor SUBIR a qualidade
 * enquanto ainda perdia frames — medido: DPR 1.5 → 2.0 com frames de 33ms
 * constantes. `refreshrate` aqui já é o máximo (enviesado) observado, então
 * os limites relativos a ele cancelam o viés.
 */
const bounds = (refreshrate: number): [number, number] => [refreshrate * 0.85, refreshrate * 0.97];

/**
 * Ponte entre o PerformanceMonitor do drei e o store — com política assimétrica:
 *
 *   QUEDA    imediata. Jank sustentado é pior que um hitch único de resize.
 *   MELHORIA exige folga sustentada (2 avaliações seguidas ≈ 5s) e é apenas
 *            ENFILEIRADA: o store aplica na próxima troca de cena, onde o hitch
 *            de redimensionar buffers fica escondido pela transição.
 *
 * Também ignora:
 *   - a cena 'boot' (tela vazia: folga falsa, não representa a experiência);
 *   - qualquer cena carregando (download/compilação geram quedas esperadas).
 */
export function PerformanceGovernor() {
  const lastDirection = useRef<1 | -1 | 0>(0);
  const reversals = useRef<number[]>([]);
  const consecutiveInclines = useRef(0);

  const handle = (direction: 1 | -1) => {
    const store = useAppStore.getState();
    if (!store.isLoaded || store.isPerformanceLocked || store.currentScene === 'boot') return;

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

    if (direction === -1) {
      consecutiveInclines.current = 0;
      store.degradePerformance();
      return;
    }

    consecutiveInclines.current += 1;
    if (consecutiveInclines.current >= INCLINES_TO_UPGRADE) {
      consecutiveInclines.current = 0;
      store.queueUpgrade();
    }
  };

  return (
    <PerformanceMonitor
      bounds={bounds}
      flipflops={Infinity}
      onIncline={() => handle(1)}
      onDecline={() => handle(-1)}
    />
  );
}
