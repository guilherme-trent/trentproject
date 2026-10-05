'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useAppStore } from '../store/useAppStore';
import type { SceneId } from '../config/scenes';
import { compileForPipeline } from '../gl/warmup';

/**
 * Sinaliza `isLoaded = true` quando a cena está realmente pronta para ser vista.
 *
 * Vive DENTRO do mesmo <Suspense> da cena: seu effect só roda depois que todos
 * os assets suspensos resolveram. Antes de liberar a UI ainda:
 *   1. Pré-compila todos os shaders da cena (`compileAsync`, usa
 *      KHR_parallel_shader_compile quando disponível) — elimina o "stutter" do
 *      primeiro frame em que um material aparece. Normalmente o warmup já fez
 *      isso durante a cena anterior; aqui é a rede de segurança.
 *   2. Espera um requestAnimationFrame para garantir que o frame foi pintado.
 */
export function SceneReadySignal({ sceneId }: { sceneId: SceneId }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;

    // Compila para a pipeline em uso (tela ou render target do bloom).
    compileForPipeline(gl, scene, camera).finally(() => {
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
