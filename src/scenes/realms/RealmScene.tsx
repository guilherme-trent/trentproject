'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { clampDelta, easeOutCubic, progress } from '@/engine/lib/time';
import { createFullscreenTriangle } from '@/shaders/fullscreen';
import { pillarById, type PillarId } from '../shared/pillars';
import { resetTransitionFx } from '../shared/transitions/fxState';
import { BASE_FOV } from '../hub/framing';
import { ARRIVAL_SECONDS, RealmArrivalMaterial } from './RealmArrivalMaterial';

/**
 * A chegada a um reino: continua, nesta cena, o efeito de transição que
 * trouxe o usuário (ver RealmArrivalMaterial) e, no primeiro frame, desliga a
 * sobreposição de pós-processamento da hub. Todo reino a inclui.
 */
export function RealmArrival({ pillarId }: { pillarId: PillarId }) {
  const pillar = pillarById(pillarId);
  const aspect = useThree((state) => state.size.width / state.size.height);
  const geometry = useMemo(() => createFullscreenTriangle(), []);
  const material = useMemo(() => new RealmArrivalMaterial(pillar.color, pillar.transition), [pillar]);
  const elapsed = useRef(0);

  useLayoutEffect(() => resetTransitionFx(), []);

  useFrame((_, delta) => {
    elapsed.current += clampDelta(delta);
    const k = easeOutCubic(progress(elapsed.current, 0, ARRIVAL_SECONDS[pillar.transition]));
    material.setFrame(k, aspect, elapsed.current);
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={100} />;
}

/**
 * Esqueleto de reino ainda sem conteúdo: a chegada + uma câmera em estado conhecido.
 *
 * Contratos que o conteúdo de cada reino deve manter:
 *   - incluir <RealmArrival /> (continuidade da transição);
 *   - assumir a câmera num estado conhecido (cada cena é dona do enquadramento);
 *   - recursos criados fora do JSX são descartados pelo useCleanup na saída;
 *   - a volta à hub é da UI (RealmHud → setScene('hub')).
 */
export function RealmScene({ pillarId }: { pillarId: PillarId }) {
  const get = useThree((state) => state.get);

  useLayoutEffect(() => {
    const camera = get().camera as PerspectiveCamera;
    camera.position.set(0, 0, 5);
    camera.fov = BASE_FOV;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
  }, [get]);

  return (
    <>
      <RealmArrival pillarId={pillarId} />
      {/* TODO(reino): conteúdo do reino entra aqui. */}
    </>
  );
}
