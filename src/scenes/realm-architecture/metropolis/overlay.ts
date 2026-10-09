import {
  CanvasTexture,
  FramebufferTexture,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector4,
  type Camera,
  type WebGLRenderer,
} from 'three';
import { smoothstep } from '@/engine/lib/time';
import { warmGpu } from '@/engine/gl/warmup';
import { glsl } from '@/shaders/glsl';
import { commonChunk } from '@/shaders/chunks/common.glsl';
import { TIMING } from './config';
import type { MetropolisDirector } from './director';
import { drawTerminal, terminalLayout, typingState } from './terminal';
import { createShardField, ZeroGShatterMaterial } from './shatter';

const DORMANT = glsl`gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;`;

/**
 * O terminal de interrupção. Quad em NDC (o retângulo vem do layout
 * compartilhado com o HTML), textura = Canvas2D do painel. O shader faz o
 * que custaria uploads: a digitação (máscara da row atual), o cursor, o
 * pisca da fala recém-chegada e a corrupção do sinal (fatias deslocadas,
 * separação RGB, flicker).
 */
export class TerminalMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        uniform vec4 uRect;
        uniform float uActive;
        varying vec2 vUv;
        void main() {
          if (uActive < 0.5) { ${DORMANT} }
          vUv = position.xy + 0.5;
          gl_Position = vec4(mix(uRect.xy, uRect.zw, vUv), 0.0, 1.0);
        }`,
      fragmentShader: glsl`
        ${commonChunk}
        uniform sampler2D uMap;
        uniform vec2 uSize;
        uniform vec4 uLine;       // topo da fala atual · topo/base da row atual · x revelado
        uniform float uTextBottom;
        uniform float uPad;
        uniform float uCharW;
        uniform float uBlink;
        uniform float uTime;
        uniform float uGlitch;
        uniform float uAlpha;
        varying vec2 vUv;

        void main() {
          vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uSize;
          float tick = floor(uTime * 16.0);
          float band = floor(px.y / mix(26.0, 6.0, hash11(tick)));
          float shove = hash12(vec2(band, tick));
          float glitch = uGlitch * (0.3 + 0.7 * step(0.8, hash11(tick * 1.7)));
          px.x += (shove - 0.5) * 90.0 * glitch * step(0.68, shove);
          float split = (1.5 + 8.0 * glitch) * (0.5 + 0.5 * sin(uTime * 23.0));

          vec2 uv = vec2(px.x, uSize.y - px.y) / uSize;
          vec2 off = vec2(split / uSize.x, 0.0);
          vec4 base = texture2D(uMap, uv);
          vec3 color = vec3(texture2D(uMap, uv + off).r, base.g, texture2D(uMap, uv - off).b);

          bool inText = px.x > uPad * 0.5 && px.x < uSize.x - uPad * 0.5 && px.y < uTextBottom;
          bool after = px.y >= uLine.z;
          bool ahead = px.y >= uLine.y && px.y < uLine.z && px.x > uLine.w;
          bool blinkOff = uBlink > 0.5 && px.y >= uLine.x && px.y < uLine.z;
          if (inText && uLine.z > 0.0 && (after || ahead || blinkOff)) {
            color = texture2D(uMap, vec2(uPad * 0.25, uSize.y - px.y) / uSize).rgb;
          }
          float cursor = step(uLine.w, px.x) * step(px.x, uLine.w + uCharW * 0.9) * step(0.5, fract(uTime * 2.4));
          if (uLine.z > 0.0 && px.y > uLine.y + 3.0 && px.y < uLine.z - 3.0) color = mix(color, vec3(1.0, 0.75, 0.75), cursor);

          float flicker = 0.92 + 0.08 * hash11(tick * 3.1) - glitch * 0.35 * step(0.88, hash11(tick + 4.0));
          float noise = (hash12(px + fract(uTime) * 91.0) - 0.5) * 0.07 * (0.3 + glitch);
          gl_FragColor = vec4((color + noise) * flicker, base.a * uAlpha);
          #include <colorspace_fragment>
        }`,
      uniforms: {
        uMap: { value: null },
        uRect: { value: new Vector4(-0.5, -0.5, 0.5, 0.5) },
        uSize: { value: new Vector2(1, 1) },
        uLine: { value: new Vector4(-1, -1, -1, 0) },
        uTextBottom: { value: 0 },
        uPad: { value: 20 },
        uCharW: { value: 9 },
        uBlink: { value: 0 },
        uTime: { value: 0 },
        uGlitch: { value: 0 },
        uAlpha: { value: 1 },
        uActive: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }
}

/**
 * Sobreposição desenhada DEPOIS do composer (useFrame de prioridade 2),
 * direto na tela, com cores exatas (sem bloom/ACES):
 *   1. (tier sem composer) desenha a cena principal — com um useFrame de
 *      prioridade > 0 o R3F deixa de renderizar sozinho;
 *   2. o terminal sobre a imagem final;
 *   3. no frame do clique, copia o framebuffer (GPU→GPU, sem readPixels);
 *   4. dali em diante o túnel some, os cacos Zero-G desenham o frame
 *      capturado e se desfazem em poeira (as partículas da forja, na cena).
 */
export class OverlayRenderer {
  private readonly scene = new Scene();
  readonly quad = new PlaneGeometry(1, 1);
  readonly terminal = new TerminalMaterial();
  readonly field = createShardField();
  readonly shards = { geometry: this.field.geometry, material: new ZeroGShatterMaterial() };
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private texture: CanvasTexture | null = null;
  private drawn = { lines: -1, ready: false, w: 0, h: 0, scale: 0 };
  /** O último frame antes da falha (lido também pelas partículas da forja). */
  capture: FramebufferTexture | null = null;
  private readonly bufferSize = new Vector2();

  constructor() {
    this.scene.add(
      Object.assign(new Mesh(this.quad, this.terminal), { frustumCulled: false }),
      Object.assign(new Mesh(this.shards.geometry, this.shards.material), { frustumCulled: false }),
    );
  }

  /** Aquece a variante on-screen com um draw real (força o link; ver ParticleForge.compile), um programa por frame. */
  async compile(gl: WebGLRenderer, camera: Camera) {
    for (const object of [...this.scene.children]) {
      const stage = new Scene();
      stage.add(object);
      await warmGpu(gl, stage, camera, false);
      this.scene.add(object);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }

  render(d: MetropolisDirector, gl: WebGLRenderer, scene: Scene, camera: Camera, viewW: number, viewH: number, composer: boolean) {
    if (!composer) gl.render(scene, camera);
    const { stage, clock } = d;
    const terminalOn = !d.captured && (stage === 'intercept' || stage === 'shatter' || (stage === 'glitch' && clock > TIMING.glitch * 0.5));
    const shardsOn = d.captured && stage === 'shatter';
    if (!terminalOn && !shardsOn && !d.captureRequested) return;

    if (stage === 'intercept') this.prepareCapture(gl);
    this.terminal.uniforms.uActive.value = terminalOn ? 1 : 0;
    if (terminalOn) this.syncTerminal(d, viewW, viewH);

    const shatter = this.shards.material.uniforms;
    shatter.uActive.value = shardsOn ? 1 : 0;
    shatter.uClock.value = d.shatterClock;
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

  /** A textura de captura é alocada ANTES do clique (durante a interrupção): no clique, só a cópia. */
  private prepareCapture(gl: WebGLRenderer) {
    gl.getDrawingBufferSize(this.bufferSize);
    if (this.capture && this.capture.image.width === this.bufferSize.x && this.capture.image.height === this.bufferSize.y) return;
    this.capture?.dispose();
    this.capture = new FramebufferTexture(this.bufferSize.x, this.bufferSize.y);
    gl.initTexture(this.capture);
  }

  private syncTerminal(d: MetropolisDirector, viewW: number, viewH: number) {
    const layout = terminalLayout(viewW, viewH);
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const u = this.terminal.uniforms;

    if (!this.canvas || layout.w !== this.drawn.w || layout.h !== this.drawn.h || scale !== this.drawn.scale) {
      this.canvas ??= document.createElement('canvas');
      this.canvas.width = Math.round(layout.w * scale);
      this.canvas.height = Math.round(layout.h * scale);
      this.context = this.canvas.getContext('2d');
      this.texture?.dispose(); // tamanho novo = textura nova (armazenamento imutável na GPU)
      this.texture = new CanvasTexture(this.canvas);
      this.texture.colorSpace = SRGBColorSpace;
      this.texture.generateMipmaps = false;
      this.texture.minFilter = LinearFilter;
      u.uMap.value = this.texture;
      this.drawn = { lines: -1, ready: false, w: layout.w, h: layout.h, scale };
    }
    if (this.context && (this.drawn.lines !== d.interceptLines || this.drawn.ready !== d.interceptReady)) {
      drawTerminal(this.context, layout, scale, d.interceptLines, d.interceptReady);
      this.texture!.needsUpdate = true;
      this.drawn.lines = d.interceptLines;
      this.drawn.ready = d.interceptReady;
    }

    u.uRect.value.set((layout.x / viewW) * 2 - 1, 1 - ((layout.y + layout.h) / viewH) * 2, ((layout.x + layout.w) / viewW) * 2 - 1, 1 - (layout.y / viewH) * 2);
    u.uSize.value.set(layout.w, layout.h);
    u.uCharW.value = layout.charW;
    u.uPad.value = layout.pad;
    u.uTextBottom.value = layout.textBottom;
    const { line, chars } = d.typing;
    const typing = d.interceptReady || line < 0 ? null : typingState(layout, line, chars);
    if (typing) {
      u.uLine.value.set(typing.lineTop, typing.rowTop, typing.rowBottom, typing.reveal);
      // A fala recém-terminada pisca (sinal instável) até a próxima chegar.
      u.uBlink.value = typing.done && Math.sin(d.time * 26) > 0.35 ? 1 : 0;
    } else {
      u.uLine.value.set(-1, -1, -1, 0);
      u.uBlink.value = 0;
    }
    u.uTime.value = d.time;
    u.uGlitch.value = d.stage === 'glitch' ? 1 : d.stage === 'shatter' ? 0 : 0.14 + 0.8 * Math.exp(-(d.time - d.lineAt) * 4);
    u.uAlpha.value = d.stage === 'glitch' ? smoothstep(TIMING.glitch * 0.5, TIMING.glitch, d.clock) : 1;
  }

  dispose() {
    this.quad.dispose();
    this.terminal.dispose();
    this.shards.geometry.dispose();
    this.shards.material.dispose();
    this.texture?.dispose();
    this.capture?.dispose();
  }
}
