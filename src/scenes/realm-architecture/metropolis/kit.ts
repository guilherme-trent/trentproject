import {
  type WebGLRenderer,
  BufferAttribute,
  BufferGeometry,
  InstancedBufferGeometry,
  LineSegments,
  Mesh,
  PlaneGeometry,
  Points,
  type Object3D,
} from 'three';
import { warmGpuSliced } from '@/engine/gl/warmup';
import type { WarmupContext } from '@/engine/scenes/defineScene';
import { useAppStore } from '@/engine/store/useAppStore';
import { debugLog } from '@/engine/debug';
import { createFullscreenTriangle } from '@/shaders/fullscreen';
import { PulseWipeMaterial } from '../../shared/PulseWipeMaterial';
import { PHRASES } from './config';
import { getCity, prepareCity } from './city';
import { CityLinesMaterial, CityPointsMaterial, LandingMaterial, MirrorSurfaceMaterial, MIRROR_COUNT, PHRASE_MIRRORS, PhraseMaterial } from './materials';
import { PhraseAtlas } from './phrases';
import { OverlayRenderer } from './overlay';
import { ParticleForge } from './forge';

/**
 * Todos os recursos de GPU da Metrópole, como objetos three.js puros:
 * aquecidos durante a hub (o colapso de tinta dura ~2,6s), adotados pela
 * cena. Draw calls: 2 espelhos (1 instanciado), cidade em linhas (1 × 5
 * cópias), partículas (1 × 5), manifesto (1 × 12), véu — 5 no total.
 */
export interface MetropolisKit {
  surfaces: { geometry: InstancedBufferGeometry; material: MirrorSurfaceMaterial };
  lines: { geometry: InstancedBufferGeometry; material: CityLinesMaterial };
  points: { geometry: InstancedBufferGeometry; material: CityPointsMaterial };
  phrases: { geometry: InstancedBufferGeometry; material: PhraseMaterial; atlas: PhraseAtlas };
  /** O pouso: a luz da fissura se dissipando sobre o túnel (triângulo de tela cheia, compartilhado com o pulso). */
  veil: { geometry: BufferGeometry; material: LandingMaterial };
  /** A saída: o pulso de luz que cobre a tela (a hub renasce do mesmo pulso). */
  pulse: { material: PulseWipeMaterial };
  /** Terminal e estilhaço: desenhados FORA do grafo (depois do composer) — a cena os descarta. */
  overlay: OverlayRenderer;
  /** A Etapa 2 (GPGPU): precisa do renderer, então nasce no aquecimento ou na montagem (ensureForge). */
  forge: ParticleForge | null;
}

function instanced(source: BufferGeometry, count: number) {
  const geometry = new InstancedBufferGeometry().copy(source as InstancedBufferGeometry);
  geometry.instanceCount = count;
  source.dispose();
  return geometry;
}

export function createMetropolisKit(): MetropolisKit {
  const city = getCity();
  const lines = new InstancedBufferGeometry();
  lines.setAttribute('position', new BufferAttribute(city.lines.position, 3));
  lines.setAttribute('aFrom', new BufferAttribute(city.lines.from, 3));
  lines.setAttribute('aTime', new BufferAttribute(city.lines.time, 2));
  lines.setAttribute('aMeta', new BufferAttribute(city.lines.meta, 2));
  lines.instanceCount = MIRROR_COUNT;

  const points = new InstancedBufferGeometry();
  points.setAttribute('position', new BufferAttribute(city.points.position, 3));
  points.setAttribute('aFrom', new BufferAttribute(city.points.from, 3));
  points.setAttribute('aTime', new BufferAttribute(city.points.time, 2));
  points.setAttribute('aSeed', new BufferAttribute(city.points.seed, 1));
  points.instanceCount = MIRROR_COUNT;

  const atlas = new PhraseAtlas();
  atlas.layout(window.innerWidth / window.innerHeight < 0.9);

  return {
    surfaces: { geometry: instanced(new PlaneGeometry(1, 1), 2), material: new MirrorSurfaceMaterial() },
    lines: { geometry: lines, material: new CityLinesMaterial() },
    points: { geometry: points, material: new CityPointsMaterial() },
    phrases: {
      geometry: instanced(new PlaneGeometry(1, 1), PHRASES.length * PHRASE_MIRRORS),
      material: new PhraseMaterial(atlas.texture),
      atlas,
    },
    veil: { geometry: createFullscreenTriangle(), material: new LandingMaterial() },
    pulse: { material: new PulseWipeMaterial(false) },
    overlay: new OverlayRenderer(),
    forge: null,
  };
}

let current: MetropolisKit | null = null;
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Aquecimento fatiado (um programa por frame), com os MESMOS tipos de objeto da cena. */
export async function warmMetropolisKit({ gl, camera }: WarmupContext) {
  if (current) return;
  await document.fonts?.ready; // o atlas do manifesto precisa da fonte real
  // CPU em frames separados: gerar a cidade e desenhar o atlas juntos custavam ~85 ms num frame da hub.
  await prepareCity();
  await nextFrame();
  const at = performance.now();
  const kit = createMetropolisKit();
  debugLog(`[warmup] metropolis: kit + atlas ${(performance.now() - at).toFixed(0)}ms`);
  const named = <T extends Object3D>(object: T, name: string) => Object.assign(object, { name, frustumCulled: false });
  const staging: Object3D[] = [
    named(new Mesh(kit.surfaces.geometry, kit.surfaces.material), 'metropolis-mirrors'),
    named(new LineSegments(kit.lines.geometry, kit.lines.material), 'metropolis-lines'),
    named(new Points(kit.points.geometry, kit.points.material), 'metropolis-points'),
    named(new Mesh(kit.phrases.geometry, kit.phrases.material), 'metropolis-phrases'),
    named(new Mesh(kit.veil.geometry, kit.veil.material), 'metropolis-landing'),
    named(new Mesh(kit.veil.geometry, kit.pulse.material), 'metropolis-pulse'),
  ];
  await warmGpuSliced(gl, staging, camera);
  await kit.overlay.compile(gl, camera);
  await nextFrame();
  const forgeAt = performance.now();
  const forge = ensureForge(kit, gl); // CPU: alvos da gota + texturas de simulação (frame próprio)
  debugLog(`[warmup] forja (CPU + init GPGPU): ${(performance.now() - forgeAt).toFixed(0)}ms`);
  await nextFrame();
  await forge.compile(gl, camera);
  current = kit;
}

/** A forja do kit (criada uma vez: texturas de simulação + programas). */
export function ensureForge(kit: MetropolisKit, gl: WebGLRenderer) {
  return (kit.forge ??= new ParticleForge(gl, useAppStore.getState().performanceTier));
}

/** A cena adota o kit aquecido (ou cria um, se chegou sem warmup). */
export function acquireMetropolisKit(): MetropolisKit {
  return (current ??= createMetropolisKit());
}

/** Na saída: o próximo warmup cria um kit novo (o atual é descartado pelo useCleanup). */
export function releaseMetropolisKit(kit: MetropolisKit) {
  if (current === kit) current = null;
}
