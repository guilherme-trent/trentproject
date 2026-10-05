'use client';

import dynamic from 'next/dynamic';

/**
 * Camada de fundo (z-0) que hospeda o Canvas.
 *
 * `next/dynamic` com `ssr: false`:
 *   - three/R3F/drei (~centenas de KB) viram um chunk assíncrono, fora do JS crítico;
 *   - o servidor não tenta renderizar WebGL.
 * Internamente o Next envolve o import num <Suspense> próprio cujo fallback é
 * `loading` — por isso o fallback aqui é `null`: a tela de loading visível é a
 * da UI, que cobre TODAS as fases (download do chunk, contexto WebGL, assets,
 * compilação de shaders) a partir de uma única fonte de verdade: `isLoaded`.
 */
const EngineCanvas = dynamic(() => import('./EngineCanvas').then((mod) => mod.EngineCanvas), {
  ssr: false,
  loading: () => null,
});

export function CanvasLayer() {
  return (
    <div aria-hidden className="fixed inset-0 z-0 touch-none select-none bg-black">
      <EngineCanvas />
    </div>
  );
}
