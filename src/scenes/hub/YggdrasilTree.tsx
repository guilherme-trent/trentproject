'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, type Group } from 'three';
import { useAppStore } from '@/engine/store/useAppStore';
import { TIER_PROFILES } from '@/engine/config/performance';
import { clampDelta, smoothstep } from '@/engine/lib/time';
import type { YggdrasilData } from './yggdrasil/generator';
import { treeDrawCount, type HubKit } from './kit';
import type { HubDirector } from './director';

/** Rotação autônoma (rad/s) — em torno de Y, que preserva o eixo do feixe. */
const ROTATION_SPEED = 0.04;
/** Inclinação máxima (rad) que o pointer imprime na árvore. */
const POINTER_TILT = { x: 0.12, z: 0.05 } as const;

interface YggdrasilTreeProps {
  kit: HubKit;
  data: YggdrasilData;
  director: HubDirector;
  children?: ReactNode;
}

/**
 * A árvore: UM LineSegments indexado com ~160 mil segmentos — 1 draw call.
 *
 * O componente nunca re-renderiza depois de montado. Por frame, a CPU faz
 * exatamente isto: somar um ângulo ao Group e amortecer a inclinação. Toda
 * pulsação, fluxo e balanço dos fios é GPU (TimelineMaterial).
 *
 * Orçamento por tier: um `setDrawRange` (os fios saem embaralhados do gerador,
 * então qualquer prefixo é uma amostra uniforme da árvore).
 */
export function YggdrasilTree({ kit, data, director, children }: YggdrasilTreeProps) {
  const group = useRef<Group>(null);

  useEffect(() => {
    const geometry = kit.tree.geometry;
    const apply = (tier: keyof typeof TIER_PROFILES) =>
      geometry.setDrawRange(0, treeDrawCount(data, TIER_PROFILES[tier].particleBudget));
    apply(useAppStore.getState().performanceTier);
    return useAppStore.subscribe((state) => state.performanceTier, apply);
  }, [kit, data]);

  useFrame(({ pointer }, delta) => {
    const root = group.current;
    if (!root) return;
    const dt = clampDelta(delta);
    // Durante o mergulho a árvore congela: o alvo da câmera não pode fugir.
    if (director.dive) return;

    root.rotation.y += dt * ROTATION_SPEED;
    // A inclinação só entra depois do crescimento: antes, desalinharia a árvore do feixe.
    const influence = smoothstep(0.7, 1, director.growth);
    root.rotation.x = MathUtils.damp(root.rotation.x, -pointer.y * POINTER_TILT.x * influence, 2, dt);
    root.rotation.z = MathUtils.damp(root.rotation.z, pointer.x * POINTER_TILT.z * influence, 2, dt);
  });

  return (
    <group ref={group}>
      <lineSegments geometry={kit.tree.geometry} material={kit.tree.material} frustumCulled={false} />
      {children}
    </group>
  );
}
