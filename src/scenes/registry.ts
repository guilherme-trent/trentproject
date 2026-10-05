import { defineScene, type SceneDefinition } from '@/engine/scenes/defineScene';
import type { SceneId } from '@/engine/config/scenes';

/**
 * Registro cena → módulo. Cada entrada é um chunk JS separado, baixado só
 * quando a cena (ou sua antecessora, via preload) é visitada.
 * Cenas ausentes renderizam vazio ('boot' é só o Canvas preto sob a UI).
 */
export const SCENES: Partial<Record<SceneId, SceneDefinition>> = {
  intro: defineScene(() => import('./intro/IntroScene')),
  hub: defineScene(() => import('./hub/HubScene')),
};
