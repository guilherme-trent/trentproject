import type { SceneId } from '@/engine/config/scenes';
import { PALETTE, type RGB } from './palette';

/**
 * Os três pilares do TPM — os Nexus Points da Yggdrasil.
 * `realm: null` = reino ainda não construído: o pilar responde ao hover mas não mergulha.
 */
export interface Pillar {
  id: 'architecture' | 'performance' | 'experience';
  title: string;
  tagline: string;
  color: RGB;
  realm: SceneId | null;
}

export const PILLARS: readonly Pillar[] = [
  {
    id: 'architecture',
    title: 'Architecture',
    tagline: 'Estruturas que seguram o caos',
    color: PALETTE.emerald,
    realm: 'realm_architecture',
  },
  {
    id: 'performance',
    title: 'Performance',
    tagline: 'Cada milissegundo é uma decisão',
    color: PALETTE.sky,
    realm: null,
  },
  {
    id: 'experience',
    title: 'Experience',
    tagline: 'Tecnologia que se sente',
    color: PALETTE.gold,
    realm: null,
  },
];

export type PillarId = Pillar['id'];

/** Converte RGB linear em `rgb()` CSS (sRGB) para a UI combinar com o shader. */
export function pillarCss({ color }: Pillar, alpha = 1): string {
  const toSrgb = (c: number) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
  return `rgb(${color.map(toSrgb).join(' ')} / ${alpha})`;
}
