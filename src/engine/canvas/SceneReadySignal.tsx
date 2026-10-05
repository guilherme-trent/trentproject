'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useAppStore } from '../store/useAppStore';
import type { SceneId } from '../config/scenes';

/**
 * Sinaliza `isLoaded = true` quando a cena está realmente pronta para ser vista.
 *
 * Vive DENTRO do mesmo <Suspense> da cena: seu effect só roda depois que todos
 * os assets suspensos resolveram. Antes de liberar a UI ainda:
 *   1. Pré-compila todos os shaders da cena (`compileAsync`, usa
 *      KHR_parallel_shader_compile quando disponível) — elimina o "stutter" do
 *      primeiro frame em que um material aparece.
 *   2. Espera um requestAnimationFrame para garantir que o frame foi pintado.
 */
export function SceneReadySignal({ sceneId }: { sceneId: SceneId }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;

    gl.compileAsync(scene, camera)
      .catch(() => undefined) // falha de pré-compilação não deve travar o boot
      .finally(() => {
        if (cancelled) return;
        frame = requestAnimationFrame(() => {
          if (!cancelled) useAppStore.getState().setLoaded(true);
        });
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [sceneId, gl, scene, camera]);

  return null;
}
