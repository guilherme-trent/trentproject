'use client';

import { useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { HalfFloatType } from 'three';
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useAppStore } from '../store/useAppStore';
import { TIER_PROFILES } from '../config/performance';
import { TransitionPass } from '@/scenes/shared/transitions/TransitionEffect';

/**
 * Só pixels acima disto (em HDR linear) florescem: o tronco, os pacotes de luz
 * e os Nexus — nunca a fumaça (brilho máximo ≈ 0.15).
 *
 * O limiar só é estável porque a luminância de entrada é independente da
 * resolução: o brilho dos fios é normalizado pelo DPR (ver applyPixelRatio).
 * Antes, cada mudança de DPR movia a árvore para cima/baixo do limiar, e o
 * bloom "piscava" junto com a cor. A suavização larga evita uma borda dura
 * entre o que floresce e o que não floresce.
 */
const LUMINANCE_THRESHOLD = 0.55;
const LUMINANCE_SMOOTHING = 0.3;

/**
 * Pós-processamento global, ligado/desligado pelo tier.
 *
 * Global (no Canvas) e não por cena: os shaders do composer compilam uma vez,
 * durante o boot, em vez de engasgar a primeira cena que usar bloom. O piso de
 * direção de arte mantém o tier em 'mid' ou acima, então o bloom nunca desliga
 * em runtime; só uma GPU por software começa (e fica) em 'low', sem composer.
 *
 * Pipeline: cena → HalfFloat RT (HDR linear)
 *           → Transição (cacos / túnel / tecido; inerte fora de uma transição)
 *           → Bloom (mipmap blur) → ACES → tela.
 * O composer zera o toneMapping do renderer enquanto montado; o ACES acontece
 * no final, sobre a imagem já com bloom — por isso o efeito ToneMapping.
 */
export function PostFX() {
  const bloom = useAppStore((state) => TIER_PROFILES[state.performanceTier].bloom);
  const camera = useThree((state) => state.camera);

  // A transição é um passe PRÓPRIO (ver TransitionPass): o bloom precisa ler a
  // imagem já transformada, e o passe some do pipeline fora de uma transição.
  const [transitionPass] = useState(() => new TransitionPass(camera));
  useEffect(() => () => transitionPass.dispose(), [transitionPass]); // descarta também o efeito
  useFrame(() => transitionPass.sync());

  if (!bloom) return null;

  return (
    <EffectComposer multisampling={bloom.multisampling} frameBufferType={HalfFloatType} enableNormalPass={false}>
      {/* Antes do bloom: o brilho é calculado sobre a imagem já estilhaçada/arrastada. */}
      <primitive object={transitionPass} dispose={null} />
      <Bloom
        mipmapBlur
        luminanceThreshold={LUMINANCE_THRESHOLD}
        luminanceSmoothing={LUMINANCE_SMOOTHING}
        intensity={bloom.intensity}
        levels={bloom.levels}
        radius={0.72}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
