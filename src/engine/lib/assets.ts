import { useGLTF, useTexture } from '@react-three/drei';
import { SCENE_MANIFEST, type SceneId } from '../config/scenes';

/**
 * Ponte entre o manifest de cenas e os caches de loaders do drei.
 *
 * `dispose()` libera a GPU, mas o cache de `useGLTF`/`useTexture` continua
 * segurando os objetos (e seus buffers de CPU) em memória JS. A eviction abaixo
 * fecha esse segundo vazamento.
 */

/** Dispara o download dos assets de uma cena sem montá-la. */
export function preloadScene(scene: SceneId) {
  const { gltf, textures } = SCENE_MANIFEST[scene];
  gltf.forEach((url) => useGLTF.preload(url));
  textures.forEach((url) => useTexture.preload(url));
}

/**
 * Remove do cache os assets das cenas que saíram, preservando qualquer URL
 * que a cena atual (ou suas vizinhas, já pré-carregadas) também usa.
 */
export function evictSceneAssets(outgoing: Iterable<SceneId>, current: SceneId) {
  const keep = new Set<string>();
  for (const scene of [current, ...SCENE_MANIFEST[current].next]) {
    SCENE_MANIFEST[scene].gltf.forEach((url) => keep.add(url));
    SCENE_MANIFEST[scene].textures.forEach((url) => keep.add(url));
  }

  for (const scene of outgoing) {
    if (scene === current) continue;
    SCENE_MANIFEST[scene].gltf.forEach((url) => !keep.has(url) && useGLTF.clear(url));
    SCENE_MANIFEST[scene].textures.forEach((url) => !keep.has(url) && useTexture.clear(url));
  }
}
