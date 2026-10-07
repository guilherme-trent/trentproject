import { MathUtils, Vector2, Vector3 } from 'three';
import { clamp01, progress } from '@/engine/lib/time';
import { useProgressStore } from '@/engine/store/useProgressStore';
import { BEETLE, INTERCEPT, NAILS, STRANDS, TEAR, TIMING } from './config';
import { useAwakening } from './store';

/**
 * O Despertar — toda a lógica do fruto 1, fora do React.
 *
 *   arrive → anchor → fuse → tear → rip → emerge → hunt → hologram →
 *   awaken → glitch → intercept → shatter → void
 *
 * Coordenadas: mundo no plano z = 0 (a câmera olha de frente) e "uv de tela"
 * (0..1, y para cima) para o rasgo. Tudo em frações da área visível.
 */
export type AwakeningStage =
  | 'arrive'
  | 'anchor'
  | 'fuse'
  | 'tear'
  | 'rip'
  | 'emerge'
  | 'hunt'
  | 'hologram'
  | 'awaken'
  | 'glitch'
  | 'intercept'
  | 'shatter'
  | 'void';

/** Um fio de gosma: ponta com mola, duas oscilações secundárias (o "jiggle") e o prego onde travou. */
export interface Strand {
  readonly anchor: Vector2;
  readonly tip: Vector2;
  readonly velocity: Vector2;
  readonly wobble: [Vector2, Vector2];
  readonly wobbleVelocity: [Vector2, Vector2];
  /** Pontos de controle da Bézier cúbica (mundo), escritos a cada frame para o shader. */
  readonly controls: [Vector3, Vector3, Vector3, Vector3];
  /** Afinamento por esticamento (conservação de volume): 1 em repouso. */
  thickness: number;
  nail: number;
  grabbed: boolean;
  /** Clarão do encaixe (1 → 0). */
  snap: number;
}

export type BeetleMode = 'hidden' | 'emerge' | 'wander' | 'idle' | 'flee' | 'rest' | 'caught';

const TRAIL = 16;

export class AwakeningDirector {
  stage: AwakeningStage = 'arrive';
  clock = 0;
  time = 0;
  /** Meia-largura e meia-altura visíveis no plano z = 0 (mundo) e o aspect. */
  readonly view = { halfW: 1, halfH: 1, aspect: 1 };

  // ── Ponteiro ───────────────────────────────────────────────────────────────
  readonly pointer = new Vector2();
  readonly pointerUv = new Vector2(0.5, 0.5);
  pointerDown = false;
  /** Velocidade do cursor em alturas de tela por segundo (suavizada). */
  pointerSpeed = 0;
  private lastPointerTime = 0;
  private readonly lastPointerUv = new Vector2();

  // ── Etapa: ancoragem ──────────────────────────────────────────────────────
  readonly strands: Strand[] = STRANDS.x.map(() => ({
    anchor: new Vector2(),
    tip: new Vector2(),
    velocity: new Vector2(),
    wobble: [new Vector2(), new Vector2()],
    wobbleVelocity: [new Vector2(), new Vector2()],
    controls: [new Vector3(), new Vector3(), new Vector3(), new Vector3()],
    thickness: 1,
    nail: -1,
    grabbed: false,
    snap: 0,
  }));
  readonly nails: Vector2[] = NAILS.x.map(() => new Vector2());
  /** Prego → clarão do encaixe. */
  readonly nailFlash = [0, 0, 0, 0];
  private strandsPlaced = false;

  // ── Etapa: membrana ───────────────────────────────────────────────────────
  readonly tear = new Uint8Array(TEAR.cols * TEAR.rows);
  private readonly tearValue = new Float32Array(TEAR.cols * TEAR.rows);
  private readonly tearScratch = new Float32Array(TEAR.cols * TEAR.rows);
  tearDirty = false;
  torn = 0;
  /** Rastro da lâmina: xy em uv de tela, z = idade (s). */
  readonly trail: Vector3[] = Array.from({ length: TRAIL }, () => new Vector3(0, 0, 99));
  private trailHead = 0;

  // ── Etapa: autômato ───────────────────────────────────────────────────────
  readonly beetle = {
    position: new Vector2(),
    depth: -7,
    heading: Math.PI / 2,
    speed: 0,
    mode: 'hidden' as BeetleMode,
    timer: 0,
    target: new Vector2(),
    stride: 0,
    /** 0..1: o botão das costas acende sob o cursor. */
    hover: 0,
  };

  // ── Etapa: fake-out ───────────────────────────────────────────────────────
  /** Quantas falas interceptadas já apareceram. */
  interceptLines = 0;
  private interceptClock = 0;
  /** O botão "Voltar agora" já pode ser clicado. */
  interceptReady = false;
  /** Pedido de captura do frame (o overlay copia o framebuffer e começa a estilhaçar). */
  captureRequested = false;
  /** Ponto (uv) de onde o estilhaço nasce: o botão clicado. */
  readonly shatterOrigin = new Vector2(0.5, 0.4);
  /** O frame com o terminal já foi copiado: dali em diante a cena some e só os cacos existem. */
  captured = false;
  /** Base do painel do holograma (uv, medido pela HUD): o topo do cone de projeção. */
  readonly hologram = { bottom: 0.5, halfWidth: 0.3 };
  /** Instante (relógio da etapa) em que a última fala interceptada surgiu. */
  lineAt = 0;
  shake = 0;

  // ── Entrada ────────────────────────────────────────────────────────────────

  setView(halfW: number, halfH: number) {
    this.view.halfW = halfW;
    this.view.halfH = halfH;
    this.view.aspect = halfW / halfH;
  }

  /** O ponteiro: mundo (plano z = 0) e uv de tela; `timeMs` = timestamp do evento. */
  pointerMove(world: Vector2, uv: Vector2, timeMs: number) {
    const dt = Math.max(1e-3, (timeMs - this.lastPointerTime) / 1000);
    const fresh = this.lastPointerTime > 0;
    if (fresh && dt < 0.2) {
      const dx = (uv.x - this.lastPointerUv.x) * this.view.aspect;
      const dy = uv.y - this.lastPointerUv.y;
      const speed = Math.hypot(dx, dy) / dt;
      this.pointerSpeed += (speed - this.pointerSpeed) * (1 - Math.exp(-dt / 0.08));
    }
    this.lastPointerTime = timeMs;
    if (this.stage === 'tear' && fresh) this.cut(this.lastPointerUv, uv); // o cursor É a lâmina
    this.lastPointerUv.copy(uv);
    this.pointer.copy(world);
    this.pointerUv.copy(uv);
  }

  press(world: Vector2, uv: Vector2, timeMs: number) {
    this.pointerDown = true;
    this.lastPointerTime = timeMs;
    this.lastPointerUv.copy(uv);
    this.pointer.copy(world);
    this.pointerUv.copy(uv);
    if (this.stage === 'anchor') this.grab();
    if (this.stage === 'hunt') this.tryCatch();
  }

  release() {
    this.pointerDown = false;
    for (const strand of this.strands) strand.grabbed = false;
  }

  /** A ponta de fio livre mais próxima do cursor (dentro do raio) é agarrada. */
  private grab() {
    const radius = STRANDS.grabRadius * this.view.halfH;
    let best = -1;
    let bestDistance = radius;
    this.strands.forEach((strand, i) => {
      if (strand.nail >= 0) return;
      const d = strand.tip.distanceTo(this.pointer);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    if (best >= 0) this.strands[best].grabbed = true;
  }

  /** O botão nas costas do autômato (hit test 2D no plano do autômato). */
  private tryCatch() {
    const b = this.beetle;
    if (b.mode === 'hidden' || b.mode === 'emerge' || b.mode === 'caught') return;
    if (b.position.distanceTo(this.pointer) > BEETLE.catchRadius * BEETLE.size * 1.6) return;
    b.mode = 'caught';
    b.target.set(0, -0.64 * this.view.halfH);
    this.enter('hologram');
  }

  /** Corte da lâmina: pinta a grade do rasgo ao longo do traço a→b (uv), com a largura da lâmina. */
  private cut(a: Vector2, b: Vector2) {
    const { cols, rows, blade } = TEAR;
    const aspect = this.view.aspect;
    const ax = a.x * aspect;
    const bx = b.x * aspect;
    const dx = bx - ax;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    if (length2 < 1e-8) return;
    for (let row = 0; row < rows; row++) {
      const cy = (row + 0.5) / rows;
      if (cy < Math.min(a.y, b.y) - blade * 2 || cy > Math.max(a.y, b.y) + blade * 2) continue;
      for (let col = 0; col < cols; col++) {
        const cx = ((col + 0.5) / cols) * aspect;
        const t = MathUtils.clamp(((cx - ax) * dx + (cy - a.y) * dy) / length2, 0, 1);
        const d = Math.hypot(cx - (ax + dx * t), cy - (a.y + dy * t));
        if (d > blade) continue;
        const i = row * cols + col;
        this.tearValue[i] = Math.max(this.tearValue[i], 1 - (d / blade) * 0.5);
      }
    }
    this.tearDirty = true;
    const point = this.trail[this.trailHead];
    point.set(b.x, b.y, 0);
    this.trailHead = (this.trailHead + 1) % TRAIL;
  }

  // ── Eventos da UI (HTML) ──────────────────────────────────────────────────

  /** A HUD informa onde o painel do holograma está (uv): o cone de projeção mira nele. */
  setHologram(bottom: number, halfWidth: number) {
    this.hologram.bottom = bottom;
    this.hologram.halfWidth = halfWidth;
  }

  /** [ Desperte, Software Engineer ] */
  awaken() {
    if (this.stage !== 'hologram') return;
    useProgressStore.getState().grantEquipment('title_software_engineer');
    this.enter('awaken');
  }

  /** [ Voltar agora ] — não volta. A tela estilhaça a partir do botão. */
  goBack(originUv: Vector2) {
    if (this.stage !== 'intercept' || !this.interceptReady) return;
    this.shatterOrigin.copy(originUv);
    this.captureRequested = true;
    this.shake = 1;
    this.enter('shatter');
  }

  // ── Frame ──────────────────────────────────────────────────────────────────

  tick(delta: number) {
    this.time += delta;
    this.clock += delta;
    const c = this.clock;
    this.shake *= Math.exp(-delta * 4);
    this.pointerSpeed *= Math.exp(-delta * 3); // sem movimento, a velocidade decai
    for (const point of this.trail) point.z += delta;
    for (let i = 0; i < this.nailFlash.length; i++) this.nailFlash[i] = Math.max(0, this.nailFlash[i] - delta * 2);

    this.layout();
    this.tickStrands(delta);

    switch (this.stage) {
      case 'arrive':
        if (c >= TIMING.arrive) this.enter('anchor');
        break;
      case 'anchor':
        if (this.strands.every((strand) => strand.nail >= 0)) {
          this.shake = 0.6;
          this.enter('fuse');
        }
        break;
      case 'fuse':
        if (c >= TIMING.fuse) this.enter('tear');
        break;
      case 'tear':
        this.propagateTear(delta);
        if (this.torn >= TEAR.complete) this.enter('rip');
        break;
      case 'rip':
        if (c >= TIMING.rip) {
          this.beetle.mode = 'emerge';
          this.beetle.position.set(0, 0);
          this.beetle.depth = -7;
          this.enter('emerge');
        }
        break;
      case 'emerge':
        if (c >= TIMING.emerge) {
          this.beetle.mode = 'idle';
          this.beetle.timer = 0.4;
          this.enter('hunt');
        }
        break;
      case 'awaken':
        if (c >= TIMING.awakenFlash) this.enter('glitch');
        break;
      case 'glitch':
        if (c >= TIMING.glitch) this.enter('intercept');
        break;
      case 'intercept':
        this.tickIntercept(delta);
        break;
      case 'shatter':
        if (c >= TIMING.shatter) this.enter('void');
        break;
    }
    this.tickBeetle(delta);
  }

  /** Posições que dependem do tamanho da tela (ancoragens e pregos), recalculadas por frame. */
  private layout() {
    const { halfW, halfH } = this.view;
    this.strands.forEach((strand, i) => strand.anchor.set(STRANDS.x[i] * halfW * 0.85, halfH + 0.35));
    this.nails.forEach((nail, i) => nail.set(NAILS.x[i] * halfW * 0.85, NAILS.y * halfH));
    if (!this.strandsPlaced) {
      // Os fios nascem recolhidos lá em cima e CAEM (a mola dá o quique viscoso).
      this.strands.forEach((strand) => strand.tip.copy(strand.anchor));
      this.strandsPlaced = true;
    }
  }

  /**
   * Física de gosma, barata e convincente: a ponta é uma massa numa mola
   * (frouxa e quicante solta; firme sob o dedo; travada no prego), e os
   * dois pontos de controle internos da Bézier carregam molas secundárias
   * excitadas pela ACELERAÇÃO da ponta — o fio balança e "atrasa" como
   * matéria viscosa. Esticado, afina (volume constante).
   */
  private tickStrands(delta: number) {
    const { halfH } = this.view;
    const rest = STRANDS.length * halfH;
    const dt = Math.min(delta, 1 / 30);
    const target = new Vector2();
    this.strands.forEach((strand, i) => {
      strand.snap = Math.max(0, strand.snap - dt * 2.5);
      let k = 28;
      let damping = 3.2;
      if (strand.nail >= 0) {
        target.copy(this.nails[strand.nail]);
        k = 140;
        damping = 16;
      } else if (strand.grabbed) {
        target.set(
          MathUtils.clamp(this.pointer.x, -this.view.halfW, this.view.halfW),
          MathUtils.clamp(this.pointer.y, -halfH, halfH),
        );
        k = 260;
        damping = 24;
        // O snap: perto de um prego livre, a gosma salta para ele e trava.
        const free = this.nails.findIndex((nail, n) => !this.strands.some((s) => s.nail === n) && nail.distanceTo(strand.tip) < STRANDS.snapRadius * halfH);
        if (free >= 0) {
          strand.nail = free;
          strand.grabbed = false;
          strand.snap = 1;
          this.nailFlash[free] = 1;
          this.shake = Math.max(this.shake, 0.25);
        }
      } else {
        const sway = Math.sin(this.time * 1.3 + i * 1.7) * 0.06 * halfH;
        target.set(strand.anchor.x + sway, strand.anchor.y - rest);
      }
      const ax = (target.x - strand.tip.x) * k - strand.velocity.x * damping;
      const ay = (target.y - strand.tip.y) * k - strand.velocity.y * damping - (strand.nail < 0 && !strand.grabbed ? 2.5 : 0);
      strand.velocity.x += ax * dt;
      strand.velocity.y += ay * dt;
      strand.tip.x += strand.velocity.x * dt;
      strand.tip.y += strand.velocity.y * dt;

      // Molas secundárias (o jiggle viscoso), excitadas pela aceleração da ponta.
      strand.wobble.forEach((wobble, w) => {
        const velocity = strand.wobbleVelocity[w];
        const gain = w === 0 ? 0.004 : 0.007;
        velocity.x += (-wobble.x * 60 - velocity.x * 5 - ax * gain) * dt;
        velocity.y += (-wobble.y * 60 - velocity.y * 5 - ay * gain) * dt;
        wobble.x += velocity.x * dt;
        wobble.y += velocity.y * dt;
      });

      const distance = strand.tip.distanceTo(strand.anchor) || 1e-3;
      const slack = Math.max(0, rest - distance);
      const sag = rest * 0.08 + slack * 0.55;
      const [p0, p1, p2, p3] = strand.controls;
      p0.set(strand.anchor.x, strand.anchor.y, 0);
      p3.set(strand.tip.x, strand.tip.y, 0);
      p1.lerpVectors(p0, p3, 0.33);
      p1.x += strand.wobble[0].x;
      p1.y += strand.wobble[0].y - sag;
      p2.lerpVectors(p0, p3, 0.66);
      p2.x += strand.wobble[1].x;
      p2.y += strand.wobble[1].y - sag * 0.8;
      strand.thickness = MathUtils.clamp(Math.sqrt(rest / distance), 0.55, 1.15);
    });
  }

  /** A tensão da membrana abre os cortes: células vizinhas de um rasgo cedem devagar. */
  private propagateTear(delta: number) {
    const { cols, rows, spread } = TEAR;
    const value = this.tearValue;
    const next = this.tearScratch;
    next.set(value);
    let torn = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        if (value[i] < 1) {
          let pull = 0;
          if (col > 0 && value[i - 1] > 0.6) pull++;
          if (col < cols - 1 && value[i + 1] > 0.6) pull++;
          if (row > 0 && value[i - cols] > 0.6) pull++;
          if (row < rows - 1 && value[i + cols] > 0.6) pull++;
          if (pull) next[i] = Math.min(1, value[i] + pull * spread * delta * 0.25);
        }
        if (next[i] >= 0.5) torn++;
      }
    }
    value.set(next);
    for (let i = 0; i < value.length; i++) this.tear[i] = Math.round(value[i] * 255);
    this.tearDirty = true;
    this.torn = torn / value.length;
  }

  /**
   * IA do autômato: vaga entre alvos aleatórios com pausas; se o cursor passa
   * RÁPIDO perto dele, dá uma corridinha de fuga de 1s (para longe do
   * cursor, desviando das bordas) e para — fuga amigável, não impossível.
   */
  private tickBeetle(delta: number) {
    const b = this.beetle;
    const { halfW, halfH } = this.view;
    const margin = BEETLE.size * 0.8;
    const bounds = { x: Math.max(0.2, halfW - margin), y: Math.max(0.2, halfH - margin) };
    b.timer -= delta;
    let desired = 0;

    switch (b.mode) {
      case 'hidden':
        return;
      case 'caught': {
        // Pego: caminha até o pé da tela, vira de costas para cima e projeta o holograma.
        const distance = b.position.distanceTo(b.target);
        const wanted = distance > 0.05 ? Math.atan2(b.target.y - b.position.y, b.target.x - b.position.x) : Math.PI / 2;
        b.heading += Math.atan2(Math.sin(wanted - b.heading), Math.cos(wanted - b.heading)) * (1 - Math.exp(-delta * 6));
        b.speed = MathUtils.damp(b.speed, distance > 0.05 ? BEETLE.walk * 1.4 : 0, 8, delta);
        b.position.x += Math.cos(b.heading) * b.speed * delta;
        b.position.y += Math.sin(b.heading) * b.speed * delta;
        b.stride += delta * b.speed * 9;
        b.hover = MathUtils.damp(b.hover, 1, 6, delta);
        return;
      }
      case 'emerge': {
        // Rasteja do fundo do rasgo até a superfície da tela.
        const k = clamp01(this.clock / TIMING.emerge);
        b.depth = MathUtils.lerp(-7, 0, 1 - (1 - k) ** 2);
        b.position.set(0, MathUtils.lerp(0.6, -0.15, k) * halfH * 0.4);
        b.heading = -Math.PI / 2 + Math.sin(this.time * 2) * 0.15;
        b.speed = BEETLE.walk;
        b.stride += delta * 9;
        return;
      }
      case 'idle':
        if (b.timer <= 0) {
          b.mode = 'wander';
          b.target.set((Math.random() * 2 - 1) * bounds.x, (Math.random() * 2 - 1) * bounds.y);
        }
        break;
      case 'wander':
        desired = BEETLE.walk;
        if (b.position.distanceTo(b.target) < 0.25) {
          b.mode = 'idle';
          b.timer = 0.4 + Math.random() * 1.2;
        }
        break;
      case 'flee':
        desired = BEETLE.flee;
        if (b.timer <= 0) {
          b.mode = 'rest';
          b.timer = 0.9;
        }
        break;
      case 'rest':
        if (b.timer <= 0) {
          b.mode = 'idle';
          b.timer = 0.3;
        }
        break;
    }

    // O susto: cursor rápido e perto → foge.
    const toPointer = this.pointer.distanceTo(b.position);
    if (
      this.stage === 'hunt' &&
      b.mode !== 'flee' &&
      this.pointerSpeed > BEETLE.fleeTrigger &&
      toPointer < BEETLE.fleeRadius * halfH
    ) {
      b.mode = 'flee';
      b.timer = BEETLE.fleeSeconds;
      const away = Math.atan2(b.position.y - this.pointer.y, b.position.x - this.pointer.x);
      b.target.set(
        MathUtils.clamp(b.position.x + Math.cos(away) * 3, -bounds.x, bounds.x),
        MathUtils.clamp(b.position.y + Math.sin(away) * 3, -bounds.y, bounds.y),
      );
    }

    b.speed = MathUtils.damp(b.speed, desired, desired > b.speed ? 6 : 9, delta);
    if (b.speed > 0.01) {
      const wanted = Math.atan2(b.target.y - b.position.y, b.target.x - b.position.x);
      const turn = Math.atan2(Math.sin(wanted - b.heading), Math.cos(wanted - b.heading));
      b.heading += MathUtils.clamp(turn, -delta * 5, delta * 5);
      b.position.x = MathUtils.clamp(b.position.x + Math.cos(b.heading) * b.speed * delta, -bounds.x, bounds.x);
      b.position.y = MathUtils.clamp(b.position.y + Math.sin(b.heading) * b.speed * delta, -bounds.y, bounds.y);
      b.stride += delta * b.speed * 9;
    }
    b.hover = MathUtils.damp(b.hover, toPointer < BEETLE.catchRadius * BEETLE.size * 1.6 ? 1 : 0, 10, delta);
  }

  private tickIntercept(delta: number) {
    this.interceptClock += delta;
    let elapsed = 0;
    let lines = 0;
    for (const line of INTERCEPT) {
      elapsed += line.delay;
      if (this.interceptClock >= elapsed) lines++;
    }
    const ready = this.interceptClock >= elapsed + 0.8;
    if (lines !== this.interceptLines || ready !== this.interceptReady) {
      if (lines !== this.interceptLines) this.lineAt = this.time;
      this.interceptLines = lines;
      this.interceptReady = ready;
      useAwakening.setState({ lines, ready });
    }
  }

  private enter(stage: AwakeningStage) {
    this.stage = stage;
    this.clock = 0;
    useAwakening.setState({ stage });
  }

  /** Ponto (uv da linha atual) e progresso da digitação da fala interceptada. */
  get typing() {
    if (this.stage !== 'intercept' || this.interceptLines === 0) return { line: this.interceptLines - 1, chars: 0 };
    let start = 0;
    for (let i = 0; i < this.interceptLines; i++) start += INTERCEPT[i].delay;
    const line = this.interceptLines - 1;
    // Digitação nervosa: rápida, com a mesma pausa no fim (o corte abrupto da fala).
    return { line, chars: Math.max(0, (this.interceptClock - start) * 38) };
  }

  // ── Derivados ──────────────────────────────────────────────────────────────

  /** 0..1: os fios se fundem e a membrana cobre a tela. */
  get fuse() {
    if (this.stage === 'fuse') return progress(this.clock, 0.35, TIMING.fuse);
    return this.stage === 'tear' || this.stage === 'rip' ? 1 : 0;
  }

  /** 0..1: a membrana rasga por completo. */
  get rip() {
    return this.stage === 'rip' ? clamp01(this.clock / TIMING.rip) : 0;
  }

  /** A membrana está na tela. */
  get membrane() {
    return this.stage === 'fuse' || this.stage === 'tear' || this.stage === 'rip';
  }

  /** 0..1: o estilhaço da tela. */
  get shatter() {
    if (this.stage === 'shatter') return clamp01(this.clock / TIMING.shatter);
    return this.stage === 'void' ? 1 : 0;
  }
}
