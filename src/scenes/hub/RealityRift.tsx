'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AddEquation,
  AdditiveBlending,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Camera,
  type Group,
  type WebGLRenderer,
  type Object3D,
  type PerspectiveCamera,
} from 'three';
import { TIER_PROFILES } from '@/engine/config/performance';
import { mulberry32 } from '@/engine/lib/random';
import { easeInQuad, progress, smoothstep } from '@/engine/lib/time';

import { useAppStore } from '@/engine/store/useAppStore';
import { glsl, vec3 } from '@/shaders/glsl';
import { FLOOD_LIGHT } from '../shared/flood';
import { commonChunk } from '@/shaders/chunks/common.glsl';
import { PALETTE } from '../shared/palette';
import { transitionFx } from '../shared/transitions/fxState';
import { RIFT_HANDOFF } from '../shared/handoff';
import type { RiftPreview } from '../realm-architecture/metropolis/preview';
import { RIFT, type HubDirector } from './director';

/**
 * A FISSURA DA REALIDADE — o fruto 1 trinca e um rasgo se abre no ar.
 *
 * Tudo vive num grupo voltado para a câmera, no lugar do fruto (espaço
 * local: x lateral, y vertical, z em direção à câmera):
 *   RASGO   um quad cujo shader desenha a fenda: linha central em zigue-
 *           zague (raio), largura em lente com borda rasgada, linhas
 *           deslocadas aos trancos (geometria corrompida). Por DENTRO, o
 *           outro lado: o escuro esmeralda do túnel com chuva de dados.
 *           A borda queima em HDR: o bloom e os raios volumétricos (passe
 *           de pós 'rift') nascem dela.
 *   CACOS   triângulos de vidro arrancados das bordas, girando, voando
 *           devagar contra a câmera (desaceleram: sem gravidade).
 *   FAÍSCAS milhares de partículas de energia vazando do rasgo.
 * A forma da fenda é a MESMA função GLSL nos três: cacos e faíscas nascem
 * exatamente na borda. Fora da ruptura, tudo colapsa no vertex shader.
 */

const EMERALD = vec3(PALETTE.emerald);
const FLOOD = vec3(FLOOD_LIGHT);
const SPARKS = 3600;
const SHARDS = 150;

const riftChunk = glsl`
${commonChunk}
uniform float uOpen;
uniform float uLen;

/** Linha central: segmentos retos entre pontos aleatórios (um raio) + uma curva lenta. */
float riftCenter(float y) {
  float s = y * 9.0;
  float i = floor(s);
  return mix(hash11(i + 11.0) - 0.5, hash11(i + 12.0) - 0.5, fract(s)) * 0.09 + sin(y * 3.1) * 0.05;
}

/** Meia-largura: lente que afina nas pontas, com a borda rasgada. */
float riftHalfWidth(float y) {
  float t = clamp(abs(y) / max(uLen, 1e-3), 0.0, 1.0);
  // Dentada enquanto estreita; ao escancarar, o recorte suaviza (senão vira um "pente" de traços varrendo a tela).
  float rag = mix(0.65 + 0.35 * hash11(floor(y * 26.0) + 3.0), 1.0, smoothstep(2.5, 9.0, uOpen));
  return uOpen * 0.22 * pow(1.0 - t * t, 0.65) * rag;
}
`;

const PREMULTIPLIED = {
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
} as const;
const LIGHT = { transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending } as const;

class RiftMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        uniform float uLen;
        uniform float uSpan;
        varying vec2 vQ;
        void main() {
          if (uLen <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          // A faixa desenhada acompanha a largura da abertura (uSpan) — sem escalar o rasgo:
          // a chuva de dados e a borda mantêm o tamanho, nada de "zoom".
          vQ = vec2(position.x * uSpan, position.y);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(vQ, 0.0, 1.0);
        }`,
      fragmentShader: glsl`
        ${riftChunk}
        uniform float uSpan;
        uniform float uTime;
        uniform float uCorrupt;
        uniform float uFlood;
        uniform sampler2D uPreview;
        uniform float uHasPreview;
        uniform vec2 uResolution;
        varying vec2 vQ;

        void main() {
          // Geometria corrompida: faixas horizontais deslocadas aos trancos.
          float tick = floor(uTime * 18.0);
          float row = floor(vQ.y * 34.0);
          float x = vQ.x + (hash11(row * 1.7 + tick) - 0.5) * 0.07 * uCorrupt * step(0.62, hash11(row + tick * 3.1));
          float y = vQ.y;
          float along = 1.0 - smoothstep(uLen * 0.9, uLen, abs(y));
          float c = riftCenter(y);
          float d = abs(x - c) - riftHalfWidth(y);

          // O outro lado: o escuro do túnel, com dados chovendo para dentro…
          float column = floor(x * 140.0);
          float rain = pow(fract(y * 2.5 + uTime * (0.8 + hash11(column) * 1.4) + hash11(column + 7.0)), 18.0)
                     * step(0.55, hash11(column + 31.0));
          vec3 beyond = vec3(0.0, 0.022, 0.018) + ${EMERALD} * (exp(d * 16.0) * 0.9 + rain * 0.5);
          // Com a prévia: o outro lado É a Fase 1, ao vivo (amostrada em coordenadas de tela — um portal).
          vec3 tunnel = texture2D(uPreview, gl_FragCoord.xy / uResolution).rgb + ${EMERALD} * exp(d * 22.0) * 0.35;
          beyond = mix(beyond, tunnel, uHasPreview);
          // Sem a prévia (reserva): a luz de lá inunda tudo.
          vec3 inside = mix(beyond, ${FLOOD} * (0.92 + 0.16 * rain), uFlood);

          float core = exp(-abs(d) * 110.0) * 4.5;
          // Halo curto, preso à borda; some quando a luz do outro lado toma a tela.
          // Decai dos DOIS lados do lábio (com max(d, 0) valia 1 dentro da abertura inteira: névoa sobre o túnel).
          float halo = exp(-(d > 0.0 ? d * 14.0 : -d * 40.0)) * 0.55 * smoothstep(uSpan, uSpan * 0.45, abs(vQ.x)) * (1.0 - uFlood);
          vec3 light = (vec3(0.82, 1.0, 0.96) * core * (1.0 - uFlood) + mix(${EMERALD}, vec3(0.3, 0.9, 1.0), 0.35) * halo) * along;
          float occupy = step(d, 0.0) * along;
          gl_FragColor = vec4(inside * occupy + light * (1.0 - occupy * 0.6), occupy);
        }`,
      uniforms: {
        uOpen: { value: 0 },
        uLen: { value: 0 },
        uSpan: { value: 1 },
        uTime: { value: 0 },
        uCorrupt: { value: 0 },
        uFlood: { value: 0 },
        uPreview: { value: null },
        uHasPreview: { value: 0 },
        uResolution: { value: new Vector2(1, 1) },
      },
      ...PREMULTIPLIED,
    });
  }
}

/** Cacos de vidro arrancados da borda: giram e flutuam contra a câmera, desacelerando. */
class ShardMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        ${riftChunk}
        attribute vec4 aSeed;
        uniform float uBurst;
        varying vec3 vView;
        varying float vFade;

        vec3 rotate(vec3 v, vec3 axis, float angle) {
          float c = cos(angle);
          float s = sin(angle);
          return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
        }

        void main() {
          float t = uBurst - aSeed.w * 0.5;
          if (t <= 0.0 || uOpen <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float y0 = (aSeed.x * 2.0 - 1.0) * uLen * 0.9;
          float side = aSeed.y > 0.5 ? 1.0 : -1.0;
          vec3 start = vec3(riftCenter(y0) + side * riftHalfWidth(y0), y0, 0.0);
          vec3 velocity = vec3(side * (0.25 + 0.8 * aSeed.z), (aSeed.x - 0.5) * 0.5, 0.6 + 2.0 * fract(aSeed.z * 7.3));
          vec3 axis = normalize(vec3(aSeed.z - 0.5, aSeed.y - 0.5, 0.4));
          vec3 local = rotate(position * (0.025 + 0.05 * fract(aSeed.w * 5.7)), axis, t * (2.0 + 4.0 * aSeed.x));
          vec3 p = start + velocity * (1.0 - exp(-t * 1.5)) / 1.5 + local;
          vec4 view = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * view;
          vView = view.xyz;
          vFade = 1.0 - smoothstep(1.3, 2.3, t);
        }`,
      fragmentShader: glsl`
        varying vec3 vView;
        varying float vFade;
        void main() {
          vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
          float glint = pow(abs(dot(n, normalize(vec3(0.3, 0.6, 0.75)))), 12.0);
          vec3 color = mix(${EMERALD} * 0.5, vec3(0.75, 1.0, 1.0), glint) * (0.35 + glint * 3.0);
          gl_FragColor = vec4(color * vFade, 1.0);
        }`,
      uniforms: { uOpen: { value: 0 }, uLen: { value: 0 }, uBurst: { value: 0 } },
      side: DoubleSide,
      ...LIGHT,
    });
  }
}

/** Faíscas de energia vazando do rasgo (laço contínuo: cada uma renasce na fenda). */
class SparkMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        ${riftChunk}
        attribute vec4 aSeed;
        uniform float uTime;
        uniform float uRate;
        uniform float uPixel;
        varying vec3 vColor;
        void main() {
          if (aSeed.x > uRate || uOpen <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float period = 0.7 + 0.9 * aSeed.z;
          float age = mod(uTime + aSeed.w * period, period);
          float life = age / period;
          float y0 = (aSeed.y * 2.0 - 1.0) * uLen;
          vec3 start = vec3(riftCenter(y0) + (fract(aSeed.w * 13.7) * 2.0 - 1.0) * riftHalfWidth(y0) * 0.7, y0, 0.0);
          vec3 velocity = vec3((fract(aSeed.z * 5.1) - 0.5) * 1.5, (fract(aSeed.x * 3.3) - 0.5) * 0.7 + 0.12, 0.5 + 1.8 * fract(aSeed.y * 9.7));
          vec3 p = start + velocity * age + vec3(sin(age * 9.0 + aSeed.w * 30.0) * 0.025, 0.0, 0.0);
          vec4 view = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * view;
          gl_PointSize = clamp(0.012 * uPixel / max(-view.z, 0.1), 1.0, 6.0);
          vec3 hot = mix(vec3(0.85, 1.0, 0.97), mix(vec3(0.3, 0.9, 1.0), ${EMERALD}, life), smoothstep(0.0, 0.35, life));
          vColor = hot * pow(1.0 - life, 1.4) * 2.2;
        }`,
      fragmentShader: glsl`
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vColor * smoothstep(0.5, 0.1, d), 1.0);
        }`,
      uniforms: { uOpen: { value: 0 }, uLen: { value: 0 }, uTime: { value: 0 }, uRate: { value: 0 }, uPixel: { value: 800 } },
      ...LIGHT,
    });
  }
}

function createShardGeometry() {
  const rng = mulberry32(0x41f7);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([-0.5, -0.4, 0, 0.6, -0.2, 0, -0.1, 0.7, 0], 3));
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(Array.from({ length: SHARDS * 4 }, rng)), 4));
  return geometry;
}

function createSparkGeometry() {
  const rng = mulberry32(0x5a12);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(SPARKS * 3), 3));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(new Float32Array(Array.from({ length: SPARKS * 4 }, rng)), 4));
  return geometry;
}

/** Escala do rasgo no mundo (fixa: o quad mede ±uSpan × ±QUAD_HEIGHT nessa escala). */
const SIZE = 1.5;
const QUAD_HEIGHT = 16;

/** Recursos de GPU da fissura — parte do kit da hub (aquecidos durante a intro, não na abertura da hub). */
export interface RiftKit {
  quad: BufferGeometry;
  shardGeometry: BufferGeometry;
  sparkGeometry: BufferGeometry;
  materials: { rift: RiftMaterial; shards: ShardMaterial; sparks: SparkMaterial };
}

export const RIFT_SHARDS = SHARDS;

export function createRiftKit(): RiftKit {
  return {
    // Alto (y em ±QUAD_HEIGHT): a fenda precisa passar do topo e da base da tela antes de abrir para os lados.
    quad: new PlaneGeometry(2, 2 * QUAD_HEIGHT),
    shardGeometry: createShardGeometry(),
    sparkGeometry: createSparkGeometry(),
    materials: { rift: new RiftMaterial(), shards: new ShardMaterial(), sparks: new SparkMaterial() },
  };
}

/** O maestro por frame (classe: as escritas ficam fora do modelo de imutabilidade do React Compiler). */
class RiftFrame {
  private readonly world = new Vector3();
  private readonly ndc = new Vector3();
  private readonly forward = new Vector3();
  private readonly offset = new Vector3();

  private createPreview: (() => RiftPreview) | null = null;
  private preview: RiftPreview | null = null;
  private readonly buffer = new Vector2();

  constructor(private readonly materials: RiftKit['materials']) {}

  /** O módulo da prévia chega por import dinâmico (já pré-carregado pelo SceneRouter). */
  setPreviewFactory(create: (() => RiftPreview) | null) {
    this.createPreview = create;
  }

  dispose() {
    this.preview?.dispose();
    this.preview = null;
  }

  sync(director: HubDirector, root: Group, camera: Camera, gl: WebGLRenderer, fruit: Object3D | undefined, time: number, pixelHeight: number) {
    const k = director.riftClock;
    if (fruit) {
      fruit.getWorldPosition(this.world);
      // A trinca: o fruto estremece e é sugado para dentro da própria fenda.
      const suck = easeInQuad(progress(k, 0.1, RIFT.crack[1] + 0.15));
      const tremor = Math.sin(k * 70) * 0.04 * (1 - suck);
      fruit.scale.set((1 - suck) * (1 + tremor), 1 - suck * 0.4, 1 - suck);
      fruit.visible = suck < 0.999;
    }
    root.quaternion.copy(camera.quaternion);

    const camera3 = camera as PerspectiveCamera;
    const crack = progress(k, ...RIFT.crack);
    const rise = 1 - (1 - progress(k, ...RIFT.rise)) ** 4; // dispara e freia (easeOutQuart)
    const tension = progress(k, ...RIFT.tension);
    const pullK = progress(k, ...RIFT.pull);
    const flood = smoothstep(RIFT.flood[0], RIFT.flood[1], k);

    // Geometria da tela na profundidade do fruto.
    camera.getWorldDirection(this.forward);
    const depth = this.offset.copy(this.world).sub(camera.position).dot(this.forward);
    const halfH = Math.tan((camera3.fov * Math.PI) / 360) * depth;
    const halfW = halfH * camera3.aspect;
    this.ndc.copy(this.world).project(camera);

    // O rasgo fica onde nasceu (no fruto) do começo ao fim.
    root.position.copy(this.world);

    // Altura: passa do topo e da base da tela — e no puxão segue crescendo, para a lente ficar reta na tela.
    const reach = (halfH * (1.25 + Math.abs(this.ndc.y))) / SIZE;
    const pullGrowth = pullK < 0.18 ? 0 : (pullK - 0.18) / 0.82;
    const len = Math.min(QUAD_HEIGHT * 0.95, 0.3 * crack + (reach - 0.3) * rise + reach * 1.5 * pullGrowth);

    // Largura (mundo): o tecido resiste (trancos) e então rasga ACELERANDO até bem além das bordas.
    // Mira o canto da tela MAIS LONGE do fruto (fora do centro, um lado fica bem mais distante):
    // a borda distante varre a tela rápido em vez de se arrastar. ÷ 0,65: a borda dentada encolhe até 65%.
    const tug = pullK < 0.18 ? smoothstep(0, 0.18, pullK) : 1;
    const tear = pullGrowth ** 2.2;
    const farthest = Math.hypot(halfW * (1 + Math.abs(this.ndc.x)), halfH * (1 + Math.abs(this.ndc.y)));
    const need = (farthest * 1.2) / 0.65;
    const halfWidthWorld = SIZE * 0.22 * (0.3 * tug + 0.12 * Math.sin(pullK * 38) * (1 - pullK)) + tear * need;
    // Só a ABERTURA cresce (em unidades locais fixas); o rasgo não muda de escala — sem zoom.
    const width = 0.035 + 0.02 * crack + 0.015 * tension * Math.abs(Math.sin(k * 31)) + halfWidthWorld / (SIZE * 0.22);
    const span = Math.max(1, width * 0.22 * 1.08 + 0.4);
    root.scale.setScalar(SIZE);

    const { rift, shards, sparks } = this.materials;
    rift.uniforms.uLen.value = len;
    rift.uniforms.uOpen.value = width;
    rift.uniforms.uSpan.value = span;
    rift.uniforms.uTime.value = time;
    // A corrupção cessa quando o rasgo termina de abrir (as faixas deslocadas mostrariam a borda do quad).
    rift.uniforms.uCorrupt.value = (0.35 + 0.65 * tension * (1 - pullK)) * (1 - smoothstep(0.25, 0.5, pullK));
    shards.uniforms.uLen.value = len;
    shards.uniforms.uOpen.value = width;
    shards.uniforms.uBurst.value = Math.max(0, k - RIFT.pull[0] - 0.2); // o tecido se rasga: os cacos voam no puxão
    sparks.uniforms.uLen.value = len;
    sparks.uniforms.uOpen.value = width;
    sparks.uniforms.uTime.value = time;
    sparks.uniforms.uRate.value = Math.min(1, crack * 0.15 + rise * 0.45 + pullK * 0.4);
    sparks.uniforms.uPixel.value = pixelHeight / (2 * Math.tan((camera3.fov * Math.PI) / 360));

    // ── O PORTAL: pela fenda, a Fase 1 ao vivo no COMEÇO do túnel (progresso 0, câmera na entrada):
    // o hangar acende faixa a faixa, de perto para longe, a partir do instante em que o rasgo começa a
    // abrir. O reino continua deste estado (mesmo relógio: o que já acendeu segue aceso).
    this.preview ??= this.createPreview?.() ?? null;
    if (this.preview && pullK > 0) {
      this.preview.render(gl, 0, Math.max(0, k - RIFT.pull[0]), camera3.aspect);
      gl.getDrawingBufferSize(this.buffer);
      rift.uniforms.uPreview.value = this.preview.target.texture;
      rift.uniforms.uHasPreview.value = 1;
      rift.uniforms.uResolution.value.copy(this.buffer);
      RIFT_HANDOFF.fromRift = true;
      RIFT_HANDOFF.progress = this.preview.progress;
      RIFT_HANDOFF.time = this.preview.time;
    }
    rift.uniforms.uFlood.value = this.preview ? 0 : flood;
    // A luz nasce dos dois lábios da fenda (meia-abertura em alturas de tela).
    transitionFx.spread = Math.min(halfWidthWorld / (2 * halfH), 4);

    // A luz volumétrica: o passe de pós desenha a luz da fenda (só onde há composer).
    if (TIER_PROFILES[useAppStore.getState().performanceTier].bloom) {
      transitionFx.kind = 'rift';
      transitionFx.progress = progress(k, RIFT.crack[1] * 0.5, RIFT.end);
      transitionFx.origin.set(this.ndc.x * 0.5 + 0.5, this.ndc.y * 0.5 + 0.5);
    }
  }
}

export function RealityRift({ kit, director }: { kit: RiftKit; director: HubDirector }) {
  const group = useRef<Group>(null);
  const [frame] = useState(() => new RiftFrame(kit.materials));
  const gl = useThree((state) => state.gl);
  const { rift, shards, sparks } = kit.materials;

  // A Fase 1 vista pela fenda: o módulo do reino já está em cache (pré-carregado), o import é instantâneo.
  useEffect(() => {
    let alive = true;
    import('../realm-architecture/metropolis/preview').then(({ RiftPreview }) => {
      if (alive) frame.setPreviewFactory(() => new RiftPreview(gl));
    });
    return () => {
      alive = false;
      frame.setPreviewFactory(null);
      frame.dispose();
    };
  }, [frame, gl]);

  useFrame(({ camera, scene, clock, size, viewport }) => {
    if (director.riftClock < 0 || !group.current) return;
    frame.sync(director, group.current, camera, gl, scene.getObjectByName('fruit:architecture'), clock.elapsedTime, size.height * viewport.dpr);
  });

  return (
    <group ref={group} name="reality-rift">
      <mesh geometry={kit.quad} material={rift} renderOrder={40} frustumCulled={false} />
      <instancedMesh args={[kit.shardGeometry, shards, SHARDS]} renderOrder={41} frustumCulled={false} />
      <points geometry={kit.sparkGeometry} material={sparks} renderOrder={42} frustumCulled={false} />
    </group>
  );
}
