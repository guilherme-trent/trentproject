import { easeOutCubic, progress, smoothstep } from '@/engine/lib/time';
import { BEAM_HANDOFF } from '../shared/handoff';

/**
 * Coreografia do Big Bang como função PURA do tempo: `sampleIntro(t)` devolve
 * os valores de todos os uniforms naquele instante. Nenhum estado, nenhum
 * efeito colateral — dá para testar, plotar, ou "scrubbar" a cena num debug UI.
 *
 *   0.0s ─ ponto de luz acende e pulsa
 *   1.1s ─ carga: o ponto incha (antecipação)
 *   1.8s ─ o feixe desce do topo da tela
 *   2.0s ─ IMPACTO: a ponta do feixe atinge o centro → flash + onda de choque
 *   3.0s ─ a onda sai da tela; resta só o feixe
 *   3.1s ─ entrega para a 'hub' (BEAM_HANDOFF)
 */

const BEAM_START_Y = 0.6; // acima da borda superior (tela vai de -0.5 a 0.5)

export const INTRO_TIMELINE = {
  emberFadeIn: [0, 0.9],
  charge: [1.1, 1.85],
  strike: [1.8, 2.2],
  shockDuration: 1.0,
  end: BEAM_HANDOFF.time,
} as const;

/** Instante em que a ponta do feixe (descendo linearmente) cruza y = 0. */
export const IMPACT_TIME =
  INTRO_TIMELINE.strike[0] +
  (INTRO_TIMELINE.strike[1] - INTRO_TIMELINE.strike[0]) *
    (BEAM_START_Y / (BEAM_START_Y - BEAM_HANDOFF.headY));

export interface IntroFrame {
  ember: number;
  beamHead: number;
  beam: number;
  shock: number;
  flash: number;
  dust: number;
}

export function sampleIntro(t: number): IntroFrame {
  const sinceImpact = t - IMPACT_TIME;
  const impacted = sinceImpact >= 0;

  const fadeIn = smoothstep(INTRO_TIMELINE.emberFadeIn[0], INTRO_TIMELINE.emberFadeIn[1], t);
  const charge = smoothstep(INTRO_TIMELINE.charge[0], INTRO_TIMELINE.charge[1], t);
  const ember = fadeIn * (1 + 1.6 * charge) * (impacted ? Math.exp(-sinceImpact * 5) : 1);

  const strike = progress(t, INTRO_TIMELINE.strike[0], INTRO_TIMELINE.strike[1]);
  const beamHead = BEAM_START_Y + (BEAM_HANDOFF.headY - BEAM_START_Y) * strike;

  // O impacto injeta energia no feixe, que volta EXATAMENTE a `intensity`
  // do handoff no fim — senão a hub começaria com um salto de brilho.
  const settle = 1 - progress(t, IMPACT_TIME, INTRO_TIMELINE.end);
  const beam = strike > 0 ? BEAM_HANDOFF.intensity * (1 + (impacted ? 0.6 * settle : 0)) : 0;

  const shock = impacted ? easeOutCubic(progress(t, IMPACT_TIME, IMPACT_TIME + INTRO_TIMELINE.shockDuration)) : 0;

  return {
    ember,
    beamHead,
    beam,
    shock,
    flash: impacted ? Math.exp(-sinceImpact * 9) : 0,
    dust: impacted ? 1 - shock : 0,
  };
}
