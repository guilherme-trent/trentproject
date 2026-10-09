'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { useHubDialogue, type DialogueLine } from '@/scenes/hub/dialogue';

/** Intervalo entre palavras: a fala chega no ritmo de quem pensa antes de falar. */
const WORD_STAGGER = 0.075;

const line: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: WORD_STAGGER, delayChildren: 0.35 } },
};

/** Só opacity e transform (compositor): animar `filter: blur` por palavra repintava o texto sobre o canvas a cada frame — e a montagem custava >100 ms. */
const word: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } },
};

/**
 * A voz da Yggdrasil — HTML sobre o WebGL, cinematográfico e etéreo.
 *
 *   - um fio de luz se abre acima da fala;
 *   - as palavras surgem uma a uma, subindo e acendendo (só opacity e
 *     transform: nada de filter/backdrop-filter sobre o canvas, que
 *     repinta a cada frame — medido);
 *   - as escolhas só aparecem quando a fala termina;
 *   - falas sem escolha somem sozinhas (`holdMs`).
 * A legibilidade vem de uma vinheta radial escura (gradiente puro), não de caixa.
 */
export function TreeDialogue() {
  const current = useHubDialogue((state) => state.line);
  const dismiss = useHubDialogue((state) => state.dismiss);

  useEffect(() => {
    if (!current?.holdMs) return;
    const timer = window.setTimeout(() => {
      if (useHubDialogue.getState().line === current) dismiss();
    }, current.holdMs);
    return () => window.clearTimeout(timer);
  }, [current, dismiss]);

  return (
    <AnimatePresence mode="wait">
      {current && <Speech key={current.id} line={current} />}
    </AnimatePresence>
  );
}

function Speech({ line: speech }: { line: DialogueLine }) {
  const choose = useHubDialogue((state) => state.choose);
  const reduceMotion = useReducedMotion();
  const words = speech.text.split(' ');
  const choicesDelay = reduceMotion ? 0.2 : 0.35 + words.length * WORD_STAGGER + 0.5;

  return (
    <motion.div
      role="dialog"
      aria-live="polite"
      aria-label={`${speech.speaker}: ${speech.text}`}
      className="absolute inset-x-0 bottom-[max(9%,env(safe-area-inset-bottom))] flex justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.6 } }}
      exit={{ opacity: 0, y: -12, transition: { duration: 0.6, ease: 'easeIn' } }}
    >
      {/* Vinheta: escurece o céu atrás da fala, sem caixa. */}
      <div className="pointer-events-none absolute inset-x-0 -bottom-[12vh] h-[52vh] bg-[radial-gradient(ellipse_55%_60%_at_50%_70%,rgba(0,0,0,0.78),transparent)]" />

      <div className="relative max-w-3xl text-center">
        <motion.div
          className="mx-auto mb-5 flex items-center justify-center gap-4 font-mono text-[10px] uppercase tracking-[0.55em] text-emerald-200/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.15, duration: 0.8 } }}
        >
          <motion.span
            className="h-px w-16 origin-right bg-gradient-to-l from-emerald-200/60 to-transparent"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1, transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] } }}
          />
          {speech.speaker}
          <motion.span
            className="h-px w-16 origin-left bg-gradient-to-r from-emerald-200/60 to-transparent"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1, transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] } }}
          />
        </motion.div>

        <motion.p
          // O tamanho acompanha a ALTURA da tela: num celular deitado (largura de desktop,
          // 390px de altura) o tamanho de desktop cobria a árvore inteira.
          className="font-serif text-[clamp(17px,4.4vh,26px)] font-light italic leading-[1.35] text-white/90 [text-shadow:0_0_24px_rgba(110,231,183,0.25)] sm:text-[clamp(17px,4.4vh,34px)]"
          variants={reduceMotion ? undefined : line}
          initial="hidden"
          animate="visible"
        >
          {words.map((text, i) => (
            <motion.span key={i} className="inline-block whitespace-pre" variants={reduceMotion ? undefined : word}>
              {text}
              {i < words.length - 1 ? ' ' : ''}
            </motion.span>
          ))}
        </motion.p>

        {speech.choices && (
          <motion.div
            className="mt-[clamp(14px,4vh,36px)] flex items-center justify-center gap-10"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { delay: choicesDelay, duration: 0.7 } }}
          >
            {speech.choices.map((choice, i) => (
              <button
                key={choice.action}
                type="button"
                autoFocus={i === 0}
                onClick={() => choose(choice.action)}
                className="group pointer-events-auto relative px-2 py-2 font-mono text-[12px] uppercase tracking-[0.45em] text-white/60 transition-colors duration-300 hover:text-white focus-visible:text-white focus-visible:outline-none"
              >
                <span className="inline-block text-emerald-200/40 transition-transform duration-300 group-hover:-translate-x-1.5 group-focus-visible:-translate-x-1.5">[</span>
                <span className="mx-3">{choice.label}</span>
                <span className="inline-block text-emerald-200/40 transition-transform duration-300 group-hover:translate-x-1.5 group-focus-visible:translate-x-1.5">]</span>
                <span className="absolute inset-x-4 -bottom-0.5 h-px origin-center scale-x-0 bg-gradient-to-r from-transparent via-emerald-200/80 to-transparent transition-transform duration-500 group-hover:scale-x-100 group-focus-visible:scale-x-100" />
              </button>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
