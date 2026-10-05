'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/engine/store/useAppStore';
import { PILLARS, pillarCss } from '@/scenes/shared/pillars';
import type { SceneId } from '@/engine/config/scenes';

const returnToTree = () => useAppStore.getState().setScene('hub');

/**
 * HUD de um reino: título do pilar + volta para a Yggdrasil (botão ou Esc).
 * Fica acima do Canvas; o container do overlay é pointer-events-none, então
 * só o botão captura cliques.
 */
export function RealmHud({ scene }: { scene: SceneId }) {
  const pillar = PILLARS.find((candidate) => candidate.realm === scene);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && returnToTree();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.8, duration: 1 } }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      <button
        type="button"
        onClick={returnToTree}
        className="pointer-events-auto absolute left-6 top-6 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-white/70 backdrop-blur-xl transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/60"
      >
        ← Yggdrasil
      </button>
      {pillar && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
          <p className="text-[10px] uppercase tracking-[0.5em] text-white/40">Reino</p>
          <h1
            className="mt-3 text-2xl font-extralight uppercase tracking-[0.5em] sm:text-3xl"
            style={{ color: pillarCss(pillar), textShadow: `0 0 24px ${pillarCss(pillar, 0.6)}` }}
          >
            {pillar.title}
          </h1>
          <p className="mt-3 text-xs text-white/50">{pillar.tagline}</p>
        </div>
      )}
    </motion.div>
  );
}
