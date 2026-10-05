'use client';

import { useLayoutEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useAppStore } from '../store/useAppStore';
import { detectInitialTier } from '../config/performance';
import { PerformanceGovernor } from './PerformanceGovernor';
import { SceneRouter } from './SceneRouter';

/**
 * O <Canvas> do motor. Carregado apenas no cliente (ver CanvasLayer) — three.js
 * nunca entra no bundle do servidor nem no JS crítico da primeira pintura.
 *
 * DPR é reativo: o PerformanceGovernor altera `dpr` no store e o R3F
 * redimensiona o drawing buffer sem recriar o contexto WebGL.
 */
export function EngineCanvas() {
  const dpr = useAppStore((state) => state.dpr);

  // Atributos do contexto WebGL são imutáveis após a criação, então são
  // decididos uma única vez a partir do palpite inicial de hardware.
  const [initialTier] = useState(detectInitialTier);
  const [glAttributes] = useState(
    (): WebGLContextAttributes => ({
      antialias: initialTier === 'high', // MSAA é caro em GPUs móveis; tiers menores usam DPR.
      alpha: false, // canvas opaco: o compositor do browser não precisa fazer blending.
      stencil: false, // nenhuma feature planejada usa stencil — economiza memória de VRAM.
      depth: true,
      powerPreference: 'high-performance', // pede a GPU dedicada em notebooks híbridos.
    }),
  );

  useLayoutEffect(() => {
    useAppStore.getState().hydratePerformance(initialTier);
  }, [initialTier]);

  return (
    <Canvas
      dpr={dpr}
      gl={glAttributes}
      camera={{ position: [0, 0, 5], fov: 45, near: 0.1, far: 100 }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 1)}
    >
      <PerformanceGovernor />
      <SceneRouter />
    </Canvas>
  );
}
