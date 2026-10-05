'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { clampDelta, smoothstep } from '@/engine/lib/time';
import { BEAM_HANDOFF } from '../shared/handoff';
import type { HubKit } from './kit';

const DISSOLVE_SECONDS = 1.1;

/**
 * Feixe remanescente: costura visual entre intro e hub. A árvore brota dele
 * enquanto ele se dissolve; depois desmonta e libera a própria VRAM na hora,
 * sem esperar a próxima troca de cena.
 */
export function BeamRemnant({ kit }: { kit: HubKit }) {
  const [alive, setAlive] = useState(true);
  return alive ? <BeamRemnantPass kit={kit} onDissolved={() => setAlive(false)} /> : null;
}

function BeamRemnantPass({ kit, onDissolved }: { kit: HubKit; onDissolved: () => void }) {
  const { geometry, material } = kit.remnant;
  const aspect = useThree((state) => state.size.width / state.size.height);
  const elapsed = useRef(0);
  const done = useRef(false);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((_, delta) => {
    if (done.current) return;
    elapsed.current += clampDelta(delta);
    const t = elapsed.current;
    // Estilhaça: apaga com um tremor de alta frequência na intensidade.
    const flicker = t > 0 ? 0.85 + 0.15 * Math.sin(t * 60) : 1;
    const intensity = BEAM_HANDOFF.intensity * (1 - smoothstep(0, DISSOLVE_SECONDS, t)) * flicker;
    // O relógio do feixe continua do ponto exato em que a intro parou.
    material.setFrame(BEAM_HANDOFF.time + t, intensity, aspect);

    if (t >= DISSOLVE_SECONDS) {
      done.current = true;
      onDissolved();
    }
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-1} />;
}
