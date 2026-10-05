import { BufferAttribute, BufferGeometry, Float32BufferAttribute, LineSegments, Mesh, type Object3D, type WebGLRenderTarget } from 'three';
import { warmGpuSliced } from '@/engine/gl/warmup';
import type { WarmupContext } from '@/engine/scenes/defineScene';
import { TIER_PROFILES } from '@/engine/config/performance';
import { useAppStore } from '@/engine/store/useAppStore';
import { createFullscreenTriangle } from '@/shaders/fullscreen';
import { PILLARS, type PillarId } from '../shared/pillars';
import { createHubUniforms, type HubUniforms } from './uniforms';
import { getYggdrasil, prepareYggdrasil } from './yggdrasil/loader';
import type { YggdrasilData } from './yggdrasil/generator';
import { TimelineMaterial } from './materials/TimelineMaterial';
import { createNebulaTarget, NebulaCompositeMaterial, NebulaMaterial } from './materials/NebulaMaterial';
import { NexusMaterial } from './materials/NexusMaterial';
import { BeamRemnantMaterial } from './materials/BeamRemnantMaterial';

/** Tamanho (unidades de mundo) do billboard de um Nexus Point. */
export const NEXUS_SIZE = 1.25;

/**
 * O "kit" da hub: TODOS os recursos de GPU da cena (geometrias + materiais),
 * criados como objetos three.js puros fora do React.
 *
 * Isso permite que a hub seja aquecida durante a intro: o kit é montado numa
 * cena temporária, os shaders são compilados para a pipeline atual e os
 * buffers sobem para a GPU. Quando a hub monta, ela adota EXATAMENTE estes
 * objetos — programas e buffers já residentes, primeiro frame sem engasgo.
 *
 * Ciclo de vida da VRAM: os objetos são passados ao JSX como props, que o R3F
 * não descarta. Na saída da hub, o useCleanup os encontra no grafo e descarta.
 */
export interface HubKit {
  uniforms: HubUniforms;
  tree: { geometry: BufferGeometry; material: TimelineMaterial };
  /**
   * `material` desenha a fumaça no `target` (baixa resolução); `composite` a
   * amplia na cena. Nem o target nem `material` ficam no grafo da cena — o
   * componente Nebula os descarta explicitamente ao desmontar.
   */
  nebula: {
    geometry: BufferGeometry;
    material: NebulaMaterial;
    composite: NebulaCompositeMaterial;
    target: WebGLRenderTarget;
  };
  nexus: { geometry: BufferGeometry; materials: Record<PillarId, NexusMaterial> };
  remnant: { geometry: BufferGeometry; material: BeamRemnantMaterial };
}

function createBillboardQuad(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

function createTreeGeometry(data: YggdrasilData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('aThread', new BufferAttribute(data.thread, 3));
  geometry.setIndex(new BufferAttribute(data.index, 1));
  return geometry;
}

export function createHubKit(data: YggdrasilData): HubKit {
  const uniforms = createHubUniforms();
  const tier = useAppStore.getState().performanceTier;
  const materials = Object.fromEntries(
    PILLARS.map((pillar) => [pillar.id, new NexusMaterial(uniforms, pillar.color, NEXUS_SIZE)]),
  ) as Record<PillarId, NexusMaterial>;

  return {
    uniforms,
    tree: { geometry: createTreeGeometry(data), material: new TimelineMaterial(uniforms) },
    nebula: (() => {
      const target = createNebulaTarget();
      return {
        geometry: createFullscreenTriangle(),
        material: new NebulaMaterial(uniforms, tier),
        composite: new NebulaCompositeMaterial(target.texture),
        target,
      };
    })(),
    nexus: { geometry: createBillboardQuad(), materials },
    remnant: { geometry: createFullscreenTriangle(), material: new BeamRemnantMaterial() },
  };
}

/** Quantos índices desenhar para o tier: o prefixo dos fios é uma amostra uniforme da árvore. */
export function treeDrawCount(data: YggdrasilData, particleBudget: number): number {
  const threads = Math.max(1, Math.round(data.threadCount * particleBudget));
  return threads * (data.samplesPerThread - 1) * 2;
}

// ── Aquecimento ───────────────────────────────────────────────────────────────

let current: HubKit | null = null;

/**
 * Chamado pelo SceneRouter enquanto a cena anterior roda. Monta o kit numa
 * cena descartável, com os MESMOS tipos de objeto da hub (os parâmetros do
 * programa dependem disso), e aquece a GPU.
 */
export async function warmHubKit({ gl, camera }: WarmupContext) {
  if (current) return;
  const data = await prepareYggdrasil();
  const kit = createHubKit(data);
  kit.tree.geometry.setDrawRange(0, treeDrawCount(data, TIER_PROFILES[useAppStore.getState().performanceTier].particleBudget));

  const staging: Object3D[] = [
    Object.assign(new LineSegments(kit.tree.geometry, kit.tree.material), { name: 'tree' }),
    // A fumaça SEMPRE renderiza num render target: aquecer na variante offscreen.
    Object.assign(new Mesh(kit.nebula.geometry, kit.nebula.material), { name: 'nebula', userData: { offscreen: true } }),
    Object.assign(new Mesh(kit.nebula.geometry, kit.nebula.composite), { name: 'nebula-composite' }),
    Object.assign(new Mesh(kit.remnant.geometry, kit.remnant.material), { name: 'beam-remnant' }),
    // Os 3 Nexus compartilham o mesmo programa: aquecer um basta.
    Object.assign(new Mesh(kit.nexus.geometry, kit.nexus.materials.architecture), { name: 'nexus' }),
  ];
  for (const object of staging) object.frustumCulled = false;

  // Os wrappers são descartáveis; geometrias e materiais seguem vivos no kit.
  await warmGpuSliced(gl, staging, camera);
  current = kit;
}

/** A hub adota o kit aquecido (ou cria um, se chegou sem warmup). */
export function acquireHubKit(): HubKit {
  return (current ??= createHubKit(getYggdrasil()));
}

/** Na saída da hub: o próximo warmup criará um kit novo (o atual será descartado pelo useCleanup). */
export function releaseHubKit(kit: HubKit) {
  if (current === kit) current = null;
}
