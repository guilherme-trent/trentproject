'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector2, type Group, type PerspectiveCamera } from 'three';
import type { WarmupContext } from '@/engine/scenes/defineScene';
import { TIER_PROFILES } from '@/engine/config/performance';
import { clampDelta } from '@/engine/lib/time';
import { registerDebug } from '@/engine/debug';
import { useAppStore } from '@/engine/store/useAppStore';
import { resetTransitionFx } from '../shared/transitions/fxState';
import { KIDNAP_HANDOFF } from '../shared/handoff';
import { CAMERA, STRANDS } from './awakening/config';
import { AwakeningDirector } from './awakening/director';
import { AwakeningFrame, BEETLE_SCALE, OverlayRenderer } from './awakening/frame';
import { DOME } from './awakening/geometry';
import { acquireAwakeningKit, disposeOverlay, releaseAwakeningKit, warmAwakeningKit } from './awakening/kit';
import { useAwakening } from './awakening/store';

/** GPU: compila os shaders e sobe os buffers do Despertar enquanto a hub roda (o sequestro dá o tempo). */
export async function warmup(context: WarmupContext) {
  await warmAwakeningKit(context);
}

/**
 * Cena 'realm_architecture' — O Despertar (fruto 1).
 *
 *   arrive     nasce do preto do sequestro
 *   anchor     4 fios de gosma pendem; arraste cada um até um prego (snap)
 *   fuse       os fios se fundem numa membrana negra que cobre a tela
 *   tear/rip   o cursor vira lâmina de luz; rasgue até a membrana ceder
 *   emerge     um autômato-besouro rasteja do rasgo
 *   hunt       ele vaga e foge do cursor rápido; toque o botão nas costas
 *   hologram   o título projetado (HUD) → [ Desperte ] → o equipamento
 *   glitch     o sinal é interceptado: o terminal corrompido
 *   shatter    "[ Voltar agora ]" não volta — a tela inteira estilhaça
 *   void       preto, "Brincadeira." — motor rodando, pronto para a etapa 2
 *
 * Draw calls por frame: fundo, fios (instanciado), pregos (instanciado),
 * besouro, cúpula, cone, membrana, véu — cada um colapsa no vertex shader
 * fora da sua etapa. Depois do composer: terminal OU cacos (1 draw).
 */
export default function ArchitectureScene() {
  const [kit] = useState(acquireAwakeningKit);
  const [director] = useState(() => new AwakeningDirector());
  const [frame] = useState(() => new AwakeningFrame(kit, director));
  const [overlay] = useState(() => new OverlayRenderer(kit, director));
  const root = useRef<Group>(null);
  const beetle = useRef<Group>(null);
  const get = useThree((state) => state.get);
  const canvas = useThree((state) => state.gl.domElement);
  const composer = useAppStore((state) => TIER_PROFILES[state.performanceTier].bloom !== null);

  useLayoutEffect(() => {
    resetTransitionFx();
    KIDNAP_HANDOFF.fromBlack = false;
    const camera = get().camera as PerspectiveCamera;
    camera.position.set(0, 0, CAMERA.z);
    camera.fov = CAMERA.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
    overlay.compile(get().gl, camera);
    useAwakening.setState({ stage: director.stage, lines: 0, ready: false, director });
    registerDebug('awakening', director);
    return () => {
      useAwakening.setState({ stage: 'arrive', lines: 0, ready: false, director: null });
      releaseAwakeningKit(kit);
      disposeOverlay(kit);
      overlay.dispose();
    };
  }, [get, director, kit, overlay]);

  // Ponteiro → diretor: mundo (plano z = 0) e uv de tela. Toque e mouse pelo mesmo caminho.
  useEffect(() => {
    const world = new Vector2();
    const uv = new Vector2();
    const locate = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      uv.set((event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height);
      world.set((uv.x * 2 - 1) * director.view.halfW, (uv.y * 2 - 1) * director.view.halfH);
    };
    const move = (event: PointerEvent) => {
      locate(event);
      director.pointerMove(world, uv, event.timeStamp);
    };
    const down = (event: PointerEvent) => {
      locate(event);
      director.press(world, uv, event.timeStamp);
    };
    const up = () => director.release();
    window.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [canvas, director]);

  // Maestro (antes de tudo): física, IA e etapas → uniforms.
  useFrame((state, delta) => {
    const camera = state.camera as PerspectiveCamera;
    const view = AwakeningFrame.view(camera, state.size.width / state.size.height);
    director.setView(view.halfW, view.halfH);
    director.tick(clampDelta(delta));
    frame.sync(camera, root.current, beetle.current);
  }, -1);

  // Depois do composer: terminal, captura e estilhaço, direto na tela.
  useFrame((state) => overlay.render(state.gl, state.scene, state.camera, state.size.width, state.size.height, composer), 2);

  return (
    <group ref={root}>
      <mesh geometry={kit.fullscreen} material={kit.backdrop} renderOrder={-10} frustumCulled={false} />
      <instancedMesh args={[kit.strands.geometry, kit.strands.material, STRANDS.x.length]} renderOrder={1} frustumCulled={false} />
      <instancedMesh args={[kit.nails.geometry, kit.nails.material, STRANDS.x.length]} renderOrder={2} frustumCulled={false} />
      <group ref={beetle} scale={BEETLE_SCALE}>
        <mesh geometry={kit.beetle.geometry} material={kit.beetle.material} renderOrder={3} frustumCulled={false} />
        <mesh geometry={kit.beetle.dome} material={kit.beetle.domeMaterial} position={[DOME.x, 0, DOME.z]} renderOrder={4} frustumCulled={false} />
      </group>
      <mesh geometry={kit.beam.geometry} material={kit.beam.material} renderOrder={5} frustumCulled={false} />
      <mesh geometry={kit.membrane.geometry} material={kit.membrane.material} renderOrder={50} frustumCulled={false} />
      <mesh geometry={kit.fullscreen} material={kit.veil} renderOrder={100} frustumCulled={false} />
    </group>
  );
}
