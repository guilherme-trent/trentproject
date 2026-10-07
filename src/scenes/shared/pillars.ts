import type { SceneId } from '@/engine/config/scenes';
import { PALETTE, type RGB } from './palette';

/**
 * Como cada fruto leva ao seu reino — três linguagens de transição distintas:
 *   shatter  "Tela Trincada": a câmera não se move; a própria imagem racha e cai em cacos.
 *   warp     "Mergulho Warp": a câmera acelera para dentro do fruto, FOV extremo.
 *   swallow  "Engolido": um tecido líquido cresce do fruto e envolve a câmera.
 */
export type RiftTransitionKind = 'shatter' | 'warp' | 'swallow';

/** Os três pilares do TPM — cada um é um Fruto Cósmico da Yggdrasil que leva a um reino. */
export interface Pillar {
  id: 'architecture' | 'performance' | 'experience';
  title: string;
  tagline: string;
  color: RGB;
  realm: SceneId;
  transition: RiftTransitionKind;
  /**
   * Orientação discreta no rodapé do reino, por marco narrativo (`sceneBeat`;
   * 'start' antes do primeiro). Marco sem entrada = sem dica: a UI sai do caminho.
   */
  realmHints?: Partial<Record<string, RealmHint>>;
}

export interface RealmHint {
  /** Rótulo curto acima da dica (ex.: qual fragmento). */
  eyebrow?: string;
  text: string;
}

export const PILLARS: readonly Pillar[] = [
  {
    id: 'architecture',
    title: 'Architecture',
    tagline: 'Estruturas que seguram o caos',
    color: PALETTE.emerald,
    realm: 'realm_architecture',
    transition: 'shatter',
  },
  {
    id: 'performance',
    title: 'Performance',
    tagline: 'Cada milissegundo é uma decisão',
    color: PALETTE.sky,
    realm: 'realm_performance',
    transition: 'warp',
  },
  {
    id: 'experience',
    title: 'Experience',
    tagline: 'Tecnologia que se sente',
    color: PALETTE.gold,
    realm: 'realm_experience',
    transition: 'swallow',
  },
];

export type PillarId = Pillar['id'];

export const pillarById = (id: PillarId) => PILLARS.find((pillar) => pillar.id === id)!;
export const pillarByRealm = (scene: SceneId) => PILLARS.find((pillar) => pillar.realm === scene);

/** Converte RGB linear em `rgb()` CSS (sRGB) para a UI combinar com o shader. */
export function pillarCss({ color }: Pillar, alpha = 1): string {
  const toSrgb = (c: number) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
  return `rgb(${color.map(toSrgb).join(' ')} / ${alpha})`;
}
