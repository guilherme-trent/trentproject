'use client';

import { Suspense, useEffect } from 'react';
import { SCENES } from '@/scenes/registry';
import { useAppStore } from '../store/useAppStore';
import { useCleanup } from '../hooks/useCleanup';
import { SCENE_MANIFEST } from '../config/scenes';
import { preloadScene } from '../lib/assets';
import { SceneReadySignal } from './SceneReadySignal';

/**
 * Orquestrador de cenas dentro do <Canvas>.
 *
 * O <Suspense> fica AQUI, dentro do Canvas, porque é aqui que assets 3D
 * suspendem (useGLTF, useTexture…). O fallback é `null` porque DOM não pode
 * ser renderizado dentro do Canvas — a tela de loading é a camada de UI,
 * dirigida por `isLoaded` no store.
 */
export function SceneRouter() {
  const currentScene = useAppStore((state) => state.currentScene);
  const isLoaded = useAppStore((state) => state.isLoaded);

  useCleanup();

  // Com a cena atual pronta, antecipa as vizinhas: assets (manifest) +
  // chunk JS + prepare(). Falhas aqui são silenciosas de propósito — a cena
  // tenta de novo ao montar, e aí o erro aparece no lugar certo.
  useEffect(() => {
    if (!isLoaded) return;
    for (const next of SCENE_MANIFEST[currentScene].next) {
      preloadScene(next);
      SCENES[next]?.preload().catch(() => undefined);
    }
  }, [currentScene, isLoaded]);

  const ActiveScene = SCENES[currentScene]?.Component;

  return (
    <Suspense fallback={null}>
      {ActiveScene ? <ActiveScene key={currentScene} /> : null}
      <SceneReadySignal sceneId={currentScene} />
    </Suspense>
  );
}
