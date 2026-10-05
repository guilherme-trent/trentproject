'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Mesh, Scene } from 'three';
import { useAppStore } from '@/engine/store/useAppStore';
import { NEBULA_RESOLUTION } from './materials/NebulaMaterial';
import type { HubKit } from './kit';

/** Quanto o fundo desliza por unidade de movimento da câmera (paralaxe). */
const PARALLAX = 0.012;
/** A fumaça é recalculada a cada N frames — ela se move devagar demais para notar. */
const UPDATE_EVERY = 2;

/**
 * A nebulosa ao fundo, em dois passes:
 *   1. (useFrame) a fumaça é desenhada num render target de 1/4 da resolução,
 *      numa cena privada que o React nem vê;
 *   2. (JSX) um triângulo de tela cheia amplia o resultado, desenhado ANTES de
 *      tudo (renderOrder baixo, sem depth).
 *
 * VRAM: o render target e o material do passe 1 não estão no grafo da cena,
 * então o useCleanup não os enxerga — este componente os descarta ao desmontar.
 */
export function Nebula({ kit }: { kit: HubKit }) {
  const { geometry, material, composite, target } = kit.nebula;
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  const dpr = useThree((state) => state.viewport.dpr);
  const [stage] = useState(() => new Scene().add(new Mesh(geometry, material)));
  const frame = useRef(0);

  useEffect(() => {
    material.setAspect(width / height);
    target.setSize(
      Math.max(1, Math.round(width * dpr * NEBULA_RESOLUTION)),
      Math.max(1, Math.round(height * dpr * NEBULA_RESOLUTION)),
    );
    frame.current = 0; // força um redesenho imediato no novo tamanho
  }, [material, target, width, height, dpr]);

  useEffect(() => {
    material.setTier(useAppStore.getState().performanceTier);
    return useAppStore.subscribe((state) => state.performanceTier, (tier) => material.setTier(tier));
  }, [material]);

  useEffect(
    () => () => {
      target.dispose();
      material.dispose();
    },
    [target, material],
  );

  useFrame(({ gl, camera }) => {
    if (frame.current++ % UPDATE_EVERY !== 0) return;
    material.setOffset(camera.position.x * PARALLAX, camera.position.y * PARALLAX);
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(target);
    gl.render(stage, camera);
    gl.setRenderTarget(previous);
  });

  return <mesh geometry={geometry} material={composite} frustumCulled={false} renderOrder={-10} />;
}
