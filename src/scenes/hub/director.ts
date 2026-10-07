import { MathUtils, Vector3, type PerspectiveCamera } from 'three';
import type { SceneId } from '@/engine/config/scenes';
import { easeInQuad, progress, smoothstep } from '@/engine/lib/time';
import { growthLandedAt } from './chunks/growth.glsl';
import { STEM_END_REGION } from './fruits/geometry';
import { useProgressStore, type FruitSlot } from '@/engine/store/useProgressStore';
import type { Pillar, RiftTransitionKind } from '../shared/pillars';
import { transitionFx } from '../shared/transitions/fxState';
import { warpEase } from '../shared/transitions/curves';
import type { HubUniforms } from './uniforms';
import type { FruitUniforms } from './fruits/materials';

/** Duração real (s) do crescimento feixe → árvore. */
export const GROWTH_SECONDS = 3.4;

/** Duração de cada transição: o ritmo é parte da linguagem de cada reino. */
const DURATION: Record<RiftTransitionKind, number> = { shatter: 1.9, warp: 1.55, swallow: 2.1 };

/** Warp: distância em que a câmera para, colada ao fruto (ele cobre a tela inteira). */
const WARP_STANDOFF = 0.1;

export type HubArrival = 'beam' | 'return';

/**
 * O despertar de um fruto (segundos desde o início):
 *   rise   o pulso sobe da ponta das raízes até a forquilha do galho (acelerando)
 *   stem   desce pelo caule até o cristal
 *   break  as correntes explodem; o fruto desperta
 */
const AWAKENING = { rise: 1.7, stem: 0.45, settle: 1.2 } as const;
/**
 * Antes do pulso, a árvore escurece progressivamente (s) — o fôlego antes do
 * golpe. Faz parte do atraso do `awaken` (a UI sai durante o começo dele).
 */
const HUSH_SECONDS = 1.5;
/**
 * O fruto desabrocha no instante em que o ÚLTIMO fio do caule pousa (mesma
 * conta do shader de crescimento) e leva BLOOM_SECONDS para abrir.
 */
const BLOOM_START = growthLandedAt(STEM_END_REGION);
const BLOOM_SECONDS = 0.7;
const easeOutBack = (x: number) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;

/**
 * O sequestro (s desde o início): a anomalia emerge do fruto, avança contra a
 * câmera acelerando, os dedos se fecham sobre ela, e a tela fica PRETA por 1s
 * antes da troca de cena.
 */
export const KIDNAP = { emerge: 0.55, lunge: [0.55, 1.35] as const, grip: [1.05, 1.4] as const, black: [1.2, 1.38] as const, end: 2.4 };

interface Awakening {
  fruit: number;
  /** Segundos desde o início (negativo = ainda esperando a UI sair). */
  clock: number;
  broke: boolean;
}

/** Estado visual por fruto, lido pelos componentes a cada frame. */
export interface FruitVisual {
  unlock: number;
  /** Segundos desde a explosão das correntes (−1 = intactas). */
  breakClock: number;
  hover: number;
}

export interface ActiveTransition {
  pillar: Pillar;
  /** Centro do fruto (mundo), congelado no clique. */
  target: Vector3;
  /** Posição da câmera no clique. */
  from: Vector3;
  /** Warp: onde a câmera termina, logo diante do rasgo. */
  approach: Vector3;
  startedAt: number | null;
}

/**
 * O diretor da hub: a coreografia inteira, fora do React.
 *
 * Componentes não guardam estado de animação; eles leem o diretor dentro de
 * `useFrame`. O diretor escreve, uma vez por frame:
 *   - os uniforms compartilhados da cena (tempo, crescimento, imersão warp);
 *   - o estado do efeito de transição (`transitionFx`), lido pelo pós-processamento;
 * e expõe o estado visual dos frutos (despertar, explosão, hover) e o
 * progresso que a câmera usa. Lógica pura, sem re-renders.
 */
export class HubDirector {
  private growthClock = 0;
  private progress = 0;
  transition: ActiveTransition | null = null;
  readonly fruits: FruitVisual[];
  /** Tremor da câmera (0..1), no estilhaçar. */
  shake = 0;
  private awakening: Awakening | null = null;
  private readonly hoverTarget = [0, 0, 0];
  private onBreak: ((fruit: number) => void) | null = null;
  private bloomClock = 0;
  /** Segundos desde o início do sequestro (−1 = não começou). */
  kidnapClock = -1;
  private kidnapDone = false;

  /**
   * @param fruitBranches  galho principal de cada fruto (na ordem de PILLARS)
   * @param forkRegions    região do fio na forquilha de cada galho principal
   */
  constructor(
    private readonly uniforms: HubUniforms,
    private readonly fruitUniforms: FruitUniforms,
    private readonly fruitBranches: readonly number[],
    private readonly forkRegions: Float32Array,
    arrival: HubArrival,
  ) {
    // Voltando de um reino: a árvore já está de pé.
    if (arrival === 'return') {
      this.growthClock = GROWTH_SECONDS;
      this.bloomClock = BLOOM_SECONDS;
    }
    // Frutos já despertos (progressão persistida) nascem sem correntes.
    const progress = useProgressStore.getState();
    this.fruits = fruitBranches.map((_, i) => {
      const unlocked = progress.isUnlocked((i + 1) as FruitSlot);
      return { unlock: unlocked ? 1 : 0, breakClock: unlocked ? 99 : -1, hover: 0 };
    });
  }

  /** Quem quer saber do instante em que as correntes de um fruto explodem. */
  setBreakListener(listener: ((fruit: number) => void) | null) {
    this.onBreak = listener;
  }

  setHover(fruit: number, on: boolean) {
    this.hoverTarget[fruit] = on ? 1 : 0;
  }

  /**
   * Desperta o fruto: o pulso sobe da raiz e, ao chegar, estilhaça as
   * correntes. `delay` deixa a UI sair de cena antes. Idempotente.
   */
  awaken(fruit: number, delay = HUSH_SECONDS): boolean {
    if (this.awakening || this.fruits[fruit].breakClock >= 0) return false;
    this.awakening = { fruit, clock: -Math.max(delay, HUSH_SECONDS), broke: false };
    return true;
  }

  /** A anomalia leva o jogador para o reino do fruto 1 (ver KIDNAP). Idempotente. */
  kidnap() {
    if (this.kidnapClock >= 0 || this.transition) return false;
    this.kidnapClock = 0;
    return true;
  }

  get awakeningFruit() {
    return this.awakening?.fruit ?? null;
  }

  /**
   * Avança a coreografia. `elapsedTime` (clock do R3F) dirige a pulsação
   * contínua; `delta` (com clamp) dirige o crescimento, que pausa com a aba oculta.
   * @returns a cena de destino quando a transição termina, senão `null`
   */
  tick(elapsedTime: number, delta: number): SceneId | null {
    this.uniforms.uTime.value = elapsedTime;
    if (this.kidnapClock >= 0) {
      this.kidnapClock += delta;
      // O tranco da mão se fechando sobre a câmera.
      if (this.kidnapClock > KIDNAP.lunge[1] - 0.15 && this.kidnapClock < KIDNAP.black[1]) this.shake = Math.max(this.shake, 0.7);
      if (!this.kidnapDone && this.kidnapClock >= KIDNAP.end) {
        this.kidnapDone = true;
        return 'realm_architecture';
      }
    }
    this.growthClock = Math.min(this.growthClock + delta, GROWTH_SECONDS);
    this.uniforms.uGrowth.value = this.growthClock / GROWTH_SECONDS;
    this.tickFruits(delta);

    const active = this.transition;
    if (!active) return null;

    active.startedAt ??= elapsedTime;
    const kind = active.pillar.transition;
    const previous = this.progress;
    this.progress = Math.min((elapsedTime - active.startedAt) / DURATION[kind], 1);

    transitionFx.kind = kind;
    transitionFx.progress = kind === 'warp' ? warpEase(this.progress) : this.progress;
    this.uniforms.uWarp.value = kind === 'warp' ? warpEase(this.progress) : 0;

    return previous < 1 && this.progress >= 1 ? active.pillar.realm : null;
  }

  get growth() {
    return this.growthClock / GROWTH_SECONDS;
  }

  /** Progresso linear (0 → 1) da transição ativa. */
  get transitionProgress() {
    return this.progress;
  }

  /** Hover e clique só depois que a árvore brotou, e nunca durante uma transição, um despertar ou o sequestro. */
  get canInteract() {
    return this.growth >= 1 && !this.transition && !this.awakening && this.kidnapClock < 0;
  }

  /**
   * Frutos: surgimento, hover, linha do tempo do despertar e relógio das
   * explosões. Escreve os arrays de uniforms (3 números por fruto) que
   * correntes, cacos e caules leem.
   */
  private tickFruits(delta: number) {
    const u = this.uniforms;
    const f = this.fruitUniforms;
    if (this.growth >= BLOOM_START) this.bloomClock = Math.min(BLOOM_SECONDS, this.bloomClock + delta);
    f.uAppear.value = this.bloomClock > 0 ? easeOutBack(this.bloomClock / BLOOM_SECONDS) : 0;

    u.uSurgeFront.value = -9;
    let hush = 0;
    const awakening = this.awakening;
    if (awakening) {
      awakening.clock += delta;
      const t = awakening.clock;
      const fruit = awakening.fruit;
      const branch = this.fruitBranches[fruit];
      const fork = this.forkRegions[branch];
      u.uSurgeBranch.value = branch;
      u.uSurgeFork.value = fork;
      // A árvore escurece devagar ANTES do pulso partir e volta a respirar com a explosão.
      const end = AWAKENING.rise + AWAKENING.stem;
      hush = smoothstep(-HUSH_SECONDS, -0.05, t) * (1 - smoothstep(end, end + 0.6, t));
      if (t >= 0 && t < end) {
        // Um único pulso: sobe acelerando (lento nas raízes, violento no
        // galho) e, da forquilha, desce o caule até a gota.
        u.uSurgeFront.value =
          t < AWAKENING.rise
            ? MathUtils.lerp(-1.1, fork, easeInQuad(progress(t, 0, AWAKENING.rise)))
            : MathUtils.lerp(fork, STEM_END_REGION + 0.02, progress(t, AWAKENING.rise, end));
      }
      if (!awakening.broke && t >= AWAKENING.rise + AWAKENING.stem) {
        awakening.broke = true;
        this.fruits[fruit].breakClock = 0;
        this.shake = 1;
        u.uFlare.value = 1;
        useProgressStore.getState().unlockFruit((fruit + 1) as FruitSlot);
        this.onBreak?.(fruit);
      }
      if (t >= AWAKENING.rise + AWAKENING.stem + AWAKENING.settle) this.awakening = null;
    }

    u.uHush.value = hush;
    // Abaixo de 1% o clarão vai a zero: a árvore volta ao caminho barato do shader (branch uniforme).
    u.uFlare.value = u.uFlare.value < 0.01 ? 0 : u.uFlare.value * Math.exp(-delta * 2.5);
    this.shake *= Math.exp(-delta * 4.5);

    this.fruits.forEach((visual, i) => {
      if (visual.breakClock >= 0 && visual.breakClock < 99) visual.breakClock = Math.min(99, visual.breakClock + delta);
      // Desperta logo depois do estilhaçar (o cristal acende sob o clarão).
      const awake = visual.breakClock >= 0.15 ? 1 : 0;
      visual.unlock = MathUtils.damp(visual.unlock, awake, 2.5, delta);
      visual.hover = MathUtils.damp(visual.hover, this.hoverTarget[i], 10, delta);
      f.uUnlock.value[i] = visual.unlock;
      f.uBreak.value[i] = visual.breakClock;
      f.uHover.value[i] = visual.hover;
      f.uReady.value[i] = visual.breakClock < 0 && useProgressStore.getState().canUnlock((i + 1) as FruitSlot) && i > 0 ? 1 : 0;
    });
  }

  beginTransition(pillar: Pillar, target: Vector3, camera: PerspectiveCamera): boolean {
    if (!this.canInteract) return false;

    const toCamera = camera.position.clone().sub(target).normalize();
    this.transition = {
      pillar,
      target: target.clone(),
      from: camera.position.clone(),
      approach: target.clone().addScaledVector(toCamera, WARP_STANDOFF),
      startedAt: null,
    };
    this.progress = 0;

    // Origem do efeito em UV de tela: de onde a rachadura/túnel/tecido nasce.
    const ndc = target.clone().project(camera);
    transitionFx.origin.set((ndc.x + 1) / 2, (ndc.y + 1) / 2);
    transitionFx.color.setRGB(...pillar.color);
    return true;
  }
}
