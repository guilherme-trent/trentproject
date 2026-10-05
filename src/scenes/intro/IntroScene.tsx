'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAppStore } from '@/engine/store/useAppStore';
import { clampDelta } from '@/engine/lib/time';
import { createFullscreenTriangle } from '@/shaders/fullscreen';
import './BigBangMaterial'; // registra <bigBangMaterial> no catálogo do R3F (extend)
import type { BigBangMaterialImpl } from './BigBangMaterial';
import { INTRO_TIMELINE, sampleIntro } from './timeline';

/**
 * Cena 'intro' — O Big Bang.
 *
 * Toda a cena é um triângulo de tela cheia + um fragment shader. O React
 * monta uma vez e nunca mais re-renderiza: a cada frame, o useFrame avança o
 * relógio local, amostra a timeline pura e escreve nos uniforms (mutação
 * direta, zero alocação, zero reconciliação).
 *
 * Ciclo de vida da memória: a geometria é criada aqui (useMemo) e NÃO é
 * gerenciada pelo R3F — é o useCleanup que a descarta quando a 'hub' assume.
 * O material, declarado em JSX, é descartado pelo R3F no unmount e o sweep
 * do useCleanup confirma. Resultado: nada da intro sobrevive na VRAM.
 */
export default function IntroScene() {
  const aspect = useThree((state) => state.size.width / state.size.height);
  const geometry = useMemo(() => createFullscreenTriangle(), []);
  const material = useRef<BigBangMaterialImpl>(null);
  const elapsed = useRef(0);
  const handedOff = useRef(false);

  useFrame((_, delta) => {
    const uniforms = material.current;
    if (!uniforms) return;

    elapsed.current += clampDelta(delta);
    const t = Math.min(elapsed.current, INTRO_TIMELINE.end);
    const frame = sampleIntro(t);

    uniforms.uTime = t;
    uniforms.uEmber = frame.ember;
    uniforms.uBeamHead = frame.beamHead;
    uniforms.uBeam = frame.beam;
    uniforms.uShock = frame.shock;
    uniforms.uFlash = frame.flash;
    uniforms.uDust = frame.dust;

    if (!handedOff.current && elapsed.current >= INTRO_TIMELINE.end) {
      handedOff.current = true;
      useAppStore.getState().setScene('hub');
    }
  });

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <bigBangMaterial ref={material} uAspect={aspect} />
    </mesh>
  );
}
