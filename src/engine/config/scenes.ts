/**
 * Registro declarativo das cenas.
 *
 * Toda cena da experiência é declarada aqui ANTES de existir como componente.
 * O manifest é a fonte de verdade para três sistemas do motor:
 *   1. Preload  — antecipar o download dos assets das cenas vizinhas (`next`).
 *   2. Eviction — limpar o cache de loaders (useGLTF/useTexture) ao sair da cena.
 *   3. Tipagem  — `SceneId` é derivado daqui, então o store nunca aceita uma cena inexistente.
 */

export const SCENE_IDS = ['boot', 'intro', 'hub', 'realm_architecture'] as const;

export type SceneId = (typeof SCENE_IDS)[number];

export interface SceneManifest {
  /** URLs de modelos carregados via useGLTF. */
  gltf: readonly string[];
  /** URLs de texturas carregadas via useTexture. */
  textures: readonly string[];
  /** Cenas alcançáveis a partir desta — seus assets são pré-carregados em idle. */
  next: readonly SceneId[];
}

export const SCENE_MANIFEST: Record<SceneId, SceneManifest> = {
  boot: { gltf: [], textures: [], next: ['intro'] },
  intro: { gltf: [], textures: [], next: ['hub'] },
  hub: { gltf: [], textures: [], next: ['realm_architecture'] },
  realm_architecture: { gltf: [], textures: [], next: ['hub'] },
};
