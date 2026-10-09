import {
  BufferAttribute,
  BufferGeometry,
  InstancedMesh,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  SphereGeometry,
  type Object3D,
  type WebGLRenderTarget,
} from 'three';
import { warmGpuSliced } from '@/engine/gl/warmup';
import type { WarmupContext } from '@/engine/scenes/defineScene';
import { TIER_PROFILES } from '@/engine/config/performance';
import { useAppStore } from '@/engine/store/useAppStore';
import { createFullscreenTriangle } from '@/shaders/fullscreen';
import { PILLARS, type PillarId } from '../shared/pillars';
import { createHubUniforms, type HubUniforms } from './uniforms';
import { createRiftKit, RIFT_SHARDS, type RiftKit } from './RealityRift';
import { getYggdrasil, prepareYggdrasil } from './yggdrasil/loader';
import type { YggdrasilData } from './yggdrasil/generator';
import { TimelineMaterial } from './materials/TimelineMaterial';
import { createNebulaTarget, NebulaCompositeMaterial, NebulaMaterial } from './materials/NebulaMaterial';
import { BeamRemnantMaterial } from './materials/BeamRemnantMaterial';
import { computeFruitAnchors, type FruitAnchor } from './fruits/layout';
import {
  chainInstances,
  createChainGeometry,
  createDropGeometry,
  createShardGeometry,
  createStemGeometry,
  SHARDS_PER_FRUIT,
} from './fruits/geometry';
import {
  ChainMaterial,
  createFruitUniforms,
  LiquidFruitMaterial,
  FRUITS,
  HaloMaterial,
  ShardMaterial,
  type FruitUniforms,
} from './fruits/materials';

/** Raio da esfera invisível de clique de um fruto: maior que o cristal, mira confortável. */
export const FRUIT_HIT_RADIUS = 0.95;

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
  /**
   * Os Frutos Cósmicos (na ordem de PILLARS). Tudo entra no grafo da cena: o
   * useCleanup descarta na saída. Por fruto: gota líquida + halo (2 draw
   * calls); para os três: caules (1, com o MESMO material da árvore),
   * correntes (1 instanciado), cacos (1 instanciado).
   */
  fruits: {
    anchors: FruitAnchor[];
    uniforms: FruitUniforms;
    drop: { geometry: BufferGeometry; materials: Record<PillarId, LiquidFruitMaterial> };
    halo: { geometry: BufferGeometry; materials: Record<PillarId, HaloMaterial> };
    /** Desenhado com `tree.material`: o caule é luz da árvore. */
    stems: { geometry: BufferGeometry };
    chains: { geometry: BufferGeometry; material: ChainMaterial; count: number };
    shards: { geometry: BufferGeometry; material: ShardMaterial; count: number };
    hit: { geometry: BufferGeometry; material: MeshBasicMaterial };
  };
  remnant: { geometry: BufferGeometry; material: BeamRemnantMaterial };
  /** A fissura do fruto 1 (ver RealityRift). */
  rift: RiftKit;
}

function createTreeGeometry(data: YggdrasilData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('aThread', new BufferAttribute(data.thread, 4));
  geometry.setIndex(new BufferAttribute(data.index, 1));
  return geometry;
}

export function createHubKit(data: YggdrasilData): HubKit {
  const uniforms = createHubUniforms();
  const tier = useAppStore.getState().performanceTier;
  const anchors = computeFruitAnchors(data.mainBranches, PILLARS.map((pillar) => pillar.id));
  const fruitUniforms = createFruitUniforms(
    anchors.map((anchor) => anchor.center),
    PILLARS.map((pillar) => pillar.color),
  );
  const byPillar = <T,>(make: (pillar: (typeof PILLARS)[number]) => T) =>
    Object.fromEntries(PILLARS.map((pillar) => [pillar.id, make(pillar)])) as Record<PillarId, T>;

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
    fruits: {
      anchors,
      uniforms: fruitUniforms,
      drop: {
        geometry: createDropGeometry(),
        materials: byPillar((pillar) => new LiquidFruitMaterial(uniforms, fruitUniforms, pillar.color)),
      },
      halo: { geometry: new PlaneGeometry(1, 1), materials: byPillar((pillar) => new HaloMaterial(uniforms, pillar.color)) },
      stems: { geometry: createStemGeometry(anchors, data.mainBranchRegions) },
      chains: { geometry: createChainGeometry(FRUITS), material: new ChainMaterial(uniforms, fruitUniforms), count: chainInstances(FRUITS) },
      shards: { geometry: createShardGeometry(FRUITS), material: new ShardMaterial(uniforms, fruitUniforms), count: FRUITS * SHARDS_PER_FRUIT },
      hit: { geometry: new SphereGeometry(FRUIT_HIT_RADIUS, 12, 8), material: new MeshBasicMaterial() },
    },
    remnant: { geometry: createFullscreenTriangle(), material: new BeamRemnantMaterial() },
    rift: createRiftKit(),
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
    // As 3 gotas (e os 3 halos) compartilham o programa: aquecer uma basta.
    // Os caules usam o material da árvore (já aquecido acima): só o buffer sobe.
    Object.assign(new Mesh(kit.fruits.drop.geometry, kit.fruits.drop.materials.architecture), { name: 'fruit-drop' }),
    Object.assign(new Mesh(kit.fruits.halo.geometry, kit.fruits.halo.materials.architecture), { name: 'fruit-halo' }),
    Object.assign(new LineSegments(kit.fruits.stems.geometry, kit.tree.material), { name: 'fruit-stems' }),
    // Mesmo TIPO de objeto da cena (InstancedMesh): a variante do programa depende disso.
    Object.assign(new InstancedMesh(kit.fruits.chains.geometry, kit.fruits.chains.material, kit.fruits.chains.count), { name: 'fruit-chains' }),
    Object.assign(new InstancedMesh(kit.fruits.shards.geometry, kit.fruits.shards.material, kit.fruits.shards.count), { name: 'fruit-shards' }),
    // A fissura: inativa (colapsa no vertex shader), mas o draw de 1 pixel liga o programa (o driver adia o link).
    Object.assign(new Mesh(kit.rift.quad, kit.rift.materials.rift), { name: 'rift' }),
    Object.assign(new InstancedMesh(kit.rift.shardGeometry, kit.rift.materials.shards, RIFT_SHARDS), { name: 'rift-shards' }),
    Object.assign(new Points(kit.rift.sparkGeometry, kit.rift.materials.sparks), { name: 'rift-sparks' }),
  ];
  for (const object of staging) object.frustumCulled = false;

  // Os wrappers são descartáveis; geometrias e materiais seguem vivos no kit.
  await warmGpuSliced(gl, staging, camera);
  // Exceto o instanceMatrix dos InstancedMesh de aquecimento, que é DELES: libera o buffer na GPU.
  for (const object of staging) if (object instanceof InstancedMesh) object.dispose();
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
