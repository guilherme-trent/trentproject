'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { motion } from 'framer-motion';
import { MathUtils, Vector3, type Mesh } from 'three';
import { clampDelta } from '@/engine/lib/time';
import { sphereRaycast } from '@/engine/gl/raycast';
import { registerDebug } from '@/engine/debug';
import { PILLARS, pillarCss, type Pillar } from '../shared/pillars';
import { NEXUS_SIZE, type HubKit } from './kit';
import type { HubDirector } from './director';

/** Raio de acerto um pouco maior que o núcleo visível: alvo confortável no mouse. */
const HIT_RADIUS = NEXUS_SIZE * 0.75;

interface NexusPointsProps {
  kit: HubKit;
  director: HubDirector;
  /** Posições (espaço local da árvore) vindas do gerador, xyz concatenados. */
  positions: Float32Array;
}

/** Os três pilares, presos às ramificações principais (filhos do Group da árvore: giram com ela). */
export function NexusPoints({ kit, director, positions }: NexusPointsProps) {
  return PILLARS.map((pillar, i) => (
    <NexusPoint
      key={pillar.id}
      pillar={pillar}
      kit={kit}
      director={director}
      position={[positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]}
    />
  ));
}

interface NexusPointProps {
  pillar: Pillar;
  kit: HubKit;
  director: HubDirector;
  position: [number, number, number];
}

function NexusPoint({ pillar, kit, director, position }: NexusPointProps) {
  const material = kit.nexus.materials[pillar.id];
  // Estado React só para montar/desmontar o label (evento raro). O brilho do
  // hover é amortecido por frame direto no uniform, fora do React.
  const [hovered, setHovered] = useState(false);
  const hoverTarget = useRef(0);
  const hoverLevel = useRef(0);
  const mesh = useRef<Mesh>(null);
  const get = useThree((state) => state.get);

  useEffect(() => () => void (document.body.style.cursor = ''), []);

  // Dev: posição do nexus em pixels de tela, para testes automatizados de hover/clique.
  useEffect(() => {
    registerDebug(`nexus:${pillar.id}`, () => {
      const { camera, size } = get();
      const ndc = mesh.current!.getWorldPosition(new Vector3()).project(camera);
      return { x: ((ndc.x + 1) / 2) * size.width, y: ((1 - ndc.y) / 2) * size.height };
    });
  }, [get, pillar.id]);

  useFrame((_, delta) => {
    hoverLevel.current = MathUtils.damp(hoverLevel.current, hoverTarget.current, 10, clampDelta(delta));
    material.setHover(hoverLevel.current);
    material.setFocus(director.focusFor(pillar.id));
  });

  const setHover = (on: boolean) => {
    hoverTarget.current = on ? 1 : 0;
    setHovered(on);
    document.body.style.cursor = on ? 'pointer' : '';
  };

  const onOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (director.canInteract) setHover(true);
  };

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const target = event.object.getWorldPosition(new Vector3());
    if (director.beginDive(pillar, target, event.camera.position)) setHover(false);
  };

  return (
    <mesh
      ref={mesh}
      position={position}
      geometry={kit.nexus.geometry}
      material={material}
      frustumCulled={false}
      renderOrder={10}
      raycast={sphereRaycast}
      userData={{ hitRadius: HIT_RADIUS }}
      onPointerOver={onOver}
      onPointerOut={() => setHover(false)}
      onClick={onClick}
    >
      {hovered && <NexusLabel pillar={pillar} />}
    </mesh>
  );
}

/**
 * Label glassmorphism. Só existe enquanto há hover: o <Html> do drei
 * reposiciona o DOM a cada frame, então não o deixamos montado à toa.
 * `pointer-events: none` impede o label de roubar o hover do próprio nexus.
 */
function NexusLabel({ pillar }: { pillar: Pillar }) {
  return (
    <Html position={[0, NEXUS_SIZE * 1.25, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="min-w-56 select-none rounded-2xl border border-white/15 bg-white/[0.07] px-5 py-3 text-center shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        style={{ boxShadow: `0 0 32px ${pillarCss(pillar, 0.25)}, inset 0 1px 0 rgb(255 255 255 / 0.12)` }}
      >
        <p className="text-[10px] uppercase tracking-[0.4em] text-white/50">Pilar</p>
        <p className="mt-1 text-sm font-light uppercase tracking-[0.3em]" style={{ color: pillarCss(pillar) }}>
          {pillar.title}
        </p>
        <p className="mt-1 text-xs text-white/70">{pillar.tagline}</p>
        <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-white/40">
          {pillar.realm ? 'Clique para mergulhar' : 'Em construção'}
        </p>
      </motion.div>
    </Html>
  );
}
