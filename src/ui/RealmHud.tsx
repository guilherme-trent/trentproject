'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '@/engine/store/useAppStore';
import { pillarByRealm, pillarCss } from '@/scenes/shared/pillars';
import type { SceneId } from '@/engine/config/scenes';

const returnToTree = () => useAppStore.getState().setScene('hub');

/**
 * HUD de um reino. Os reinos são jogáveis, então a UI sai do caminho:
 *   - o título é um cartão de abertura: entra, respira e some;
 *   - a dica do rodapé acompanha o marco narrativo do reino (sceneBeat) e
 *     troca com um cross-fade; marcos sem dica deixam o rodapé vazio;
 *   - a volta para a Yggdrasil fica no canto (botão ou Esc).
 * Visual sólido e sem backdrop-filter (mesmo motivo dos labels da hub:
 * blur sobre o canvas WebGL custa repintura a cada frame).
 */
export function RealmHud({ scene }: { scene: SceneId }) {
  const pillar = pillarByRealm(scene);
  const beat = useAppStore((state) => state.sceneBeat);
  const hintKey = beat ?? 'start';
  const hint = pillar?.realmHints?.[hintKey];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && returnToTree();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.6, duration: 0.8 } }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      <button
        type="button"
        onClick={returnToTree}
        className="pointer-events-auto absolute left-6 top-6 border border-white/20 bg-[#05080a] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.3em] text-white/70 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/60"
      >
        ← Yggdrasil
      </button>

      {pillar && (
        <motion.div
          className="absolute inset-x-0 top-[38%] text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, -6] }}
          transition={{ duration: 4.2, times: [0, 0.15, 0.75, 1], delay: 0.8 }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-white/50">Reino</p>
          <h1
            className="mt-3 text-2xl font-extralight uppercase tracking-[0.5em] sm:text-3xl"
            style={{ color: pillarCss(pillar) }}
          >
            {pillar.title}
          </h1>
          <p className="mt-3 text-xs text-white/60">{pillar.tagline}</p>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {hint && (
          <motion.div
            key={hintKey}
            className="absolute inset-x-0 bottom-10 px-6 text-center font-mono uppercase"
            initial={{ opacity: 0, y: 6 }}
            // A primeira dica espera o cartão de título sair; as seguintes entram já.
            animate={{ opacity: 1, y: 0, transition: { delay: beat ? 0.9 : 4.4, duration: 0.8 } }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
          >
            {hint.eyebrow && (
              <p className="mb-2 text-[10px] tracking-[0.45em]" style={{ color: pillar ? pillarCss(pillar) : undefined }}>
                {hint.eyebrow}
              </p>
            )}
            <p className="text-[11px] tracking-[0.35em] text-white/55">{hint.text}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
