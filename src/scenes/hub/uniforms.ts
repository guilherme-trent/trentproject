import { Vector2, type IUniform } from 'three';

/**
 * Uniforms COMPARTILHADOS da hub: o mesmo objeto `{ value }` é referenciado por
 * todos os materiais. Uma escrita por frame atualiza a árvore, a nebulosa e os
 * Nexus de uma vez — sem percorrer materiais, sem alocar nada.
 */
export interface HubUniforms {
  /** `clock.elapsedTime`: dirige toda a pulsação contínua nos shaders. */
  uTime: IUniform<number>;
  /** 0 → 1: a árvore brotando do feixe. */
  uGrowth: IUniform<number>;
  /** 0 → 1: progresso do mergulho num Nexus. */
  uDive: IUniform<number>;
  /** Faixa Y (espaço local) coberta pelo feixe de tela cheia: origem do crescimento. */
  uBeamSpan: IUniform<Vector2>;
  uFogNear: IUniform<number>;
  uFogFar: IUniform<number>;
}

export function createHubUniforms(): HubUniforms {
  return {
    uTime: { value: 0 },
    uGrowth: { value: 0 },
    uDive: { value: 0 },
    uBeamSpan: { value: new Vector2(-5, 5) },
    uFogNear: { value: 10 },
    uFogFar: { value: 40 },
  };
}

/** Aplica o enquadramento (muda só em resize) aos uniforms dependentes dele. */
export function applyFraming(
  uniforms: HubUniforms,
  framing: { beamSpan: readonly [number, number]; fogNear: number; fogFar: number },
) {
  uniforms.uBeamSpan.value.set(framing.beamSpan[0], framing.beamSpan[1]);
  uniforms.uFogNear.value = framing.fogNear;
  uniforms.uFogFar.value = framing.fogFar;
}
