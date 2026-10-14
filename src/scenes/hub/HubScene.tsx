'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PerspectiveCamera, Vector3 } from 'three';
import { useAppStore } from '@/engine/store/useAppStore';
import { useProgressStore, type FruitSlot } from '@/engine/store/useProgressStore';
import { clampDelta } from '@/engine/lib/time';
import type { WarmupContext } from '@/engine/scenes/defineScene';
import { getYggdrasil, prepareYggdrasil } from './yggdrasil/loader';
import { acquireHubKit, releaseHubKit, warmHubKit } from './kit';
import { applyFraming } from './uniforms';
import { computeHubFraming } from './framing';
import { BASE_YAW, SWING } from './fruits/layout';

/** Raio do conteúdo de um fruto para o enquadramento (gaiola de correntes + halo). */
const FRUIT_FRAME_RADIUS = 0.9;
import { HubDirector, type HubArrival } from './director';
import { YggdrasilTree } from './YggdrasilTree';
import { Fruits } from './fruits/Fruits';
import { useHubDialogue } from './dialogue';
import { PILLARS } from '../shared/pillars';
import { Nebula } from './Nebula';
import { BeamRemnant } from './BeamRemnant';
import { HubCameraRig } from './HubCameraRig';
import { registerDebug } from '@/engine/debug';
import { resetTransitionFx } from '../shared/transitions/fxState';
import { RETURN_HANDOFF } from '../shared/handoff';
import { RealityRift } from './RealityRift';
import { PulseIn } from './PulseIn';

/** CPU: gera a árvore num Web Worker (disparado durante a intro). */
export async function prepare() {
  await prepareYggdrasil();
}

/** GPU: compila os shaders e sobe os buffers da hub enquanto a cena anterior roda. */
export async function warmup(context: WarmupContext) {
  await warmHubKit(context);
}

/**
 * Cena 'hub' — A Yggdrasil Cósmica.
 *
 *   Nebula         fumaça de simplex noise ao fundo (1 passe de tela cheia)
 *   YggdrasilTree  milhares de linhas do tempo torcidas (1 draw call)
 *   Fruits         os 3 Frutos Cósmicos pendendo dos galhos, acorrentados até despertarem
 *   BeamRemnant    o feixe da intro, dissolvendo enquanto a árvore brota
 *   HubCameraRig   parallax, deriva, o tremor do estilhaçar e o papel da câmera em cada transição
 *
 * Progressão: o chamado da árvore (diálogo) → "Sim" → um pulso sobe da raiz
 * pelo galho do fruto 1 e estilhaça as correntes (useProgressStore). Os
 * frutos seguintes exigem o equipamento do reino anterior.
 *
 * Um único useFrame "maestro" (prioridade -1: roda antes dos demais) avança o
 * HubDirector, que escreve os uniforms compartilhados. Nenhum componente da
 * hub re-renderiza por frame.
 */
export default function HubScene() {
  const data = getYggdrasil();
  const [kit] = useState(acquireHubKit);
  const [arrival] = useState<HubArrival>(() =>
    useAppStore.getState().previousScene === 'intro' ? 'beam' : 'return',
  );
  const [director] = useState(
    () =>
      new HubDirector(
        kit.uniforms,
        kit.fruits.uniforms,
        kit.fruits.anchors.map((anchor) => anchor.branch),
        data.mainBranchRegions,
        arrival,
      ),
  );
  const get = useThree((state) => state.get);
  // Volta de um reino que terminou no pulso: a hub nasce do mesmo escuro, revelada pelo pulso.
  // (Lido no initializer, zerado num effect: o StrictMode chama initializers duas vezes.)
  const [fromPulse] = useState(() => RETURN_HANDOFF.fromPulse);
  useEffect(() => {
    RETURN_HANDOFF.fromPulse = false;
  }, []);

  const aspect = useThree((state) => state.size.width / state.size.height);
  // O enquadramento garante os FRUTOS na tela (no celular, em retrato, é a largura que manda).
  const framing = useMemo(
    () =>
      computeHubFraming(data.bounds, aspect, {
        points: kit.fruits.anchors.map((anchor) => [anchor.center[0], anchor.center[2]] as const),
        radius: FRUIT_FRAME_RADIUS,
        yaw: [BASE_YAW - SWING, BASE_YAW + SWING],
      }),
    [data.bounds, aspect, kit],
  );
  /** Momento (relógio da cena) em que os frutos terminaram de nascer; o chamado vem logo depois. */
  const calledAt = useRef<number | null>(null);

  useEffect(() => applyFraming(kit.uniforms, framing), [kit, framing]);
  useEffect(() => () => releaseHubKit(kit), [kit]);
  // A hub nunca herda uma sobreposição de transição (ex.: voltando de um reino).
  useEffect(() => resetTransitionFx(), []);

  // Voltando de um reino não há feixe: o remanescente do kit (aquecido na GPU
  // pelo warmup) nunca entra no grafo — o useCleanup não o veria. Medido: sem
  // isto, +1 geometria residente a cada ida e volta.
  useEffect(() => {
    if (arrival === 'beam') return;
    kit.remnant.geometry.dispose();
    kit.remnant.material.dispose();
  }, [arrival, kit]);
  useEffect(
    () => registerDebug('hub', { kit, director, progress: useProgressStore, dialogue: useHubDialogue }),
    [kit, director],
  );

  // A escolha no diálogo → a árvore reage. A UI sai de cena antes do pulso (atraso do despertar).
  useEffect(
    () =>
      useHubDialogue.subscribe((state, previous) => {
        if (!state.choice || state.choice === previous.choice) return;
        if (state.choice.action === 'accept-call') director.awaken(0);
        else useHubDialogue.getState().say('refuse');
      }),
    [director],
  );

  // O primeiro fruto despertou: a árvore fala de novo, depois que a explosão assenta.
  // A travessia é do jogador: só o TOQUE no fruto abre a fissura (ver onFruitClick).
  // A Fase 1 já está pré-carregada e aquecida desde que a hub carregou — esperar o toque não custa nada.
  useEffect(() => {
    let timer = 0;
    director.setBreakListener((fruit) => {
      if (fruit === 0) timer = window.setTimeout(() => useHubDialogue.getState().say('awakened'), 1100);
    });
    return () => {
      director.setBreakListener(null);
      window.clearTimeout(timer);
      useHubDialogue.getState().dismiss();
    };
  }, [director]);

  useFrame((state, delta) => {
    const realm = director.tick(state.clock.elapsedTime, clampDelta(delta));
    if (realm) {
      useAppStore.getState().setScene(realm);
    }

    // A árvore fala logo depois que os frutos terminam de nascer: o chamado
    // (fruto 1 ainda dorme) ou, de volta com a relíquia, o convite para o fruto 2.
    if (director.growth >= 1 && director.bloomed && calledAt.current === null) calledAt.current = state.clock.elapsedTime;
    if (calledAt.current !== null && calledAt.current >= 0 && state.clock.elapsedTime - calledAt.current > 0.7) {
      calledAt.current = -1;
      const progress = useProgressStore.getState();
      if (!progress.fruit1Unlocked) useHubDialogue.getState().say('call');
      else if (progress.canUnlock(2)) useHubDialogue.getState().say('ready-2');
      // Desperto, mas a travessia ficou para depois (ex.: voltou do reino sem a Seiva): a árvore relembra.
      else if (!progress.isUnlocked(2) && !progress.equipment.includes('seiva_pura')) useHubDialogue.getState().say('awakened');
    }
  }, -1);

  /**
   * Clique num fruto: desperto → atravessa para o reino (a transição do
   * pilar); acorrentado → a árvore responde conforme a progressão.
   */
  const onFruitClick = (fruit: number, target: Vector3) => {
    const slot = (fruit + 1) as FruitSlot;
    const progress = useProgressStore.getState();
    const dialogue = useHubDialogue.getState();
    if (progress.isUnlocked(slot)) {
      dialogue.dismiss();
      // O fruto 1 sempre leva pela fissura na realidade; os outros, pela transição do pilar.
      if (fruit === 0) director.rupture();
      else director.beginTransition(PILLARS[fruit], target, get().camera as PerspectiveCamera);
    } else if (slot === 1) {
      dialogue.say('call');
    } else if (!progress.isUnlocked((slot - 1) as FruitSlot)) {
      dialogue.say('sealed-order');
    } else if (progress.canUnlock(slot)) {
      dialogue.dismiss();
      director.awaken(fruit);
    } else {
      dialogue.say(slot === 2 ? 'sealed-2' : 'sealed-3');
    }
  };

  return (
    <>
      <Nebula kit={kit} />
      <YggdrasilTree kit={kit} data={data} director={director}>
        <Fruits kit={kit} director={director} onFruitClick={onFruitClick} />
      </YggdrasilTree>
      {arrival === 'beam' && <BeamRemnant kit={kit} />}
      {fromPulse && <PulseIn />}
      <RealityRift kit={kit.rift} director={director} />
      <HubCameraRig framing={framing} director={director} />
    </>
  );
}
