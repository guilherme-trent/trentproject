'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { clampDelta, easeOutCubic, progress } from '@/engine/lib/time';
import { createFullscreenTriangle } from '@/shaders/fullscreen';
import { PILLARS } from '../shared/pillars';
import { BASE_FOV } from '../hub/framing';
import { RealmArrivalMaterial } from './RealmArrivalMaterial';

const ARRIVAL_SECONDS = 1.6;
const PILLAR = PILLARS.find((pillar) => pillar.id === 'architecture')!;

/**
 * Cena 'realm_architecture' — ESQUELETO.
 *
 * Por ora, apenas recebe a transição: a luz do nexus que encheu a tela no fim
 * do mergulho se recolhe, revelando o reino. O conteúdo do reino entra aqui.
 *
 * Contratos que esta cena já cumpre (e que o conteúdo futuro deve manter):
 *   - assume a câmera num estado conhecido (a hub a deixa com FOV padrão,
 *     mas cada cena é dona do próprio enquadramento);
 *   - recursos criados fora do JSX (geometria/material da chegada) são
 *     descartados pelo useCleanup na saída — nada a fazer aqui;
 *   - a volta à hub é responsabilidade da UI (RealmHud → setScene('hub')).
 */
export default function ArchitectureScene() {
  const get = useThree((state) => state.get);
  const aspect = useThree((state) => state.size.width / state.size.height);
  const geometry = useMemo(() => createFullscreenTriangle(), []);
  const material = useMemo(() => new RealmArrivalMaterial(PILLAR.color), []);
  const elapsed = useRef(0);

  useLayoutEffect(() => {
    const camera = get().camera as PerspectiveCamera;
    camera.position.set(0, 0, 5);
    camera.fov = BASE_FOV;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
  }, [get]);

  useFrame((_, delta) => {
    elapsed.current += clampDelta(delta);
    material.setFrame(easeOutCubic(progress(elapsed.current, 0, ARRIVAL_SECONDS)), aspect);
  });

  return (
    <>
      <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={10} />
      {/* TODO(realm_architecture): conteúdo do reino — diagramas vivos de sistemas. */}
    </>
  );
}
