'use client';

import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { prepareAudio } from '@/engine/audio/audioEngine';
import { runWhenIdle } from '@/engine/lib/idle';
import { ignite } from '@/engine/ignition';

/**
 * Tela de ignição. A tela inteira é o alvo do toque (um único <button>),
 * então funciona igual com mouse, toque, Enter e Espaço.
 *
 * O clique dispara `ignite()` (desbloqueio de áudio + troca para 'intro'),
 * que precisa rodar síncrono dentro do gesto. A saída suave deste botão
 * acontece sozinha: o UIOverlay deriva a view do store e o AnimatePresence
 * executa o `exit` abaixo.
 *
 * O fundo é transparente: o preto vem do Canvas, permitindo que a cena 'boot'
 * renderize algo sutil atrás do texto no futuro sem mudar a UI.
 */
export function StartPrompt() {
  const reduceMotion = useReducedMotion();

  // Enquanto o usuário lê o convite, o backend de áudio inicializa em idle.
  useEffect(() => runWhenIdle(() => void prepareAudio(), 2000), []);

  return (
    <motion.button
      type="button"
      autoFocus
      onClick={ignite}
      className="group pointer-events-auto absolute inset-0 flex cursor-pointer items-center justify-center outline-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 1.2, ease: 'easeOut' } }}
      exit={{ opacity: 0, transition: { duration: 0.8, ease: 'easeIn' } }}
    >
      <motion.span
        className="px-6 text-center text-xs font-light uppercase tracking-[0.4em] text-white/90 [text-shadow:0_0_6px_rgba(255,255,255,0.75),0_0_20px_rgba(186,230,253,0.45),0_0_42px_rgba(125,211,252,0.25)] group-focus-visible:text-white sm:text-sm"
        // Respiração via opacity (compositor) em vez de animar text-shadow (repaint a cada frame).
        animate={reduceMotion ? undefined : { opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        Toque para iniciar a centelha
      </motion.span>
    </motion.button>
  );
}
