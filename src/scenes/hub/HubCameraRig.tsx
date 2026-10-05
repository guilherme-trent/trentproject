'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils } from 'three';
import { clampDelta, smoothstep } from '@/engine/lib/time';

/** Deslocamento máximo da câmera (unidades de mundo) pelo pointer. */
const PARALLAX = { x: 2.2, y: 1.4 } as const;
/** Deriva autônoma (Lissajous lenta): a cena respira mesmo sem mouse (touch). */
const SWAY = { x: 0.6, y: 0.35, fx: 0.13, fy: 0.09 } as const;
/** Aproximação lenta após a montagem: fração da distância percorrida. */
const DOLLY = 0.12;
/** Rigidez do amortecimento — maior = segue o pointer mais rápido. */
const DAMPING = 2.2;

/**
 * Câmera da hub: parallax pelo pointer com matemática simples em vez de
 * CameraControls — sem listeners extras, sem estado de controle, e o
 * comportamento cabe em 10 linhas de useFrame.
 *
 * `MathUtils.damp` é exponencial e independente de frame rate: a sensação é
 * a mesma a 30 ou 144 fps. Respeita prefers-reduced-motion.
 */
export function HubCameraRig({ distance }: { distance: number }) {
  const get = useThree((state) => state.get);
  const elapsed = useRef(0);
  const [motionScale] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1,
  );

  // Posição inicial: centrada, para o eixo do feixe cair no centro da tela.
  useLayoutEffect(() => {
    const { camera } = get();
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
  }, [get, distance]);

  // Câmera e pointer vêm do `state` do frame (não de hooks): mutá-los aqui é
  // o contrato do R3F e não viola as regras de imutabilidade do React Compiler.
  useFrame(({ camera, pointer }, delta) => {
    const dt = clampDelta(delta);
    elapsed.current += dt;
    const t = elapsed.current;
    const influence = smoothstep(1.2, 3, t) * motionScale;

    const targetX = (pointer.x * PARALLAX.x + Math.sin(t * SWAY.fx) * SWAY.x) * influence;
    const targetY = (pointer.y * PARALLAX.y + Math.sin(t * SWAY.fy) * SWAY.y) * influence;
    const targetZ = distance * (1 - DOLLY * smoothstep(0.8, 7, t));

    camera.position.x = MathUtils.damp(camera.position.x, targetX, DAMPING, dt);
    camera.position.y = MathUtils.damp(camera.position.y, targetY, DAMPING, dt);
    camera.position.z = MathUtils.damp(camera.position.z, targetZ, DAMPING, dt);
    camera.lookAt(0, 0, 0);
  });

  return null;
}
