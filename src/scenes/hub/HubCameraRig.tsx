'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { clampDelta, smoothstep } from '@/engine/lib/time';
import { warpEase } from '../shared/transitions/curves';
import { BASE_FOV, lateralDrift, type HubFraming } from './framing';
import type { HubDirector } from './director';

/** Deslocamento vertical máximo da câmera (unidades de mundo) pelo pointer; o lateral vem de `lateralDrift`. */
const PARALLAX = { y: 1.6 } as const;
/** Deriva autônoma (Lissajous lenta): a cena respira mesmo sem mouse (touch). */
const SWAY = { y: 0.4, fx: 0.11, fy: 0.08 } as const;
/** Aproximação lenta após o crescimento: fração da distância percorrida. */
const DOLLY = 0.05;
const DAMPING = 2.2;

/** Warp: FOV no auge da aceleração — a periferia estica, o centro afunda (tunnel vision). */
const WARP_FOV = 150;
/** Warp: recuo antes do puxão (unidades de mundo). */
const WARP_ANTICIPATION = 0.9;
/** Shatter: amplitude do tranco de impacto quando a tela trinca. */
const SHATTER_SHAKE = 0.07;
/** Swallow: quanto a câmera é atraída para o tecido enquanto ele cresce. */
const SWALLOW_PULL = 0.18;
/** Estilhaçar das correntes: amplitude do tremor (unidades de mundo). */
const AWAKENING_SHAKE = 0.22;

/**
 * Câmera da hub.
 *
 * Exploração: em contra-plongée (ver framing.ts), com parallax pelo pointer +
 * deriva autônoma + aproximação lenta, com `MathUtils.damp` (independente de frame rate),
 * e um tremor curto quando as correntes de um fruto explodem.
 *
 * Transições — cada uma com uma relação diferente com a câmera:
 *   SHATTER  a câmera NÃO avança. Só um tranco curto de impacto: quem se move é a imagem.
 *   WARP     recua (tomada de fôlego) e é puxada pela curva Bézier agressiva até
 *            colar no rasgo, enquanto o FOV abre até 150° (tunnel vision).
 *   SWALLOW  é levemente atraída enquanto o tecido cresce e a envolve.
 *
 * Roda com prioridade -0.5: depois do diretor (-1) e antes dos frutos (0).
 * Ao desmontar, devolve o FOV padrão.
 */
export function HubCameraRig({ framing, director }: { framing: HubFraming; director: HubDirector }) {
  const get = useThree((state) => state.get);
  const elapsed = useRef(0);
  const [motionScale] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1,
  );
  const [scratch] = useState(() => ({ look: new Vector3(), center: new Vector3(), forward: new Vector3() }));

  useLayoutEffect(() => {
    const camera = get().camera as PerspectiveCamera;
    // A lente também é da hub: um reino pode devolver a câmera com outro FOV
    // (a forja da Seiva termina em ~26°, e a árvore voltava ampliada).
    camera.fov = BASE_FOV;
    camera.updateProjectionMatrix();
    camera.position.set(0, framing.cameraY, framing.distance);
    camera.lookAt(0, framing.lookY, 0);
    return () => {
      const current = get().camera as PerspectiveCamera;
      current.fov = BASE_FOV;
      current.updateProjectionMatrix();
    };
  }, [get, framing.distance, framing.cameraY, framing.lookY]);

  useFrame((state, delta) => {
    const camera = state.camera as PerspectiveCamera;
    const dt = clampDelta(delta);
    elapsed.current += dt;
    scratch.center.set(0, framing.lookY, 0);

    const active = director.transition;
    if (active) {
      const k = director.transitionProgress;
      switch (active.pillar.transition) {
        case 'shatter': {
          const shake = SHATTER_SHAKE * (1 - smoothstep(0.02, 0.25, k)) * smoothstep(0.0, 0.02, k);
          camera.position.copy(active.from);
          camera.position.x += Math.sin(elapsed.current * 91) * shake;
          camera.position.y += Math.cos(elapsed.current * 77) * shake;
          camera.lookAt(scratch.center);
          return;
        }
        case 'warp': {
          const pull = warpEase(k);
          const anticipation = Math.sin(Math.min(k / 0.4, 1) * Math.PI) * WARP_ANTICIPATION * (1 - pull);
          scratch.forward.subVectors(active.target, active.from).normalize();
          camera.position.lerpVectors(active.from, active.approach, pull).addScaledVector(scratch.forward, -anticipation);
          scratch.look.lerpVectors(scratch.center, active.target, smoothstep(0, 0.35, k));
          camera.lookAt(scratch.look);
          camera.fov = MathUtils.lerp(BASE_FOV, WARP_FOV, smoothstep(0.25, 1, pull));
          camera.updateProjectionMatrix();
          return;
        }
        case 'swallow': {
          const pull = smoothstep(0, 1, k) * SWALLOW_PULL;
          camera.position.lerpVectors(active.from, active.target, pull);
          scratch.look.lerpVectors(scratch.center, active.target, smoothstep(0, 0.5, k));
          camera.lookAt(scratch.look);
          return;
        }
      }
    }

    const t = elapsed.current;
    const influence = smoothstep(0.7, 1, director.growth) * motionScale;
    const { pointer } = state;
    // Em retrato o deslocamento lateral encolhe: os frutos ocupam a largura inteira da tela.
    const drift = lateralDrift(state.size.width / state.size.height);
    const targetX = (pointer.x * drift.parallax + Math.sin(t * SWAY.fx) * drift.sway) * influence;
    const targetY = framing.cameraY + (pointer.y * PARALLAX.y + Math.sin(t * SWAY.fy) * SWAY.y) * influence;
    const targetZ = framing.distance * (1 - DOLLY * smoothstep(0.8, 1, director.growth));

    camera.position.x = MathUtils.damp(camera.position.x, targetX, DAMPING, dt);
    camera.position.y = MathUtils.damp(camera.position.y, targetY, DAMPING, dt);
    camera.position.z = MathUtils.damp(camera.position.z, targetZ, DAMPING, dt);
    camera.lookAt(scratch.center);
    // O estilhaçar das correntes sacode a câmera (depois do lookAt: tremor, não mudança de mira).
    const shake = director.shake * director.shake * AWAKENING_SHAKE * motionScale;
    if (shake > 1e-4) {
      camera.position.x += Math.sin(t * 83) * shake;
      camera.position.y += Math.cos(t * 71) * shake;
    }
  }, -0.5);

  return null;
}
