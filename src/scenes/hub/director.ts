import { Vector3 } from 'three';
import type { SceneId } from '@/engine/config/scenes';
import type { Pillar } from '../shared/pillars';
import type { HubUniforms } from './uniforms';

/** Duração real (s) do crescimento feixe → árvore. */
export const GROWTH_SECONDS = 3.4;
/** Duração do mergulho num Nexus Point. */
export const DIVE_SECONDS = 1.9;
/** Distância (unidades de mundo) em que a câmera para diante da luz do nexus. */
const DIVE_STANDOFF = 0.32;

export type HubArrival = 'beam' | 'return';

export interface Dive {
  pillar: Pillar & { realm: SceneId };
  /** Centro do nexus (mundo), congelado no clique. */
  target: Vector3;
  /** Posição da câmera no clique. */
  from: Vector3;
  /** Ponto final da câmera: logo diante da luz, na linha de visão original. */
  approach: Vector3;
  startedAt: number | null;
}

/**
 * O diretor da hub: a coreografia inteira, fora do React.
 *
 * Componentes não guardam estado de animação; eles leem o diretor dentro de
 * `useFrame`. O diretor escreve os uniforms compartilhados (uma vez por frame)
 * e decide quando a interação está liberada e quando o mergulho terminou.
 * Lógica pura e testável, sem re-renders.
 */
export class HubDirector {
  private growthClock = 0;
  private diveProgress = 0;
  dive: Dive | null = null;

  constructor(
    private readonly uniforms: HubUniforms,
    arrival: HubArrival,
  ) {
    // Voltando de um reino: a árvore já está de pé.
    if (arrival === 'return') this.growthClock = GROWTH_SECONDS;
  }

  /**
   * Avança a coreografia. `elapsedTime` (clock do R3F) dirige a pulsação
   * contínua; `delta` (com clamp) dirige o crescimento, que pausa com a aba oculta.
   * @returns a cena de destino quando o mergulho termina, senão `null`
   */
  tick(elapsedTime: number, delta: number): SceneId | null {
    this.uniforms.uTime.value = elapsedTime;
    this.growthClock = Math.min(this.growthClock + delta, GROWTH_SECONDS);
    this.uniforms.uGrowth.value = this.growthClock / GROWTH_SECONDS;

    if (!this.dive) return null;
    this.dive.startedAt ??= elapsedTime;
    const previous = this.diveProgress;
    this.diveProgress = Math.min((elapsedTime - this.dive.startedAt) / DIVE_SECONDS, 1);
    this.uniforms.uDive.value = this.diveProgress;
    return previous < 1 && this.diveProgress >= 1 ? this.dive.pillar.realm : null;
  }

  get growth() {
    return this.growthClock / GROWTH_SECONDS;
  }

  get progressOfDive() {
    return this.diveProgress;
  }

  /** Hover e clique só depois que a árvore brotou, e nunca durante um mergulho. */
  get canInteract() {
    return this.growth >= 1 && !this.dive;
  }

  focusFor(pillarId: Pillar['id']) {
    return this.dive?.pillar.id === pillarId ? this.diveProgress : 0;
  }

  beginDive(pillar: Pillar, target: Vector3, cameraPosition: Vector3): boolean {
    if (!this.canInteract || !pillar.realm) return false;
    const toCamera = cameraPosition.clone().sub(target).normalize();
    this.dive = {
      pillar: { ...pillar, realm: pillar.realm },
      target: target.clone(),
      from: cameraPosition.clone(),
      approach: target.clone().addScaledVector(toCamera, DIVE_STANDOFF),
      startedAt: null,
    };
    return true;
  }
}
