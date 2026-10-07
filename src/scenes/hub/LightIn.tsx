'use client';

import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { clampDelta } from '@/engine/lib/time';
import { createFullscreenTriangle } from '@/shaders/fullscreen';
import { VeilMaterial } from '../shared/VeilMaterial';

const SECONDS = 1.6;

/**
 * A hub nasce da luz do reino (ver RETURN_HANDOFF): o mesmo branco que tomou
 * a tela no fim do Monólito se dissolve aqui, revelando a árvore. Depois
 * desmonta — o véu não fica no grafo pagando nada.
 */
export function LightIn() {
  const [alive, setAlive] = useState(true);
  return alive ? <LightVeil onDone={() => setAlive(false)} /> : null;
}

function LightVeil({ onDone }: { onDone: () => void }) {
  const geometry = useMemo(() => createFullscreenTriangle(), []);
  const [material] = useState(() => new VeilMaterial());
  const elapsed = useRef(0);
  const done = useRef(false);

  useFrame((_, delta) => {
    elapsed.current += clampDelta(delta);
    const k = Math.min(1, elapsed.current / SECONDS);
    material.setAlpha(1 - k * k * (3 - 2 * k));
    if (k >= 1 && !done.current) {
      done.current = true;
      onDone();
    }
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={200} />;
}
