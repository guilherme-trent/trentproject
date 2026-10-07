import {
  CanvasTexture,
  FramebufferTexture,
  LinearFilter,
  Mesh,
  Scene,
  SRGBColorSpace,
  Vector2,
  type Camera,
  type Group,
  type PerspectiveCamera,
  type WebGLRenderer,
} from 'three';
import { clamp01, easeOutCubic, progress, smoothstep } from '@/engine/lib/time';
import { compileForPipeline } from '@/engine/gl/warmup';
import { BEETLE, CAMERA, INTERCEPT, TEAR, TIMING } from './config';
import { DOME } from './geometry';
import type { AwakeningDirector } from './director';
import type { AwakeningKit } from './kit';
import { charWidth, drawTerminal, lineBand, terminalLayout } from './terminal';

/** Escala do autômato em unidades de mundo. */
export const BEETLE_SCALE = 0.85 * BEETLE.size;

const STRAND_STAGES = new Set(['arrive', 'anchor', 'fuse']);
const MEMBRANE_STAGES = new Set(['fuse', 'tear', 'rip']);

/**
 * O maestro de uniforms: a cada frame traduz o estado do diretor para os
 * materiais do kit e para os poucos transforms de objeto. Classe (e não
 * closure de componente) para que as escritas por frame fiquem fora do
 * modelo de imutabilidade do React Compiler.
 */
export class AwakeningFrame {
  private readonly scratch = new Vector2();

  constructor(
    private readonly kit: AwakeningKit,
    private readonly director: AwakeningDirector,
  ) {}

  /** Visão no plano z = 0 para uma câmera em CAMERA.z. */
  static view(camera: PerspectiveCamera, aspect: number) {
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * CAMERA.z;
    return { halfW: halfH * aspect, halfH };
  }

  private toUv(x: number, y: number) {
    const { halfW, halfH } = this.director.view;
    return this.scratch.set(x / halfW / 2 + 0.5, y / halfH / 2 + 0.5);
  }

  sync(camera: PerspectiveCamera, root: Group | null, beetle: Group | null) {
    const { kit, director: d } = this;
    const { stage, clock, time, view } = d;
    if (root) root.visible = !d.captured;

    // Tremor: a câmera é dona de si mesma nesta cena.
    const shake = d.shake * 0.06;
    camera.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, CAMERA.z);

    // Escala dos objetos de "mão" (pregos, fios): a menor dimensão manda — em retrato, a largura.
    const unit = Math.min(view.halfH, view.halfW * 1.25);

    // ── Fundo ──
    const backdrop = kit.backdrop.uniforms;
    backdrop.uRingScale.value = unit / view.halfH;
    backdrop.uTime.value = time;
    backdrop.uAspect.value = view.aspect;
    backdrop.uFade.value = 1;
    const tornK = clamp01(d.torn / TEAR.complete);
    backdrop.uBirth.value =
      stage === 'tear'
        ? 0.45 + 0.55 * tornK
        : stage === 'rip'
          ? 1 + 0.8 * Math.sin(clamp01(clock / TIMING.rip) * Math.PI)
          : stage === 'emerge'
            ? 1 - 0.9 * easeOutCubic(clamp01(clock / TIMING.emerge))
            : stage === 'fuse' || stage === 'arrive' || stage === 'anchor'
              ? 0
              : 0.1;
    d.nails.forEach((nail, i) => {
      const uv = this.toUv(nail.x, nail.y);
      const free = !d.strands.some((strand) => strand.nail === i);
      backdrop.uNails.value[i].set(uv.x, uv.y, stage === 'anchor' && free ? 1 : 0);
    });
    const b = d.beetle;
    const beetleUv = this.toUv(b.position.x, b.position.y - 0.08);
    backdrop.uBeetle.value.set(beetleUv.x, beetleUv.y, b.mode === 'hidden' ? 0 : smoothstep(-2.5, 0, b.depth) * 0.85);
    backdrop.uBeetleRadius.value = (0.62 * BEETLE_SCALE) / (2 * view.halfH);

    // ── Fios ──
    const slime = kit.strands.material.uniforms;
    slime.uActive.value = STRAND_STAGES.has(stage) ? 1 : 0;
    slime.uTime.value = time;
    slime.uFuse.value = d.fuse;
    slime.uRadius.value = 0.03 * unit;
    d.strands.forEach((strand, i) => {
      slime.uP0.value[i].copy(strand.controls[0]);
      slime.uP1.value[i].copy(strand.controls[1]);
      slime.uP2.value[i].copy(strand.controls[2]);
      slime.uP3.value[i].copy(strand.controls[3]);
      slime.uThick.value[i] = strand.thickness;
      slime.uSnap.value[i] = strand.snap;
    });

    // ── Pregos ──
    const nails = kit.nails.material.uniforms;
    nails.uActive.value = STRAND_STAGES.has(stage) ? 1 : 0;
    nails.uScale.value = (0.3 * unit) / 1.6;
    d.nails.forEach((nail, i) => {
      nails.uNailPos.value[i].copy(nail);
      nails.uNailGlow.value[i] = (d.strands.some((strand) => strand.nail === i) ? 0.45 : 0) + d.nailFlash[i];
    });

    // ── Membrana ──
    const membrane = kit.membrane.material.uniforms;
    membrane.uActive.value = MEMBRANE_STAGES.has(stage) ? 1 : 0;
    membrane.uFuse.value = d.fuse;
    membrane.uRip.value = d.rip;
    membrane.uTime.value = time;
    membrane.uAspect.value = view.aspect;
    d.strands.forEach((strand, i) => {
      const top = this.toUv(strand.anchor.x, view.halfH);
      const [tx, ty] = [top.x, top.y];
      const bottom = this.toUv(strand.tip.x, strand.tip.y);
      membrane.uLines.value[i].set(tx, ty, bottom.x, bottom.y);
    });
    d.trail.forEach((point, i) => membrane.uTrail.value[i].copy(point));
    if (d.tearDirty) {
      (kit.membrane.tear.image.data as Uint8Array).set(d.tear);
      kit.membrane.tear.needsUpdate = true;
      d.tearDirty = false;
    }

    // ── Autômato ──
    const visible = b.mode !== 'hidden' && !d.captured;
    kit.beetle.material.uniforms.uActive.value = visible ? 1 : 0;
    kit.beetle.domeMaterial.uniforms.uActive.value = visible ? 1 : 0;
    kit.beetle.material.uniforms.uStride.value = b.stride;
    kit.beetle.material.uniforms.uTime.value = time;
    kit.beetle.material.uniforms.uGlow.value = b.hover;
    kit.beetle.domeMaterial.uniforms.uTime.value = time;
    kit.beetle.domeMaterial.uniforms.uHover.value = b.hover;
    if (beetle) {
      beetle.position.set(b.position.x, b.position.y, b.depth);
      beetle.rotation.set(0, 0, b.heading);
      beetle.scale.setScalar(BEETLE_SCALE);
    }

    // ── Cone de projeção do holograma ──
    const beam = kit.beam.material.uniforms;
    const projecting =
      stage === 'hologram'
        ? smoothstep(0.2, 0.9, clock)
        : stage === 'awaken'
          ? 1.6
          : stage === 'glitch'
            ? (1 - clamp01(clock / TIMING.glitch)) * (Math.sin(time * 70) > 0 ? 1 : 0.15)
            : 0;
    beam.uStrength.value = projecting;
    beam.uGlitch.value = stage === 'glitch' ? 1 : 0;
    beam.uTime.value = time;
    const cos = Math.cos(b.heading);
    const sin = Math.sin(b.heading);
    beam.uBottom.value.set(
      b.position.x + cos * DOME.x * BEETLE_SCALE,
      b.position.y + sin * DOME.x * BEETLE_SCALE,
      b.depth + DOME.z * BEETLE_SCALE,
    );
    beam.uTop.value.set(0, (d.hologram.bottom * 2 - 1) * view.halfH, 0);
    beam.uTopHalf.value = d.hologram.halfWidth * 2 * view.halfW;

    // ── Chegada: nasce do preto do sequestro ──
    kit.veil.setAlpha(stage === 'arrive' ? 1 - easeOutCubic(progress(clock, 0.15, TIMING.arrive)) : 0);
  }
}

/**
 * Sobreposição desenhada DEPOIS do composer (useFrame de prioridade 2),
 * direto na tela: o terminal interceptado e, no clique, o estilhaço.
 *
 *   1. (tier sem composer) desenha a cena principal — com um useFrame de
 *      prioridade > 0 o R3F deixa de renderizar sozinho;
 *   2. desenha o terminal sobre a imagem final (cores exatas, sem bloom/ACES);
 *   3. no frame do clique, copia o framebuffer inteiro para uma textura
 *      (`copyFramebufferToTexture`, cópia GPU→GPU, sem readPixels);
 *   4. dali em diante a cena some e a teia de cacos desenha o frame capturado.
 */
export class OverlayRenderer {
  private readonly scene = new Scene();
  private readonly terminal: Mesh;
  private readonly shards: Mesh;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private texture: CanvasTexture | null = null;
  private drawn = { lines: -1, ready: false, w: 0, h: 0, scale: 0 };
  private charW = 9;
  private capture: FramebufferTexture | null = null;
  private readonly bufferSize = new Vector2();

  constructor(
    private readonly kit: AwakeningKit,
    private readonly director: AwakeningDirector,
  ) {
    this.terminal = Object.assign(new Mesh(kit.overlay.quad, kit.overlay.terminal), { frustumCulled: false });
    this.shards = Object.assign(new Mesh(kit.overlay.shatter.geometry, kit.overlay.shatter.material), { frustumCulled: false });
    this.scene.add(this.terminal, this.shards);
  }

  /** Rede de segurança (chegada sem warmup): compila a variante on-screen na montagem, não no clique. */
  compile(gl: WebGLRenderer, camera: Camera) {
    return compileForPipeline(gl, this.scene, camera, false);
  }

  render(gl: WebGLRenderer, scene: Scene, camera: Camera, viewW: number, viewH: number, composer: boolean) {
    const d = this.director;
    if (!composer) gl.render(scene, camera);

    const { stage, clock } = d;
    const terminalOn = !d.captured && (stage === 'intercept' || stage === 'shatter' || (stage === 'glitch' && clock > TIMING.glitch * 0.45));
    const shatterOn = d.captured;
    if (!terminalOn && !shatterOn) return;

    if (stage === 'intercept') this.prepareCapture(gl);
    const terminal = this.kit.overlay.terminal.uniforms;
    terminal.uActive.value = terminalOn ? 1 : 0;
    if (terminalOn) this.syncTerminal(viewW, viewH);

    const shatter = this.kit.overlay.shatter.material.uniforms;
    shatter.uActive.value = shatterOn ? 1 : 0;
    shatter.uProgress.value = d.shatter;
    shatter.uAspect.value = viewW / viewH;
    shatter.uOrigin.value.copy(d.shatterOrigin);

    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(null);
    gl.render(this.scene, camera);
    if (d.captureRequested) {
      this.prepareCapture(gl);
      gl.copyFramebufferToTexture(this.capture!);
      shatter.uCapture.value = this.capture;
      d.captureRequested = false;
      d.captured = true;
    }
    gl.autoClear = autoClear;
  }

  /** A textura de captura é alocada ANTES do clique (na interceptação): no clique, só a cópia. */
  private prepareCapture(gl: WebGLRenderer) {
    gl.getDrawingBufferSize(this.bufferSize);
    if (this.capture && this.capture.image.width === this.bufferSize.x && this.capture.image.height === this.bufferSize.y) return;
    this.capture?.dispose();
    this.capture = new FramebufferTexture(this.bufferSize.x, this.bufferSize.y);
    gl.initTexture(this.capture);
  }

  private syncTerminal(viewW: number, viewH: number) {
    const d = this.director;
    const layout = terminalLayout(viewW, viewH);
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const u = this.kit.overlay.terminal.uniforms;

    if (!this.canvas || layout.w !== this.drawn.w || layout.h !== this.drawn.h || scale !== this.drawn.scale) {
      this.canvas ??= document.createElement('canvas');
      this.canvas.width = Math.round(layout.w * scale);
      this.canvas.height = Math.round(layout.h * scale);
      this.context = this.canvas.getContext('2d');
      // Tamanho novo = textura nova (o armazenamento na GPU é imutável).
      this.texture?.dispose();
      this.texture = new CanvasTexture(this.canvas);
      this.texture.colorSpace = SRGBColorSpace;
      this.texture.generateMipmaps = false;
      this.texture.minFilter = LinearFilter;
      u.uMap.value = this.texture;
      this.drawn = { lines: -1, ready: false, w: layout.w, h: layout.h, scale };
    }
    const ctx = this.context;
    if (ctx && (this.drawn.lines !== d.interceptLines || this.drawn.ready !== d.interceptReady)) {
      drawTerminal(ctx, layout, scale, d.interceptLines, d.interceptReady);
      this.charW = charWidth(ctx, layout);
      this.texture!.needsUpdate = true;
      this.drawn.lines = d.interceptLines;
      this.drawn.ready = d.interceptReady;
    }

    u.uRect.value.set((layout.x / viewW) * 2 - 1, 1 - ((layout.y + layout.h) / viewH) * 2, ((layout.x + layout.w) / viewW) * 2 - 1, 1 - (layout.y / viewH) * 2);
    u.uSize.value.set(layout.w, layout.h);
    u.uCharW.value = this.charW;
    const typing = d.typing;
    if (typing.line >= 0) {
      const band = lineBand(layout, typing.line);
      u.uLine.value.set(band.top, band.bottom);
      const length = INTERCEPT[typing.line].text.length + 2; // "> "
      u.uReveal.value = layout.pad + this.charW * Math.min(length, typing.chars + 2);
    } else {
      u.uLine.value.set(-1, -1);
    }
    u.uTime.value = d.time;
    const sinceLine = d.time - d.lineAt;
    u.uGlitch.value =
      d.stage === 'glitch' ? 1 : d.stage === 'shatter' ? 0 : 0.12 + 0.75 * Math.exp(-sinceLine * 5) + (d.interceptReady ? 0 : 0.08);
    u.uAlpha.value = d.stage === 'glitch' ? smoothstep(TIMING.glitch * 0.45, TIMING.glitch, d.clock) : 1;
  }

  dispose() {
    this.texture?.dispose();
    this.capture?.dispose();
  }
}
