'use client';

import { resetRitual } from '@/engine/store/useProgressStore';

/**
 * QA: recomeça o ritual do zero (apaga a progressão salva e recarrega).
 * Minúsculo e discreto no canto inferior direito da hub — ferramenta de teste,
 * não parte da experiência.
 */
export function ResetRitualButton() {
  return (
    <button
      type="button"
      onClick={resetRitual}
      className="pointer-events-auto absolute bottom-3 right-3 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.3em] text-white/25 transition-colors hover:text-white/70 focus-visible:text-white/70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/30"
    >
      Reset Ritual
    </button>
  );
}
