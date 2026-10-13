'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group, PerspectiveCamera } from 'three';
import type { WarmupContext } from '@/engine/scenes/defineScene';
import { TIER_PROFILES } from '@/engine/config/performance';
import { clampDelta } from '@/engine/lib/time';
import { registerDebug } from '@/engine/debug';
import { useAppStore } from '@/engine/store/useAppStore';
import { resetTransitionFx } from '../shared/transitions/fxState';
import { RIFT_HANDOFF, RETURN_HANDOFF } from '../shared/handoff';
import { BASE_FOV } from '../hub/framing';
import { CAMERA, DRIVE } from './metropolis/config';
import { MetropolisDirector } from './metropolis/director';
import { MetropolisFrame } from './metropolis/frame';
import { acquireMetropolisKit, ensureForge, releaseMetropolisKit, warmMetropolisKit } from './metropolis/kit';
import { useMetropolis } from './metropolis/store';

/** GPU: compila os shaders e sobe os buffers da Metrópole enquanto a hub roda (o colapso dá o tempo). */
export async function warmup(context: WarmupContext) {
  await warmMetropolisKit(context);
}

const setTouchAction = (element: HTMLElement, value: string) => {
  element.style.touchAction = value;
};

/**
 * Cena 'realm_architecture' — o fruto 1.
 *
 *   arrive     nasce do escuro do outro lado da fissura, num túnel de espelhos vazio
 *   journey    segure W (ou arraste e segure): a câmera avança e a cidade de
 *              dados se desenha ao redor — e se desfaz ao retroceder (S);
 *              o manifesto se acende no espaço e fica para trás
 *   climax     fim da jornada: simetria completa, um pulso de luz percorre a
 *              metrópole, a janela do título (HUD)
 *   glitch     o título é vestido… e o sinal é invadido
 *   intercept  o terminal do administrador: [ Voltar para a Hub ]
 *   shatter    não volta — a tela estilhaça em gravidade zero e vira poeira
 *   chaos      a Forja: o ponteiro orquestra dezenas de milhares de partículas
 *   forge      100% de ressonância: implodem e condensam a Seiva Pura
 *   relic/exit a recompensa; o pulso de luz cobre a tela e a hub renasce dele
 *
 * Jornada: 5 draw calls (espelhos, linhas, pontos, manifesto, véu), cada uma
 * instanciada com os reflexos. Depois do composer: terminal OU cacos.
 */
export default function ArchitectureScene() {
  const [kit] = useState(acquireMetropolisKit);
  // Vindo pela fissura, o reino CONTINUA o quadro que se via pela fenda (mesmo progresso, mesmo relógio).
  const [director] = useState(() => {
    const created = new MetropolisDirector();
    if (RIFT_HANDOFF.fromRift) created.continueFrom(RIFT_HANDOFF.progress, RIFT_HANDOFF.time);
    return created;
  });
  const [frame] = useState(() => new MetropolisFrame(kit, director));
  const gl = useThree((state) => state.gl);
  // A forja já vem aquecida da hub; chegando sem warmup, nasce aqui (uma vez por kit).
  const [forge] = useState(() => ensureForge(kit, gl));
  const root = useRef<Group>(null);
  const get = useThree((state) => state.get);
  const canvas = useThree((state) => state.gl.domElement);
  const composer = useAppStore((state) => TIER_PROFILES[state.performanceTier].bloom !== null);

  useLayoutEffect(() => {
    resetTransitionFx();
    RIFT_HANDOFF.fromRift = false;
    const camera = get().camera as PerspectiveCamera;
    camera.fov = CAMERA.fov;
    camera.near = CAMERA.near;
    camera.far = CAMERA.far;
    camera.updateProjectionMatrix();
    // Rede de segurança (chegada sem warmup): no caminho normal os programas já existem e isto é instantâneo.
    kit.overlay.compile(get().gl, camera);
    forge.compile(get().gl, camera);
    useMetropolis.setState({
      stage: director.stage,
      lines: 0,
      ready: false,
      director,
    });
    registerDebug('metropolis', director);
    return () => {
      // Devolve a lente padrão do motor (a forja termina com o FOV fechado).
      camera.fov = BASE_FOV;
      camera.near = 0.1;
      camera.updateProjectionMatrix();
      useMetropolis.setState({
        stage: 'arrive',
        lines: 0,
        ready: false,
        director: null,
      });
      releaseMetropolisKit(kit);
      kit.overlay.dispose();
      forge.dispose();
    };
  }, [get, director, kit, forge]);

  // Pilotagem por SEGURAR: W/↑ avança e S/↓ retrocede; no toque, arrastar para cima (ou baixo) e
  // segurar. O ponteiro também alimenta o atrator da Etapa 2. A página não rola.
  useEffect(() => {
    const held = new Set<string>();
    let touch: { id: number; y: number } | null = null;
    const forwardKeys = ['w', 'arrowup'];
    const backKeys = ['s', 'arrowdown'];
    const syncKeys = () =>
      director.setKeyThrottle((forwardKeys.some((k) => held.has(k)) ? 1 : 0) - (backKeys.some((k) => held.has(k)) ? 1 : 0));
    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (![...forwardKeys, ...backKeys].includes(key)) return;
      event.preventDefault();
      held.add(key);
      syncKeys();
    };
    const keyUp = (event: KeyboardEvent) => {
      held.delete(event.key.toLowerCase());
      syncKeys();
    };
    const releaseAll = () => {
      held.clear();
      syncKeys();
      director.setTouchThrottle(0);
      touch = null;
    };

    const feed = (event: PointerEvent, active: boolean) =>
      director.pointerAt(event.clientX / window.innerWidth, 1 - event.clientY / window.innerHeight, event.timeStamp, active);
    const down = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      feed(event, true);
      touch = { id: event.pointerId, y: event.clientY };
    };
    const move = (event: PointerEvent) => {
      // Mouse: o atrator segue sempre o cursor. Toque: só enquanto o dedo encosta.
      if (event.pointerType === 'mouse') {
        feed(event, true);
        return;
      }
      feed(event, touch !== null);
      if (!touch || event.pointerId !== touch.id) return;
      // Acelerador analógico: quanto mais acima do ponto de toque, mais rápido; parado ali, mantém.
      const drag = (touch.y - event.clientY) / window.innerHeight;
      const amount = Math.max(0, Math.abs(drag) - DRIVE.dragDead) / DRIVE.dragRange;
      director.setTouchThrottle(Math.sign(drag) * Math.min(1, amount));
    };
    const up = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      director.pointerLeave();
      director.setTouchThrottle(0);
      touch = null;
    };
    setTouchAction(canvas, 'none');
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', releaseAll);
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      setTouchAction(canvas, '');
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', releaseAll);
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      releaseAll();
    };
  }, [canvas, director]);

  // Maestro (antes de tudo): acelerador → etapas → câmera e uniforms.
  useFrame((state, delta) => {
    const dt = clampDelta(delta);
    director.tick(dt);
    const camera = state.camera as PerspectiveCamera;
    frame.sync(camera, root.current, state.size.width / state.size.height, state.size.height * state.viewport.dpr);
    frame.syncForge(camera, forge, kit.overlay.capture, kit.overlay.field, state.size.width, state.size.height, dt);
    if (director.consumeExit()) {
      RETURN_HANDOFF.fromPulse = true; // a hub nasce do mesmo escuro, revelada pelo pulso
      useAppStore.getState().setScene('hub');
    }
  }, -1);

  // Depois do composer: terminal, captura e estilhaço, direto na tela.
  useFrame((state) => kit.overlay.render(director, state.gl, state.scene, state.camera, state.size.width, state.size.height, composer), 2);

  return (
    <>
      <group ref={root}>
        <mesh geometry={kit.surfaces.geometry} material={kit.surfaces.material} renderOrder={-10} frustumCulled={false} />
        <lineSegments geometry={kit.lines.geometry} material={kit.lines.material} renderOrder={1} frustumCulled={false} />
        <points geometry={kit.points.geometry} material={kit.points.material} renderOrder={2} frustumCulled={false} />
        <mesh geometry={kit.phrases.geometry} material={kit.phrases.material} renderOrder={3} frustumCulled={false} />
      </group>
      {/* A Etapa 2 vive fora do túnel (que some na falha). */}
      <primitive object={forge.trails} dispose={null} />
      <primitive object={forge.sap} dispose={null} />
      <mesh geometry={kit.veil.geometry} material={kit.veil.material} renderOrder={100} frustumCulled={false} />
      <mesh geometry={kit.veil.geometry} material={kit.pulse.material} renderOrder={101} frustumCulled={false} />
    </>
  );
}
