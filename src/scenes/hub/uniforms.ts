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
  /** 0 → 1: imersão do Mergulho Warp — a árvore e a fumaça cedem ao túnel. */
  uWarp: IUniform<number>;
  /** Faixa Y (espaço local) coberta pelo feixe de tela cheia: origem do crescimento. */
  uBeamSpan: IUniform<Vector2>;
  uFogNear: IUniform<number>;
  uFogFar: IUniform<number>;
  /**
   * O despertar de um fruto: a frente (em "região" do fio, −1 raiz … +1 copa)
   * de um pulso de luz que sobe da raiz pelo tronco e entra SÓ no galho
   * `uSurgeBranch`. Fora de um despertar, a frente fica bem abaixo das raízes.
   */
  uSurgeFront: IUniform<number>;
  uSurgeBranch: IUniform<number>;
  /** Região da forquilha do galho-alvo: dali em diante, só o caule do fruto conduz o pulso. */
  uSurgeFork: IUniform<number>;
  /** Clarão global da árvore (0..1), no estilhaçar das correntes. */
  uFlare: IUniform<number>;
  /** 0..1: a árvore "prende a respiração" (escurece) enquanto o pulso sobe — a frente se destaca. */
  uHush: IUniform<number>;
  /** DPR atual: normaliza o brilho de primitivas de 1px (linhas) entre resoluções. */
  uPixelRatio: IUniform<number>;
}

export function createHubUniforms(): HubUniforms {
  return {
    uTime: { value: 0 },
    uGrowth: { value: 0 },
    uWarp: { value: 0 },
    uBeamSpan: { value: new Vector2(-5, 5) },
    uFogNear: { value: 10 },
    uFogFar: { value: 40 },
    uSurgeFront: { value: -9 },
    uSurgeBranch: { value: -1 },
    uSurgeFork: { value: 1 },
    uFlare: { value: 0 },
    uHush: { value: 0 },
    uPixelRatio: { value: 1 },
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

/**
 * Linhas WebGL têm sempre 1 pixel FÍSICO de largura. Com DPR 2, cada pixel de
 * tela acumula metade dos fios que acumularia com DPR 1 — a árvore escurece e o
 * bloom (que depende de um limiar de luminância) muda de comportamento.
 * Multiplicar o brilho por fio pelo DPR mantém constante a luz por área de tela.
 */
export function applyPixelRatio(uniforms: HubUniforms, dpr: number) {
  uniforms.uPixelRatio.value = dpr;
}
