import { create } from 'zustand';
import type { MetropolisDirector, MetropolisStage } from './director';

/**
 * A ponte cena ↔ HUD. Escrito pelo diretor só nas TROCAS (etapa, falas):
 * a HUD re-renderiza poucas vezes na jornada inteira. O progresso contínuo
 * a HUD lê direto do diretor no próprio rAF (sem estado React por frame).
 */
interface MetropolisState {
  stage: MetropolisStage;
  lines: number;
  ready: boolean;
  director: MetropolisDirector | null;
}

export const useMetropolis = create<MetropolisState>()(() => ({ stage: 'arrive', lines: 0, ready: false, director: null }));
