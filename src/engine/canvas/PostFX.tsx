'use client';

import { HalfFloatType } from 'three';
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useAppStore } from '../store/useAppStore';
import { TIER_PROFILES } from '../config/performance';

/** Só pixels acima disto (em HDR linear) florescem: linhas e núcleos, nunca a fumaça. */
const LUMINANCE_THRESHOLD = 0.62;

/**
 * Pós-processamento global, ligado/desligado pelo tier.
 *
 * Global (no Canvas) e não por cena: os shaders do composer compilam uma vez,
 * durante o boot, em vez de engasgar a primeira cena que usar bloom. Ao cair
 * para 'low', o componente desmonta e o composer libera todos os seus render
 * targets (VRAM devolvida na hora).
 *
 * Pipeline: cena → HalfFloat RT (HDR linear) → Bloom (mipmap blur) → ACES → tela.
 * O composer zera o toneMapping do renderer enquanto montado; o ACES acontece
 * no final, sobre a imagem já com bloom — por isso o efeito ToneMapping.
 */
export function PostFX() {
  const bloom = useAppStore((state) => TIER_PROFILES[state.performanceTier].bloom);
  if (!bloom) return null;

  return (
    <EffectComposer multisampling={bloom.multisampling} frameBufferType={HalfFloatType} enableNormalPass={false}>
      <Bloom
        mipmapBlur
        luminanceThreshold={LUMINANCE_THRESHOLD}
        luminanceSmoothing={0.2}
        intensity={bloom.intensity}
        levels={bloom.levels}
        radius={0.72}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
