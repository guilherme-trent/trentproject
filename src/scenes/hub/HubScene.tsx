'use client';

import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { getConstellation, prepareConstellation } from './constellationLoader';
import { computeHubFraming } from './framing';
import { Constellation } from './Constellation';
import { BeamRemnant } from './BeamRemnant';
import { HubCameraRig } from './HubCameraRig';

const DEFAULT_FOV = 45;

/**
 * Executado pelo defineScene ANTES da montagem — na prática, durante a intro
 * (o SceneRouter pré-carrega a próxima cena). Quando o feixe estilhaça, o
 * grafo já está pronto e a hub monta no mesmo frame.
 */
export async function prepare() {
  await prepareConstellation();
}

/**
 * Cena 'hub' — A Constelação Neural.
 *
 *   BeamRemnant   o feixe da intro, dissolvendo (costura da transição)
 *   Constellation nós + sinapses explodindo do feixe e girando
 *   HubCameraRig  parallax pelo pointer + deriva + aproximação lenta
 */
export default function HubScene() {
  const data = getConstellation();
  const aspect = useThree((state) => state.size.width / state.size.height);
  const fov = useThree((state) => ('fov' in state.camera ? state.camera.fov : DEFAULT_FOV));
  const framing = useMemo(() => computeHubFraming(aspect, fov, data.radius), [aspect, fov, data.radius]);

  return (
    <>
      <HubCameraRig distance={framing.distance} />
      <Constellation data={data} framing={framing} />
      <BeamRemnant />
    </>
  );
}
