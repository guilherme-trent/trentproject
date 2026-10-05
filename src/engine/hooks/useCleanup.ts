import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useAppStore } from '../store/useAppStore';
import type { SceneId } from '../config/scenes';
import { evictSceneAssets } from '../lib/assets';
import { runWhenIdle } from '../lib/idle';
import { collectLiveResources, collectResources, sweepResources, type Disposable } from '../lib/disposal';

interface UseCleanupOptions {
  /** Loga `renderer.info.memory` antes/depois de cada sweep. Padrão: só em dev. */
  debug?: boolean;
}

/**
 * Garbage collector de GPU orientado a troca de cena — algoritmo mark-and-sweep.
 *
 * POR QUE NÃO SIMPLESMENTE "VARRER A CENA E DAR DISPOSE EM TUDO"?
 *   Quando o `useEffect` de troca de cena roda, o React já desmontou a cena antiga:
 *   os objetos dela não estão mais no grafo, então uma varredura não os encontra.
 *   E varrer ANTES descartaria recursos compartilhados que a nova cena vai usar.
 *
 * COMO FUNCIONA:
 *   1. MARK  — `useAppStore.subscribe` dispara SÍNCRONO dentro do `setScene()`,
 *              antes do React renderizar. O grafo da cena antiga ainda está
 *              intacto: fotografamos todos os seus recursos em `pending`.
 *   2. COMMIT — React desmonta a cena antiga e monta a nova.
 *   3. SWEEP — em idle (sem competir com o primeiro frame da nova cena),
 *              descartamos `pending − vivos`. O que a nova cena reutiliza
 *              sobrevive automaticamente.
 *
 * O sweep roda em dois momentos: no commit da troca E quando a nova cena
 * termina de carregar (`isLoaded`). O segundo cobre o caso em que um <Suspense>
 * mantém a cena antiga oculta-mas-montada até a nova resolver.
 *
 * O QUE ISSO COBRE QUE O R3F NÃO COBRE:
 *   O R3F já chama dispose() em elementos JSX desmontados (<boxGeometry/>, etc.).
 *   Ele NÃO descarta <primitive object={gltf.scene}/>, texturas passadas como props,
 *   nem nada vindo de loaders com cache — justamente os recursos mais pesados.
 *
 * Proteja assets globais com `markPersistent()` (lib/disposal.ts).
 * Deve ser chamado UMA vez, dentro do <Canvas>.
 */
export function useCleanup({ debug = process.env.NODE_ENV !== 'production' }: UseCleanupOptions = {}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const currentScene = useAppStore((state) => state.currentScene);
  const isLoaded = useAppStore((state) => state.isLoaded);

  const pendingRef = useRef<Set<Disposable>>(new Set());
  const outgoingScenesRef = useRef<Set<SceneId>>(new Set());

  // ── Fase 1: MARK ─────────────────────────────────────────────────────────
  useEffect(
    () =>
      useAppStore.subscribe(
        (state) => state.currentScene,
        (_next, previous) => {
          // Acumula (não substitui): trocas rápidas A→B→C não perdem o snapshot de A.
          collectResources(scene, pendingRef.current);
          outgoingScenesRef.current.add(previous);
        },
      ),
    [scene],
  );

  // ── Fase 3: SWEEP ────────────────────────────────────────────────────────
  useEffect(() => {
    if (pendingRef.current.size === 0 && outgoingScenesRef.current.size === 0) return;

    const sweep = () => {
      const before = debug ? { ...gl.info.memory } : null;

      const disposed = sweepResources(pendingRef.current, collectLiveResources(scene));
      evictSceneAssets(outgoingScenesRef.current, currentScene);
      outgoingScenesRef.current.clear();
      // Render lists guardam referências a objetos renderizados; limpá-las
      // permite que o GC do JS colete os objetos descartados.
      gl.renderLists.dispose();

      if (debug && before) {
        console.debug(
          `[useCleanup] ${currentScene}: ${disposed} recursos descartados, ` +
            `${pendingRef.current.size} retidos (ainda em uso)`,
          { before, after: { ...gl.info.memory } },
        );
      }
    };

    // Idle: o descarte não rouba tempo do primeiro frame da nova cena.
    return runWhenIdle(sweep);
  }, [currentScene, isLoaded, gl, scene, debug]);
}
