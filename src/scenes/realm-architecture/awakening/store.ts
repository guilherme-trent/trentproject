import { create } from 'zustand';
import type { AwakeningDirector, AwakeningStage } from './director';

/**
 * A ponte cena ↔ HUD. Escrito pelo diretor só nas TROCAS (etapa, falas
 * interceptadas): a UI re-renderiza poucas vezes na cena inteira, nunca por frame.
 */
interface AwakeningState {
  stage: AwakeningStage;
  /** Falas da interceptação já visíveis. */
  lines: number;
  /** "[ Voltar agora ]" já pode ser clicado. */
  ready: boolean;
  director: AwakeningDirector | null;
}

export const useAwakening = create<AwakeningState>()(() => ({ stage: 'arrive', lines: 0, ready: false, director: null }));
