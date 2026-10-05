'use client';

import { motion, useReducedMotion } from 'framer-motion';

/**
 * Loading minimalista: tela preta + um filamento de luz respirando.
 *
 * O fade-in tem DELAY proposital: cargas rápidas (< ~250ms, o caso comum em
 * trocas de cena com assets pré-carregados) nunca chegam a mostrar o loading,
 * evitando o "flash" de tela preta. Só animamos `opacity`/`transform`
 * (propriedades de compositor — não disparam layout nem paint).
 */
export function LoadingScreen() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      role="status"
      aria-live="polite"
      className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.25, duration: 0.4 } }}
      exit={{ opacity: 0, transition: { duration: 0.6, ease: 'easeOut' } }}
    >
      <span className="sr-only">Carregando</span>
      <motion.span
        aria-hidden
        className="block h-px w-24 origin-center bg-white/60 shadow-[0_0_12px_rgba(255,255,255,0.6)]"
        animate={reduceMotion ? { opacity: 0.6 } : { scaleX: [0.15, 1, 0.15], opacity: [0.3, 0.9, 0.3] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.div>
  );
}
