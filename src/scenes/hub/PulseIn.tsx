'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { clampDelta } from '@/engine/lib/time';
import { createFullscreenTriangle } from '@/shaders/fullscreen';
import { PulseWipeMaterial } from '../shared/PulseWipeMaterial';

const SECONDS = 1.5;

/**
 * A hub nasce do escuro em que o reino terminou (ver RETURN_HANDOFF): o
 * pulso de luz corre do centro para fora e revela a árvore por trás dele.
 * Depois desmonta — e descarta o que criou (o GC de cena não o veria mais).
 */
export function PulseIn() {
  const [alive, setAlive] = useState(true);
  return alive ? <PulseReveal onDone={() => setAlive(false)} /> : null;
}

function PulseReveal({ onDone }: { onDone: () => void }) {
  const geometry = useMemo(() => createFullscreenTriangle(), []);
  const [material] = useState(() => new PulseWipeMaterial(true));
  const elapsed = useRef(0);
  const done = useRef(false);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(({ size }, delta) => {
    elapsed.current += clampDelta(delta);
    const k = Math.min(1, elapsed.current / SECONDS);
    material.setState(k < 1 ? Math.max(1e-3, 1 - (1 - k) ** 2) : 1, size.width / size.height);
    if (k >= 1 && !done.current) {
      done.current = true;
      onDone();
    }
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={200} />;
}
