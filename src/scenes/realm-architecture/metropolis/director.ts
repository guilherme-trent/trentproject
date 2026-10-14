import { Vector2 } from 'three';
import { useProgressStore } from '@/engine/store/useProgressStore';
import { DRIVE, FORGE, INTERCEPT, RESONANCE, SHATTER, span, TIMING } from './config';
import { useMetropolis } from './store';

/**
 * O fruto 1 inteiro, fora do React.
 *
 *   arrive → journey ⇄ climax → glitch → intercept → shatter → chaos → forge → relic → exit
 *
 * Etapa 1 — pilotagem por SEGURAR: teclado (W/↑, S/↓) e toque (arrastar
 * para cima e segurar) definem um acelerador (−1..1); a velocidade o
 * persegue com amortecimento e o progresso integra a velocidade. A página
 * não rola. Construir e desconstruir em tempo real é contínuo.
 *
 * Etapa 2 — o ponteiro vira atrator. A Ressonância sobe com movimento suave
 * e cai quando ele para; em 100% a forja da Seiva Pura começa.
 */
export type MetropolisStage =
  | 'arrive'
  | 'journey'
  | 'climax'
  | 'glitch'
  | 'intercept'
  | 'shatter'
  | 'chaos'
  | 'forge'
  | 'relic'
  | 'exit';

/** O clímax: a 0,45 unidade do fim (e solta ao recuar 2,2 unidades). */
const CLIMAX_AT = 1 - span(0.45);
const CLIMAX_RELEASE = 1 - span(2.24);
const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

export class MetropolisDirector {
  stage: MetropolisStage = 'arrive';
  clock = 0;
  time = 0;
  /** Onde a câmera está na jornada (0..1). */
  progress = 0;
  /** Velocidade do progresso (1/s) — vira FOV na velocidade. */
  velocity = 0;
  /** Acelerador por fonte (−1..1): teclado e toque se somam. */
  private keyThrottle = 0;
  private touchThrottle = 0;
  /** Instante (relógio global) em que o pulso de luz do clímax partiu do núcleo (−1 = nenhum). */
  pulseAt = -1;
  /** Ponteiro em uv (0..1, y para cima) e normalizado (−1..1) para a paralaxe. */
  readonly pointer = new Vector2();
  readonly pointerUv = new Vector2(0.5, 0.5);
  /** O ponteiro está "presente" (mouse sempre; toque só enquanto encosta). */
  pointerActive = false;

  // ── Interrupção ──
  interceptLines = 0;
  interceptReady = false;
  lineAt = 0;
  private interceptClock = 0;
  captureRequested = false;
  captured = false;
  readonly shatterOrigin = new Vector2(0.5, 0.4);
  shake = 0;

  // ── Forja ──
  /** 0..1 */
  resonance = 0;
  /** 0..1, suavizado: o quanto o usuário está orquestrando agora (atrator ligado). */
  orchestrating = 0;
  private pointerSpeed = 0;
  private pointerSpeedRaw = 0;
  private lastPointerTime = 0;
  private lastMoveAt = -1;
  /** Pedido de volta à hub (a cena troca de cena pela luz). */
  private exitRequested = false;

  /** Chegou pela fissura: o túnel já estava sendo visto ao vivo — sem luz de pouso, continua dali. */
  fromRift = false;

  /** Continua do estado em que a fissura mostrava a Fase 1 (ver RIFT_HANDOFF). */
  continueFrom(progress: number, time: number) {
    this.progress = progress;
    this.time = time;
    this.fromRift = true;
  }

  /** A saída pela luz terminou? (consome o pedido: verdadeiro uma única vez) */
  consumeExit() {
    const requested = this.exitRequested;
    this.exitRequested = false;
    return requested;
  }

  /** O usuário ainda conduz a construção? */
  get steering() {
    return (this.stage === 'arrive' && this.clock > 1.2) || this.stage === 'journey' || this.stage === 'climax';
  }

  /** Acelerador do teclado: +1 avança, −1 retrocede, 0 solto. */
  setKeyThrottle(value: number) {
    this.keyThrottle = clamp(value, -1, 1);
  }

  /** Acelerador do toque (arraste vertical desde onde o dedo encostou). */
  setTouchThrottle(value: number) {
    this.touchThrottle = clamp(value, -1, 1);
  }

  /** O acelerador efetivo (o que a HUD mostra como "segurando"). */
  get throttle() {
    return this.steering ? clamp(this.keyThrottle + this.touchThrottle, -1, 1) : 0;
  }

  /** Ponteiro em uv de tela; `timeMs` = timestamp do evento. */
  pointerAt(u: number, v: number, timeMs: number, active: boolean) {
    const dt = (timeMs - this.lastPointerTime) / 1000;
    if (this.lastPointerTime > 0 && dt > 1e-3 && dt < 0.25) {
      const aspect = window.innerWidth / window.innerHeight;
      const raw = Math.hypot((u - this.pointerUv.x) * aspect, v - this.pointerUv.y) / dt;
      this.pointerSpeedRaw = raw;
      this.pointerSpeed += (raw - this.pointerSpeed) * (1 - Math.exp(-dt / 0.12));
      if (active && raw > RESONANCE.minSpeed * 0.5) this.lastMoveAt = this.time;
    }
    this.lastPointerTime = timeMs;
    this.pointerUv.set(u, v);
    this.pointer.set(u * 2 - 1, v * 2 - 1);
    this.pointerActive = active;
  }

  /** O toque terminou: sem dedo, sem atrator. */
  pointerLeave() {
    this.pointerActive = false;
  }

  /** [ Desperte, Software Engineer ] */
  awaken() {
    if (this.stage !== 'climax') return;
    useProgressStore.getState().grantEquipment('title_software_engineer');
    this.shake = 0.8;
    this.enter('glitch');
  }

  /** [ Voltar para a Hub ] — não volta: FALHA CRÍTICA. A tela estilhaça a partir do botão. */
  goBack(originUv: { x: number; y: number }) {
    if (this.stage !== 'intercept' || !this.interceptReady) return;
    this.shatterOrigin.set(originUv.x, originUv.y);
    this.captureRequested = true;
    this.shake = 1;
    this.enter('shatter');
  }

  tick(delta: number) {
    this.time += delta;
    this.clock += delta;
    this.shake *= Math.exp(-delta * 4);

    // Acelerador → velocidade (amortecida) → progresso. Soltar freia suave, sem escorregar.
    const wanted = this.throttle * DRIVE.maxSpeed;
    const rate = Math.abs(wanted) > Math.abs(this.velocity) ? DRIVE.accel : DRIVE.brake;
    this.velocity += (wanted - this.velocity) * (1 - Math.exp(-delta * rate));
    if (Math.abs(this.velocity) < 1e-5 && wanted === 0) this.velocity = 0;
    this.progress += this.velocity * delta;
    if (this.progress <= 0 || this.progress >= 1) {
      this.progress = clamp(this.progress, 0, 1);
      this.velocity = 0;
    }

    switch (this.stage) {
      case 'arrive':
        if (this.clock >= TIMING.arrive) this.enter('journey');
        break;
      case 'journey':
        if (this.progress >= CLIMAX_AT) {
          this.pulseAt = this.time; // o pulso de luz parte do núcleo e varre a metrópole
          this.enter('climax');
        }
        break;
      case 'climax':
        if (this.progress < CLIMAX_RELEASE) this.enter('journey');
        break;
      case 'glitch':
        if (this.clock >= TIMING.glitch) this.enter('intercept');
        break;
      case 'intercept':
        this.tickIntercept(delta);
        break;
      case 'shatter':
        if (this.clock >= SHATTER.end) this.enter('chaos');
        break;
      case 'chaos':
        this.tickResonance(delta);
        break;
      case 'forge':
        if (this.clock >= FORGE.relicAt) {
          const progress = useProgressStore.getState();
          progress.completeFruit(1);
          progress.grantEquipment('seiva_pura');
          this.enter('relic');
        }
        break;
      case 'relic':
        if (this.clock >= FORGE.relicHold) this.enter('exit');
        break;
      case 'exit':
        if (this.clock >= FORGE.exit) this.exitRequested = true;
        break;
    }
  }

  /**
   * Movimento suave = velocidade estável dentro da faixa: a qualidade cai com
   * a diferença entre a velocidade instantânea e a média (trancos, chicotadas).
   */
  private tickResonance(delta: number) {
    this.pointerSpeed *= Math.exp(-delta * 2); // sem eventos, a velocidade decai
    const moving = this.pointerActive && this.time - this.lastMoveAt < 0.15 && this.pointerSpeed > RESONANCE.minSpeed;
    this.orchestrating += ((moving ? 1 : this.pointerActive ? 0.35 : 0) - this.orchestrating) * (1 - Math.exp(-delta * 4));
    if (this.clock < 0.8) return; // a poeira ainda está despertando
    if (moving) {
      const steadiness = clamp(1 - Math.abs(this.pointerSpeedRaw - this.pointerSpeed) / (this.pointerSpeed + 0.35), 0, 1);
      const pace = this.pointerSpeed < RESONANCE.maxSpeed ? 1 : 0.25;
      this.resonance += RESONANCE.gain * delta * (0.35 + 0.65 * steadiness) * pace;
    } else if (this.time - this.lastMoveAt > RESONANCE.grace) {
      this.resonance -= RESONANCE.decay * delta;
    }
    this.resonance = clamp(this.resonance, 0, 1);
    if (this.resonance >= 1) this.enter('forge');
  }

  private tickIntercept(delta: number) {
    this.interceptClock += delta;
    let elapsed = 0;
    let lines = 0;
    for (const line of INTERCEPT) {
      elapsed += line.delay;
      if (this.interceptClock >= elapsed) lines++;
    }
    const ready = this.interceptClock >= elapsed + 1.6;
    if (lines !== this.interceptLines || ready !== this.interceptReady) {
      if (lines !== this.interceptLines) {
        this.lineAt = this.time;
        this.shake = Math.max(this.shake, 0.35);
      }
      this.interceptLines = lines;
      this.interceptReady = ready;
      useMetropolis.setState({ lines, ready });
    }
  }

  /** Fala sendo digitada (índice) e quantos caracteres já saíram — digitação nervosa, 42 car/s. */
  get typing() {
    const line = this.interceptLines - 1;
    if (this.stage !== 'intercept' || line < 0) return { line, chars: 0 };
    let start = 0;
    for (let i = 0; i <= line; i++) start += INTERCEPT[i].delay;
    return { line, chars: Math.max(0, (this.interceptClock - start) * 42) };
  }

  private enter(stage: MetropolisStage) {
    this.stage = stage;
    this.clock = 0;
    useMetropolis.setState({ stage });
  }

  /** Segundos desde o clique em "Voltar" (o relógio do estilhaço). */
  get shatterClock() {
    if (this.stage === 'shatter') return this.clock;
    return this.captured ? SHATTER.end : 0;
  }

  /** Intensidade da falha de sinal na estrutura. */
  get glitch() {
    if (this.stage === 'glitch') return 1 - 0.6 * Math.min(1, this.clock / TIMING.glitch);
    if (this.stage === 'intercept') return 0.12 + 0.6 * Math.exp(-(this.time - this.lineAt) * 5);
    return 0;
  }

  /** Etapa 2 em andamento (a cena do túnel já foi estilhaçada). */
  get forging() {
    return this.captured && (this.stage === 'shatter' || this.stage === 'chaos' || this.stage === 'forge' || this.stage === 'relic' || this.stage === 'exit');
  }
}
