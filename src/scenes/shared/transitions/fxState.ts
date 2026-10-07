import { Color, Vector2 } from 'three';
import type { RiftTransitionKind } from '../pillars';

/**
 * Estado da sobreposição de transição — a ponte entre a cena (quem decide) e o
 * efeito de pós-processamento (quem desenha). Objeto mutável e único: o
 * diretor da hub escreve uma vez por frame; o TransitionEffect lê no seu
 * `update()`. Sem React, sem eventos, sem alocação.
 */
export interface TransitionFxState {
  kind: RiftTransitionKind | null;
  /** 0 → 1, já com o easing da transição aplicado. */
  progress: number;
  /** Ponto de origem em UV de tela (0..1): de onde a rachadura/túnel nasce. */
  origin: Vector2;
  color: Color;
}

export const transitionFx: TransitionFxState = {
  kind: null,
  progress: 0,
  origin: new Vector2(0.5, 0.5),
  color: new Color(1, 1, 1),
};

/** Chamado pela cena que RECEBE a transição, no seu primeiro frame. */
export function resetTransitionFx() {
  transitionFx.kind = null;
  transitionFx.progress = 0;
}
