'use client';

import { useEffect, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { motion } from 'framer-motion';
import { Vector3 } from 'three';
import { registerDebug } from '@/engine/debug';
import { PILLARS, pillarCss, type Pillar } from '../../shared/pillars';
import type { HubKit } from '../kit';
import type { HubDirector } from '../director';

/** Cursor da página (fora do componente: o DOM global não é estado do React). */
const setCursor = (cursor: string) => {
  document.body.style.cursor = cursor;
};

interface FruitsProps {
  kit: HubKit;
  director: HubDirector;
  onFruitClick: (fruit: number, target: Vector3) => void;
}

/**
 * Os três Frutos Cósmicos, pendendo dos galhos da Yggdrasil (filhos do grupo
 * da árvore: balançam com ela).
 *
 * Draw calls: caules (1, material da árvore) + correntes (1, ~160 elos
 * instanciados) + cacos (1, ~660 instâncias, colapsados fora de uma
 * explosão) + gota líquida e halo por fruto (6). O raycast testa só 3 esferas invisíveis de baixa resolução —
 * nunca as 160 mil linhas da árvore nem os elos.
 */
export function Fruits({ kit, director, onFruitClick }: FruitsProps) {
  const { anchors, drop, halo, stems, chains, shards, hit } = kit.fruits;
  const [hovered, setHovered] = useState<number | null>(null);
  const get = useThree((state) => state.get);

  useFrame(() => {
    PILLARS.forEach((pillar, i) => {
      const visual = director.fruits[i];
      drop.materials[pillar.id].setState(visual.unlock, visual.breakClock, visual.hover);
      halo.materials[pillar.id].setState(kit.fruits.uniforms.uAppear.value, visual.unlock, visual.breakClock, visual.hover);
    });
  });

  useEffect(() => () => setCursor(''), []);

  // Dev: posição de cada fruto em pixels de tela, para testes automatizados de clique real.
  useEffect(() => {
    PILLARS.forEach((pillar, i) =>
      registerDebug(`fruit:${pillar.id}`, () => {
        const { camera, size, scene } = get();
        const target = scene.getObjectByName(`fruit:${pillar.id}`);
        const ndc = (target ? target.getWorldPosition(new Vector3()) : new Vector3(...anchors[i].center)).project(camera);
        return { x: ((ndc.x + 1) / 2) * size.width, y: ((1 - ndc.y) / 2) * size.height };
      }),
    );
  }, [get, anchors]);

  const setHover = (fruit: number, on: boolean) => {
    director.setHover(fruit, on);
    setHovered((current) => (on ? fruit : current === fruit ? null : current));
    setCursor(on ? 'pointer' : '');
  };

  return (
    <>
      {/* O caule é luz da árvore: mesmo material (e programa) dos galhos. */}
      <lineSegments name="fruit-stems" geometry={stems.geometry} material={kit.tree.material} frustumCulled={false} />
      <instancedMesh
        name="fruit-chains"
        args={[chains.geometry, chains.material, chains.count]}
        frustumCulled={false}
        raycast={() => null}
      />
      <instancedMesh
        name="fruit-shards"
        args={[shards.geometry, shards.material, shards.count]}
        frustumCulled={false}
        raycast={() => null}
      />
      {PILLARS.map((pillar, i) => (
        <group key={pillar.id} name={`fruit:${pillar.id}`} position={anchors[i].center}>
          <mesh geometry={drop.geometry} material={drop.materials[pillar.id]} frustumCulled={false} raycast={() => null} />
          <mesh geometry={halo.geometry} material={halo.materials[pillar.id]} frustumCulled={false} renderOrder={12} raycast={() => null} />
          <mesh
            geometry={hit.geometry}
            material={hit.material}
            visible={false}
            onPointerOver={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
              if (director.canInteract) setHover(i, true);
            }}
            onPointerOut={() => setHover(i, false)}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation();
              if (!director.canInteract) return;
              setHover(i, false);
              onFruitClick(i, event.object.getWorldPosition(new Vector3()));
            }}
          />
          {hovered === i && <FruitLabel pillar={pillar} unlocked={director.fruits[i].unlock > 0.5} />}
        </group>
      ))}
    </>
  );
}

/**
 * Rótulo do fruto sob o cursor: nome do reino em serifa clássica e o estado
 * (desperto/acorrentado). Sem caixa, sem backdrop-filter — só texto com um
 * leve halo, para não competir com a gota.
 */
function FruitLabel({ pillar, unlocked }: { pillar: Pillar; unlocked: boolean }) {
  return (
    <Html position={[0, -1.35, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="select-none whitespace-nowrap text-center [text-shadow:0_0_18px_rgba(0,0,0,0.9)]"
      >
        <p className="font-serif text-xl italic tracking-wide" style={{ color: pillarCss(pillar) }}>
          {pillar.title}
        </p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.35em] text-white/55">
          {unlocked ? 'Toque para atravessar' : 'Acorrentado'}
        </p>
      </motion.div>
    </Html>
  );
}
