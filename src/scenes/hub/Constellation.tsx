'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  MathUtils,
  type Group,
  type InstancedMesh,
} from 'three';
import { useAppStore } from '@/engine/store/useAppStore';
import { TIER_PROFILES, type PerformanceTier } from '@/engine/config/performance';
import { clampDelta, smoothstep } from '@/engine/lib/time';
import type { ConstellationData } from './constellation';
import type { HubFraming } from './framing';
import { ASSEMBLE_END } from './chunks/assemble.glsl';
import './materials/NodeMaterial';
import './materials/SynapseMaterial';
import type { NodeMaterialImpl } from './materials/NodeMaterial';
import type { SynapseMaterialImpl } from './materials/SynapseMaterial';

/** Duração real (s) da explosão feixe → constelação. */
const ASSEMBLE_SECONDS = 2.6;
/** Fade-in dos nós: evita que milhares deles "acendam" de uma vez sobre o feixe. */
const REVEAL_SECONDS = 0.35;
/** Rotação autônoma (rad/s) — em torno de Y, que preserva o eixo do feixe. */
const ROTATION_SPEED = 0.05;
/** Inclinação máxima (rad) que o pointer imprime na estrutura. */
const POINTER_TILT = { x: 0.18, z: 0.06 } as const;

/** Quad unitário [-1, 1]² com UV — a "tela" de cada billboard instanciado. */
function createBillboardQuad(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

interface ConstellationProps {
  data: ConstellationData;
  framing: HubFraming;
}

/**
 * A Constelação Neural: 1 draw call de nós (InstancedMesh) + 1 de sinapses
 * (LineSegments), independente de quantos milhares de elementos existam.
 *
 * Toda animação por elemento (explosão, cintilação, pulsos) roda na GPU; a CPU
 * só escreve meia dúzia de uniforms por frame e gira UM Group.
 *
 * Orçamento adaptativo: o tier de performance define quantos nós desenhar.
 * Como o grafo é prefix-closed (ver constellation.ts), isso é só
 * `mesh.count` + `setDrawRange` — nenhum buffer é realocado, nada re-renderiza.
 */
export function Constellation({ data, framing }: ConstellationProps) {
  const group = useRef<Group>(null);
  const nodes = useRef<InstancedMesh>(null);
  const nodeMaterial = useRef<NodeMaterialImpl>(null);
  const synapseMaterial = useRef<SynapseMaterialImpl>(null);
  const elapsed = useRef(0);

  // Geometrias criadas fora do JSX: o R3F não as descarta — o useCleanup sim.
  const nodeGeometry = useMemo(() => {
    const geometry = createBillboardQuad();
    geometry.setAttribute('aSeed', new InstancedBufferAttribute(data.seeds, 1));
    geometry.setAttribute('aOriginY', new InstancedBufferAttribute(data.originY, 1));
    return geometry;
  }, [data]);

  const synapseGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(data.lines.positions, 3));
    geometry.setAttribute('aOriginY', new BufferAttribute(data.lines.originY, 1));
    geometry.setAttribute('aNodeSeed', new BufferAttribute(data.lines.nodeSeed, 1));
    geometry.setAttribute('aSegmentSeed', new BufferAttribute(data.lines.segmentSeed, 1));
    geometry.setAttribute('aSide', new BufferAttribute(data.lines.side, 1));
    return geometry;
  }, [data]);

  // Matrizes finais escritas uma única vez, antes do primeiro frame.
  useLayoutEffect(() => {
    const mesh = nodes.current;
    if (!mesh) return;
    mesh.instanceMatrix.array.set(data.matrices);
    mesh.instanceMatrix.needsUpdate = true;
  }, [data]);

  // Orçamento por tier, aplicado fora do ciclo do React.
  useEffect(() => {
    const applyBudget = (tier: PerformanceTier) => {
      const count = Math.round(data.nodeCount * TIER_PROFILES[tier].particleBudget);
      if (nodes.current) nodes.current.count = count;
      synapseGeometry.setDrawRange(0, data.segmentOffsets[count] * 2);
    };
    applyBudget(useAppStore.getState().performanceTier);
    return useAppStore.subscribe((state) => state.performanceTier, applyBudget);
  }, [data, synapseGeometry]);

  useFrame(({ pointer }, delta) => {
    const dt = clampDelta(delta);
    elapsed.current += dt;
    const t = elapsed.current;

    const assemble = Math.min(t / ASSEMBLE_SECONDS, 1) * ASSEMBLE_END;
    const opacity = smoothstep(0, REVEAL_SECONDS, t);
    for (const material of [nodeMaterial.current, synapseMaterial.current]) {
      if (!material) continue;
      material.uTime = t;
      material.uAssemble = assemble;
      material.uOpacity = opacity;
    }

    const root = group.current;
    if (!root) return;
    // A influência do pointer só entra depois da explosão: inclinar o grupo
    // antes desalinharia os nós do feixe remanescente.
    const influence = smoothstep(1.2, 3, t);
    root.rotation.y += dt * ROTATION_SPEED;
    root.rotation.x = MathUtils.damp(root.rotation.x, -pointer.y * POINTER_TILT.x * influence, 2, dt);
    root.rotation.z = MathUtils.damp(root.rotation.z, pointer.x * POINTER_TILT.z * influence, 2, dt);
  });

  return (
    <group ref={group}>
      <instancedMesh ref={nodes} args={[nodeGeometry, undefined, data.nodeCount]} frustumCulled={false}>
        <nodeMaterial
          ref={nodeMaterial}
          uBeamHalfHeight={framing.beamHalfHeight}
          uFogNear={framing.fogNear}
          uFogFar={framing.fogFar}
        />
      </instancedMesh>
      <lineSegments geometry={synapseGeometry} frustumCulled={false}>
        <synapseMaterial
          ref={synapseMaterial}
          uBeamHalfHeight={framing.beamHalfHeight}
          uFogNear={framing.fogNear}
          uFogFar={framing.fogFar}
        />
      </lineSegments>
    </group>
  );
}
