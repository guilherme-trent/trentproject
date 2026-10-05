'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { clampDelta, smoothstep } from '@/engine/lib/time';
import { createFullscreenTriangle } from '@/shaders/fullscreen';
import { BEAM_HANDOFF } from '../shared/handoff';
import './materials/BeamRemnantMaterial';
import type { BeamRemnantMaterialImpl } from './materials/BeamRemnantMaterial';

const DISSOLVE_SECONDS = 0.8;

/**
 * Feixe remanescente: costura visual entre intro e hub. Vive menos de um
 * segundo e se desmonta sozinho — e libera a própria geometria na saída, sem
 * esperar a próxima troca de cena.
 */
export function BeamRemnant() {
  const [alive, setAlive] = useState(true);
  return alive ? <BeamRemnantPass onDissolved={() => setAlive(false)} /> : null;
}

function BeamRemnantPass({ onDissolved }: { onDissolved: () => void }) {
  const aspect = useThree((state) => state.size.width / state.size.height);
  const geometry = useMemo(() => createFullscreenTriangle(), []);
  const material = useRef<BeamRemnantMaterialImpl>(null);
  const elapsed = useRef(0);
  const done = useRef(false);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    const uniforms = material.current;
    if (!uniforms || done.current) return;

    elapsed.current += clampDelta(delta);
    const t = elapsed.current;
    // Estilhaça: apaga rápido com um tremor de alta frequência na intensidade.
    const flicker = 0.85 + 0.15 * Math.sin(t * 60);
    uniforms.uTime = BEAM_HANDOFF.time + t; // o relógio do feixe continua do ponto exato da intro
    uniforms.uIntensity = BEAM_HANDOFF.intensity * (1 - smoothstep(0, DISSOLVE_SECONDS, t)) * (t > 0 ? flicker : 1);

    if (t >= DISSOLVE_SECONDS) {
      done.current = true;
      onDissolved();
    }
  });

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={-1}>
      <beamRemnantMaterial ref={material} uAspect={aspect} />
    </mesh>
  );
}
