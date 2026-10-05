'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAppStore } from '@/engine/store/useAppStore';
import { clampDelta } from '@/engine/lib/time';
import type { WarmupContext } from '@/engine/scenes/defineScene';
import { getYggdrasil, prepareYggdrasil } from './yggdrasil/loader';
import { acquireHubKit, releaseHubKit, warmHubKit } from './kit';
import { applyFraming } from './uniforms';
import { computeHubFraming } from './framing';
import { HubDirector, type HubArrival } from './director';
import { YggdrasilTree } from './YggdrasilTree';
import { NexusPoints } from './NexusPoints';
import { Nebula } from './Nebula';
import { BeamRemnant } from './BeamRemnant';
import { HubCameraRig } from './HubCameraRig';
import { registerDebug } from '@/engine/debug';

/** CPU: gera a árvore num Web Worker (disparado durante a intro). */
export async function prepare() {
  await prepareYggdrasil();
}

/** GPU: compila os shaders e sobe os buffers da hub enquanto a cena anterior roda. */
export async function warmup(context: WarmupContext) {
  await warmHubKit(context);
}

/**
 * Cena 'hub' — A Yggdrasil Cósmica.
 *
 *   Nebula         fumaça de simplex noise ao fundo (1 passe de tela cheia)
 *   YggdrasilTree  milhares de linhas do tempo torcidas (1 draw call)
 *   NexusPoints    os 3 pilares interativos (raycast analítico)
 *   BeamRemnant    o feixe da intro, dissolvendo enquanto a árvore brota
 *   HubCameraRig   parallax, deriva e o mergulho
 *
 * Um único useFrame "maestro" (prioridade -1: roda antes dos demais) avança o
 * HubDirector, que escreve os uniforms compartilhados. Nenhum componente da
 * hub re-renderiza por frame.
 */
export default function HubScene() {
  const data = getYggdrasil();
  const [kit] = useState(acquireHubKit);
  const [arrival] = useState<HubArrival>(() =>
    useAppStore.getState().previousScene === 'intro' ? 'beam' : 'return',
  );
  const [director] = useState(() => new HubDirector(kit.uniforms, arrival));

  const aspect = useThree((state) => state.size.width / state.size.height);
  const framing = useMemo(() => computeHubFraming(data.bounds, aspect), [data.bounds, aspect]);

  useEffect(() => applyFraming(kit.uniforms, framing), [kit, framing]);
  useEffect(() => () => releaseHubKit(kit), [kit]);
  useEffect(() => registerDebug('hub', { kit, director }), [kit, director]);

  useFrame((state, delta) => {
    const realm = director.tick(state.clock.elapsedTime, clampDelta(delta));
    if (realm) useAppStore.getState().setScene(realm);
  }, -1);

  return (
    <>
      <Nebula kit={kit} />
      <YggdrasilTree kit={kit} data={data} director={director}>
        <NexusPoints kit={kit} director={director} positions={data.nexus} />
      </YggdrasilTree>
      {arrival === 'beam' && <BeamRemnant kit={kit} />}
      <HubCameraRig framing={framing} director={director} />
    </>
  );
}
