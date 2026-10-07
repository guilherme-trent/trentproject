import {
  BufferGeometry,
  DataTexture,
  InstancedMesh,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RedFormat,
  Scene,
  UnsignedByteType,
  type Object3D,
} from 'three';
import { warmGpu, warmGpuSliced } from '@/engine/gl/warmup';
import type { WarmupContext } from '@/engine/scenes/defineScene';
import { createFullscreenTriangle } from '@/shaders/fullscreen';
import { VeilMaterial } from '../../shared/VeilMaterial';
import { STRANDS, TEAR } from './config';
import {
  createBeetleGeometry,
  createDomeGeometry,
  createMembraneGeometry,
  createNailGeometry,
  createShatterGeometry,
  createStrandGeometry,
} from './geometry';
import {
  BackdropMaterial,
  BeamMaterial,
  BeetleMaterial,
  DomeMaterial,
  MembraneMaterial,
  NailMaterial,
  ShatterMaterial,
  SlimeMaterial,
  TerminalMaterial,
} from './materials';

/**
 * Todos os recursos de GPU do Despertar, como objetos three.js puros.
 * Aquecidos durante a hub (o sequestro dura ~2,4s — tempo de sobra): quando
 * o reino monta, programas e buffers já estão residentes.
 *
 * `overlay` NÃO entra no grafo da cena (é desenhado depois do composer, numa
 * cena própria): a cena o descarta explicitamente ao desmontar.
 */
export interface AwakeningKit {
  fullscreen: BufferGeometry;
  backdrop: BackdropMaterial;
  veil: VeilMaterial;
  strands: { geometry: BufferGeometry; material: SlimeMaterial };
  nails: { geometry: BufferGeometry; material: NailMaterial };
  membrane: { geometry: BufferGeometry; material: MembraneMaterial; tear: DataTexture };
  beetle: { geometry: BufferGeometry; material: BeetleMaterial; dome: BufferGeometry; domeMaterial: DomeMaterial };
  beam: { geometry: BufferGeometry; material: BeamMaterial };
  overlay: {
    quad: BufferGeometry;
    terminal: TerminalMaterial;
    shatter: { geometry: BufferGeometry; material: ShatterMaterial };
  };
}

function createTearTexture() {
  const texture = new DataTexture(new Uint8Array(TEAR.cols * TEAR.rows), TEAR.cols, TEAR.rows, RedFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createAwakeningKit(): AwakeningKit {
  const tear = createTearTexture();
  return {
    fullscreen: createFullscreenTriangle(),
    backdrop: new BackdropMaterial(),
    veil: new VeilMaterial(),
    strands: { geometry: createStrandGeometry(STRANDS.x.length), material: new SlimeMaterial() },
    nails: { geometry: createNailGeometry(STRANDS.x.length), material: new NailMaterial() },
    membrane: { geometry: createMembraneGeometry(), material: new MembraneMaterial(tear), tear },
    beetle: { geometry: createBeetleGeometry(), material: new BeetleMaterial(), dome: createDomeGeometry(), domeMaterial: new DomeMaterial() },
    beam: { geometry: new PlaneGeometry(1, 1), material: new BeamMaterial() },
    overlay: {
      quad: new PlaneGeometry(1, 1),
      terminal: new TerminalMaterial(),
      shatter: { geometry: createShatterGeometry(), material: new ShatterMaterial() },
    },
  };
}

/** O que o kit desenha fora do grafo da cena, para o descarte manual. */
export function disposeOverlay(kit: AwakeningKit) {
  kit.overlay.quad.dispose();
  kit.overlay.terminal.dispose();
  kit.overlay.shatter.geometry.dispose();
  kit.overlay.shatter.material.dispose();
}

let current: AwakeningKit | null = null;

/**
 * Aquecimento fatiado (um programa por frame). Os materiais estão inativos
 * (colapsam no vertex shader), mas o draw de 1 pixel acontece do mesmo
 * jeito: programas linkados E atributos/texturas residentes.
 */
export async function warmAwakeningKit({ gl, camera }: WarmupContext) {
  if (current) return;
  const kit = createAwakeningKit();
  const named = <T extends Object3D>(object: T, name: string) => Object.assign(object, { name, frustumCulled: false });
  const staging: Object3D[] = [
    named(new Mesh(kit.fullscreen, kit.backdrop), 'awakening-backdrop'),
    named(new Mesh(kit.fullscreen, kit.veil), 'awakening-veil'),
    named(new InstancedMesh(kit.strands.geometry, kit.strands.material, STRANDS.x.length), 'awakening-strands'),
    named(new InstancedMesh(kit.nails.geometry, kit.nails.material, STRANDS.x.length), 'awakening-nails'),
    named(new Mesh(kit.membrane.geometry, kit.membrane.material), 'awakening-membrane'),
    named(new Mesh(kit.beetle.geometry, kit.beetle.material), 'awakening-beetle'),
    named(new Mesh(kit.beetle.dome, kit.beetle.domeMaterial), 'awakening-dome'),
    named(new Mesh(kit.beam.geometry, kit.beam.material), 'awakening-beam'),
  ];
  await warmGpuSliced(gl, staging, camera);
  for (const object of staging) if (object instanceof InstancedMesh) object.dispose();

  // A sobreposição é desenhada direto na TELA (depois do composer): variante on-screen.
  const overlay = new Scene();
  overlay.add(named(new Mesh(kit.overlay.quad, kit.overlay.terminal), 'awakening-terminal'));
  overlay.add(named(new Mesh(kit.overlay.shatter.geometry, kit.overlay.shatter.material), 'awakening-shatter'));
  await warmGpu(gl, overlay, camera, false);
  current = kit;
}

/** A cena adota o kit aquecido (ou cria um, se chegou sem warmup). */
export function acquireAwakeningKit(): AwakeningKit {
  return (current ??= createAwakeningKit());
}

/** Na saída: o próximo warmup cria um kit novo (o atual é descartado pelo useCleanup + disposeOverlay). */
export function releaseAwakeningKit(kit: AwakeningKit) {
  if (current === kit) current = null;
}
