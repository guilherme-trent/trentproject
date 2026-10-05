'use client';

import { AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/engine/store/useAppStore';
import { LoadingScreen } from './LoadingScreen';
import { StartPrompt } from './StartPrompt';
import { RealmHud } from './RealmHud';

type OverlayView = 'loading' | 'start' | 'realm' | null;

/**
 * Camada de UI (z-10) acima do Canvas.
 *
 * `pointer-events-none` no container: áreas sem UI deixam eventos passarem
 * para o Canvas (raycasting 3D). Cada view interativa reativa com `pointer-events-auto`.
 *
 * A view é uma máquina de estados derivada do store — a UI não guarda estado
 * próprio, então nunca diverge do motor.
 */
export function UIOverlay() {
  const isLoaded = useAppStore((state) => state.isLoaded);
  const currentScene = useAppStore((state) => state.currentScene);

  const view: OverlayView = !isLoaded
    ? 'loading'
    : currentScene === 'boot'
      ? 'start'
      : currentScene.startsWith('realm_')
        ? 'realm'
        : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      <AnimatePresence mode="wait">
        {view === 'loading' && <LoadingScreen key="loading" />}
        {view === 'start' && <StartPrompt key="start" />}
        {view === 'realm' && <RealmHud key={currentScene} scene={currentScene} />}
      </AnimatePresence>
    </div>
  );
}
