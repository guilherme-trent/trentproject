'use client';

import { useEffect, useRef, useState } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { useAppStore } from '../store/useAppStore';

/** Inversões de direção (sobe↔desce) toleradas dentro da janela antes de travar. */
const MAX_REVERSALS = 3;
const REVERSAL_WINDOW_MS = 30_000;
/** Sinais de folga consecutivos exigidos antes de enfileirar uma melhoria. */
const INCLINES_TO_UPGRADE = 2;
/** Carência após a aba voltar a ficar visível: o navegador "acorda" com frames lentos. */
const VISIBILITY_GRACE_MS = 3000;

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
 *   - qualquer cena carregando (download/compilação geram quedas esperadas);
 *   - a aba oculta e os primeiros segundos depois que ela volta. Ao voltar, o
 *     primeiro intervalo medido inclui TODO o tempo em que a aba ficou escondida
 *     e os primeiros frames são lentos — leituras falsas que derrubavam a
 *     qualidade sem motivo. O monitor é remontado (`key`) para recomeçar sem
 *     nenhuma amostra contaminada — o mesmo acontece a cada troca de cena.
 *
 * As quedas param no piso de direção de arte (store → qualityFloor).
 */
export function PerformanceGovernor() {
  const lastDirection = useRef<1 | -1 | 0>(0);
  const reversals = useRef<number[]>([]);
  const consecutiveInclines = useRef(0);
  const pausedUntil = useRef(0);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        pausedUntil.current = Infinity;
        return;
      }
      pausedUntil.current = performance.now() + VISIBILITY_GRACE_MS;
      consecutiveInclines.current = 0;
      setEpoch((value) => value + 1); // novo monitor, sem a amostra do período oculto
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Cada cena é medida do zero: sem isso, a janela de ~2,5s do monitor
  // atravessa a troca e atribui à cena nova a folga (ou o peso) da anterior —
  // medido: uma melhoria falsa enfileirada 0,1s após a hub carregar.
  useEffect(
    () =>
      useAppStore.subscribe(
        (state) => state.currentScene,
        () => {
          consecutiveInclines.current = 0;
          setEpoch((value) => value + 1);
        },
      ),
    [],
  );

  const handle = (direction: 1 | -1) => {
    const store = useAppStore.getState();
    if (!store.isLoaded || store.isPerformanceLocked || store.currentScene === 'boot') return;
    if (document.visibilityState === 'hidden' || performance.now() < pausedUntil.current) return;

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
      key={epoch}
      bounds={bounds}
      flipflops={Infinity}
      onIncline={() => handle(1)}
      onDecline={() => handle(-1)}
    />
  );
}
