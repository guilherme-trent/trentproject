import { Color, Uniform, Vector2, type Camera, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { Effect, EffectAttribute, EffectPass } from 'postprocessing';
import { glsl } from '@/shaders/glsl';
import { voronoiChunk } from '@/shaders/chunks/voronoi.glsl';
import { noiseChunk } from '@/shaders/chunks/noise.glsl';
import { blueprintChunk, streaksChunk } from './chunks.glsl';
import { transitionFx, type TransitionFxKind } from './fxState';

const MODE: Record<TransitionFxKind, number> = { shatter: 1, warp: 2, swallow: 3, rift: 4 };

/**
 * A sobreposição de transição: UM efeito de pós-processamento, três matemáticas.
 *
 * Fica sempre montado no composer global (compila no boot, nunca no clique).
 * Fora de uma transição, `uMode = 0` retorna a imagem intacta num branch
 * uniforme — a GPU não paga nada além de uma leitura.
 *
 * É um efeito de CONVOLUÇÃO: amostra `inputBuffer` (a cena já com bloom) em
 * coordenadas deslocadas — é assim que os cacos mostram a imagem girada e o
 * warp arrasta a imagem em direção ao centro.
 */
const fragmentShader = glsl`
uniform float uMode;     // 0 nenhum · 1 shatter · 2 warp · 3 swallow
uniform float uProgress; // 0 → 1
uniform vec2 uOrigin;    // UV de tela onde a transição nasce
uniform vec3 uColor;
uniform float uAspect;
uniform float uClock;
uniform float uSpread; // rift: meia-abertura da fenda na tela (alturas de tela)

${voronoiChunk}
${noiseChunk}
${blueprintChunk}
${streaksChunk}

// ─────────────────────────────────────────────────────────────────────────────
// SHATTER — "Tela Trincada"
//   0.00–0.40  a teia de rachaduras se propaga a partir do fruto; os cacos
//              se desalinham levemente (vidro trincado, ainda no lugar)
//   0.40–1.00  os cacos despencam com gravidade — os mais próximos do impacto
//              primeiro —, girando, revelando o vazio-planta do reino.
//
// Geometria do vidro: Voronoi em coordenadas POLAR-LOGARÍTMICAS ao redor do
// impacto, (ângulo × ANGULAR, ln(r) × RADIAL). Células uniformes nesse espaço
// viram cunhas alongadas radialmente na tela, minúsculas junto ao impacto
// (pó de vidro) e largas na periferia — a teia de um vidro estilhaçado. O
// eixo angular é periódico: sem costura em ±180°.
//
// Queda por mapeamento INVERSO: para cada pixel, partimos do caco a que ele
// pertence, desfazemos a queda (translação, rotação, escala) e perguntamos ao
// Voronoi se o ponto de origem ainda pertence ao MESMO caco. Se sim, o pixel
// mostra a imagem daquele ponto; se não, é buraco — e o vazio aparece.
// ─────────────────────────────────────────────────────────────────────────────
const float SHARD_ANGULAR = 18.0; // cunhas ao redor do impacto
const float SHARD_RADIAL = 1.7;   // anéis por unidade de ln(r): baixo = cacos alongados

vec2 shardSpace(vec2 screen, vec2 origin) {
  vec2 d = screen - origin;
  return vec2((atan(d.y, d.x) / 6.2831853 + 0.5) * SHARD_ANGULAR, log(length(d) + 0.015) * SHARD_RADIAL);
}

vec2 shardToScreen(vec2 q, vec2 origin) {
  float angle = (q.x / SHARD_ANGULAR - 0.5) * 6.2831853;
  float radius = exp(q.y / SHARD_RADIAL) - 0.015;
  return origin + radius * vec2(cos(angle), sin(angle));
}

vec3 shatter(vec2 uv) {
  vec2 aspect = vec2(uAspect, 1.0);
  vec2 screen = uv * aspect;
  vec2 origin = uOrigin * aspect;
  float maxDist = length(aspect);

  vec2 id; vec2 center; float border;
  vorCell(shardSpace(screen, origin), SHARD_ANGULAR, id, center, border);
  vec2 shardCenter = shardToScreen(center, origin);
  float dist = length(shardCenter - origin);

  // Frente de propagação da teia.
  float front = smoothstep(0.0, 0.4, uProgress) * maxDist * 1.15;
  float cracked = 1.0 - smoothstep(front - 0.12, front, dist);

  // Queda com gravidade, escalonada pela distância ao impacto.
  float delay = (dist / maxDist) * 0.35;
  float fall = smoothstep(0.4 + delay, 0.4 + delay + 0.55, uProgress);

  vec2 rnd = vorHash22(id + 17.0);
  float angle = (rnd.x - 0.5) * 2.2 * fall;
  float scale = 1.0 - fall * 0.3 * rnd.y;
  vec2 drift = vec2((rnd.y - 0.5) * 0.3 * fall, -1.8 * fall * fall);
  vec2 nudge = (rnd - 0.5) * 0.006 * cracked; // trinca: o caco se desloca, ainda preso

  vec2 local = screen - shardCenter - drift;
  float c = cos(-angle);
  float s = sin(-angle);
  vec2 source = shardCenter + mat2(c, -s, s, c) * local / scale;

  // Antes da queda o caco está no lugar: o ponto de origem é o próprio pixel e
  // o segundo Voronoi seria redundante. Pular metade do custo na fase de trinca.
  float covered = 1.0;
  float sourceBorder = border;
  if (fall > 0.0) {
    vec2 sourceId; vec2 sourceCenter;
    vorCell(shardSpace(source, origin), SHARD_ANGULAR, sourceId, sourceCenter, sourceBorder);
    vec2 diff = abs(sourceId - id);
    covered = 1.0 - step(0.5, diff.x + diff.y);
  }

  vec3 image = texture2D(inputBuffer, clamp((source + nudge) / aspect, 0.0, 1.0)).rgb;

  // Largura da rachadura em ESPAÇO DE TELA: no espaço log-polar uma célula
  // cresce com r, então convertemos para não engrossar longe do impacto.
  float pixelToCell = SHARD_RADIAL / max(length(source - origin), 0.03);
  float edge = 1.0 - smoothstep(0.0, 0.0016 * pixelToCell * (1.0 + fall), sourceBorder);
  // Intensidade contida: o bloom (depois deste passe) já faz as rachaduras brilharem.
  vec3 crackLight = mix(uColor, vec3(1.0), 0.7) * edge * cracked * (0.7 + 1.3 * (1.0 - fall));
  vec3 shard = image * (1.0 - fall * 0.45) + crackLight;

  vec3 revealed = blueprintVoid(uv, uAspect, uClock, uColor) * smoothstep(0.4, 0.7, uProgress);
  vec3 color = mix(revealed, shard, covered);

  // O impacto: um clarão curto no fruto antes de a teia se espalhar.
  float impact = exp(-length(screen - origin) * 14.0) * smoothstep(0.0, 0.03, uProgress)
               * (1.0 - smoothstep(0.03, 0.22, uProgress));
  return color + uColor * impact * 6.0;
}

// ─────────────────────────────────────────────────────────────────────────────
// WARP — "Mergulho Warp"
//   Zoom blur radial em direção ao fruto (10 amostras, aberração cromática por
//   canal), estrias de hiperespaço e TUNNEL VISION: a periferia escurece num
//   anel que se fecha até restar só a luz no fim do túnel.
// ─────────────────────────────────────────────────────────────────────────────
vec3 warp(vec2 uv) {
  float k = uProgress;
  float pull = k * k;
  vec2 dir = uv - uOrigin;

  vec3 blurred = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    float z = (float(i) / 9.0) * pull * 0.5;
    blurred.r += texture2D(inputBuffer, uv - dir * z).r;
    blurred.g += texture2D(inputBuffer, uv - dir * z * 1.05).g;
    blurred.b += texture2D(inputBuffer, uv - dir * z * 1.1).b;
  }
  blurred *= 0.1;

  vec2 d = dir * vec2(uAspect, 1.0);
  float r = length(d);
  float streaks = hyperStreaks(d, uClock * (1.0 + 9.0 * pull)) * pull * 3.0;
  float tunnel = 1.0 - smoothstep(mix(0.9, 0.04, pull), mix(1.7, 0.3, pull), r);
  vec3 hot = mix(uColor, vec3(1.0), 0.6);
  vec3 endLight = hot * exp(-r * r * mix(60.0, 2.5, pull)) * pull * 3.5;
  return (blurred + hot * streaks) * tunnel + endLight;
}

// ─────────────────────────────────────────────────────────────────────────────
// SWALLOW — "Engolido" (a câmera é atraída; aqui, o tecido líquido)
//   Aqui só o acabamento: ondas concêntricas distorcem a imagem conforme o
//   tecido se aproxima, e um véu sólido garante cobertura total no fim (as
//   bordas do tecido passam do plano near da câmera e seriam recortadas).
// ─────────────────────────────────────────────────────────────────────────────
vec3 swallow(vec2 uv) {
  float k = uProgress;
  float ring = length((uv - uOrigin) * vec2(uAspect, 1.0));
  float ripple = sin(ring * 38.0 - uClock * 11.0) * 0.006 * smoothstep(0.35, 0.9, k);
  vec3 image = texture2D(inputBuffer, uv + ripple).rgb;
  // Mesma fórmula da chegada ao reino Experience (continuidade). uColor² com
  // intensidade contida: o ACES e o sRGB não lavam o ouro para creme/cáqui.
  vec3 liquid = uColor * uColor * 0.62 * (0.85 + 0.15 * sin(uClock * 2.5 + uv.y * 7.0));
  return mix(image, liquid, smoothstep(0.8, 1.0, k));
}

// ─────────────────────────────────────────────────────────────────────────────
// RIFT — a luz da fissura do fruto 1
//   A luz nasce da PRÓPRIA fenda (uma linha vertical em uOrigin.x que se abre
//   em dois lábios a ±uSpread), não do que já brilha na cena: os mesmos
//   feixes horizontais dos dois lados, um halo largo e um núcleo junto aos
//   lábios. (A versão anterior marchava até um ponto somando o que brilhava
//   no caminho: o tronco da árvore era arrastado em "ondas" à esquerda e a
//   direita, sem nada brilhante, ficava apagada.) Sem amostras extras.
// ─────────────────────────────────────────────────────────────────────────────
vec3 rift(vec2 uv) {
  float k = uProgress;
  float strength = smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.8, 1.0, k));
  float split = 0.004 * smoothstep(0.5, 1.0, k);
  vec2 dir = uv - uOrigin;
  vec3 image = vec3(
    texture2D(inputBuffer, uv + dir * split).r,
    texture2D(inputBuffer, uv).g,
    texture2D(inputBuffer, uv - dir * split).b
  );
  float edge = abs(abs(uv.x - uOrigin.x) * uAspect - uSpread);
  float beams = 0.45 + 0.55 * valueNoise(vec2(uv.y * 42.0, uClock * 0.7)) * valueNoise(vec2(uv.y * 9.0 + 3.0, uClock * 0.35));
  // Presa aos lábios: quando eles saem da tela, a luz sai junto (nada de névoa sobre o túnel do outro lado).
  float glow = exp(-edge * 16.0) * 0.4 + exp(-edge * 6.0) * 0.12 * beams;
  return image + vec3(0.22, 0.95, 0.72) * glow * strength;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uMode < 0.5) {
    outputColor = inputColor;
    return;
  }
  vec3 color = uMode < 1.5 ? shatter(uv) : uMode < 2.5 ? warp(uv) : uMode < 3.5 ? swallow(uv) : rift(uv);
  outputColor = vec4(color, inputColor.a);
}
`;

export class TransitionEffect extends Effect {
  private clock = 0;

  constructor() {
    super('TransitionEffect', fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uMode', new Uniform(0)],
        ['uProgress', new Uniform(0)],
        ['uOrigin', new Uniform(new Vector2(0.5, 0.5))],
        ['uColor', new Uniform(new Color(1, 1, 1))],
        ['uAspect', new Uniform(1)],
        ['uClock', new Uniform(0)],
        ['uSpread', new Uniform(0)],
      ]),
    });
  }

  /** Lê o estado compartilhado (escrito pelo diretor da hub) a cada frame. */
  override update(_renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget, deltaTime = 0) {
    const uniforms = this.uniforms;
    this.clock += deltaTime;
    uniforms.get('uMode')!.value = transitionFx.kind ? MODE[transitionFx.kind] : 0;
    uniforms.get('uProgress')!.value = transitionFx.progress;
    (uniforms.get('uOrigin')!.value as Vector2).copy(transitionFx.origin);
    (uniforms.get('uColor')!.value as Color).copy(transitionFx.color);
    uniforms.get('uAspect')!.value = inputBuffer.width / Math.max(1, inputBuffer.height);
    uniforms.get('uClock')!.value = this.clock;
    uniforms.get('uSpread')!.value = transitionFx.spread;
  }
}

/** Frames em que o passe roda no boot só para compilar o shader (antes de qualquer clique). */
const WARMUP_FRAMES = 3;

/**
 * O passe que hospeda o TransitionEffect — separado do Bloom de propósito.
 *
 * No mergeMode "auto" do @react-three/postprocessing, efeitos sem convolução
 * (Bloom, ToneMapping) são FUNDIDOS com este num único EffectPass, e num passe
 * fundido todos os efeitos leem a mesma entrada: o bloom seria calculado sobre
 * a cena original, e o halo da árvore intacta apareceria por cima dos cacos
 * (bug observado). Como passe próprio, o bloom lê a imagem já transformada.
 *
 * Fora de uma transição, `enabled = false`: o composer pula o passe inteiro
 * (custo zero, nem a cópia de tela cheia).
 */
export class TransitionPass extends EffectPass {
  private warmupFrames = 0;

  constructor(camera: Camera) {
    super(camera, new TransitionEffect());
  }

  /** Chamado uma vez por frame, antes do composer renderizar. */
  sync() {
    const warming = this.warmupFrames < WARMUP_FRAMES;
    if (warming) this.warmupFrames++;
    this.enabled = warming || transitionFx.kind !== null;
  }
}
