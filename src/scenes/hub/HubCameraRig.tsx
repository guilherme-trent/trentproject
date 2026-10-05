'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { clampDelta, smoothstep } from '@/engine/lib/time';
import { BASE_FOV, type HubFraming } from './framing';
import type { HubDirector } from './director';

/** Deslocamento máximo da câmera (unidades de mundo) pelo pointer. */
const PARALLAX = { x: 2.6, y: 1.6 } as const;
/** Deriva autônoma (Lissajous lenta): a cena respira mesmo sem mouse (touch). */
const SWAY = { x: 0.7, y: 0.4, fx: 0.11, fy: 0.08 } as const;
/** Aproximação lenta após o crescimento: fração da distância percorrida. */
const DOLLY = 0.05;
const DAMPING = 2.2;
/** FOV no fim do mergulho: estreitar a lente enquanto avança intensifica a sensação de queda. */
const DIVE_FOV = 26;

/** easeInBack: um leve recuo antes de acelerar — a "tomada de fôlego" do mergulho. */
const easeInBack = (x: number, s = 1.4) => x * x * ((s + 1) * x - s);

/**
 * Câmera da hub.
 *
 * Exploração: parallax pelo pointer + deriva autônoma + aproximação lenta,
 * com `MathUtils.damp` (exponencial, independente de frame rate).
 *
 * Mergulho: a câmera vai da posição do clique até logo diante da luz do
 * nexus, com recuo inicial e aceleração, enquanto o FOV estreita e o olhar
 * migra suavemente do centro da árvore para o nexus.
 *
 * Câmera e pointer vêm do `state` do frame: mutá-los aqui é o contrato do R3F.
 * Ao desmontar, devolve o FOV padrão — a próxima cena recebe a câmera intacta.
 */
export function HubCameraRig({ framing, director }: { framing: HubFraming; director: HubDirector }) {
  const get = useThree((state) => state.get);
  const elapsed = useRef(0);
  const [motionScale] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1,
  );
  const [scratch] = useState(() => ({ look: new Vector3(), center: new Vector3() }));

  useLayoutEffect(() => {
    const camera = get().camera as PerspectiveCamera;
    camera.position.set(0, framing.targetY, framing.distance);
    camera.lookAt(0, framing.targetY, 0);
    return () => {
      const current = get().camera as PerspectiveCamera;
      current.fov = BASE_FOV;
      current.updateProjectionMatrix();
    };
  }, [get, framing.distance, framing.targetY]);

  useFrame((state, delta) => {
    const camera = state.camera as PerspectiveCamera;
    const dt = clampDelta(delta);
    elapsed.current += dt;
    scratch.center.set(0, framing.targetY, 0);

    const dive = director.dive;
    if (dive) {
      const k = director.progressOfDive;
      const travel = easeInBack(k);
      camera.position.lerpVectors(dive.from, dive.approach, travel);
      scratch.look.lerpVectors(scratch.center, dive.target, smoothstep(0, 0.45, k));
      camera.lookAt(scratch.look);
      camera.fov = MathUtils.lerp(BASE_FOV, DIVE_FOV, smoothstep(0.2, 1, k));
      camera.updateProjectionMatrix();
      return;
    }

    const t = elapsed.current;
    const influence = smoothstep(0.7, 1, director.growth) * motionScale;
    const { pointer } = state;
    const targetX = (pointer.x * PARALLAX.x + Math.sin(t * SWAY.fx) * SWAY.x) * influence;
    const targetY = framing.targetY + (pointer.y * PARALLAX.y + Math.sin(t * SWAY.fy) * SWAY.y) * influence;
    const targetZ = framing.distance * (1 - DOLLY * smoothstep(0.8, 1, director.growth));

    camera.position.x = MathUtils.damp(camera.position.x, targetX, DAMPING, dt);
    camera.position.y = MathUtils.damp(camera.position.y, targetY, DAMPING, dt);
    camera.position.z = MathUtils.damp(camera.position.z, targetZ, DAMPING, dt);
    camera.lookAt(scratch.center);
  });

  return null;
}
