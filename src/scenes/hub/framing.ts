import type { YggdrasilData } from './yggdrasil/generator';

/**
 * Enquadramento da Yggdrasil: contra-plongée suave com as raízes À VISTA.
 *
 * Em vez de ajustar distância e altura por tentativa, o quadro é especificado
 * pelo que ele deve mostrar, e a câmera é RESOLVIDA a partir disso:
 *   - a borda inferior fica um pouco abaixo das pontas das raízes: elas
 *     dissolvem no escuro DENTRO da tela (o shader as leva a opacidade 0);
 *   - a borda superior corta a copa: os galhos transbordam e somem acima;
 *   - a câmera inclina `PITCH_DEGREES` para cima — o ângulo baixo de gigantismo,
 *     agora sem esconder a base da árvore.
 *
 * Com a inclinação p e meia-abertura h, um raio de ângulo a cruza o plano do
 * eixo (z = 0) em y = camY + d·tan(a). Fixando as bordas yBottom/yTop:
 *     d    = (yTop − yBottom) / (tan(p + h) − tan(p − h))
 *     camY = yBottom − d·tan(p − h)
 * Em telas estreitas (retrato), a LARGURA domina — e o que precisa caber não
 * é a copa (as pontas dissolvem no escuro), são os FRUTOS: a distância mínima
 * é resolvida projetando cada fruto ao longo de todo o balanço da árvore (ver
 * `fitFruits`). Com a câmera mais longe, sobra altura: a árvore inteira é
 * centralizada na vertical em vez de ficar ancorada nas raízes (no celular,
 * ancorada, ela ficava espremida na parte de baixo da tela).
 *
 * Continuidade com a intro: a câmera fica no plano x = 0 e sem rolagem, então
 * o eixo da árvore é projetado na vertical central da tela — onde o feixe
 * estava. `beamSpan` é o trecho desse eixo visível: a árvore brota de dentro dele.
 */

export const BASE_FOV = 45;

/** Inclinação da câmera para cima. */
const PITCH_DEGREES = 6;
/** Folga abaixo das pontas das raízes (fração da altura da árvore). */
const ROOT_MARGIN = 0.05;
/** Quanto da copa transborda acima do quadro (fração da altura da árvore). */
const CANOPY_OVERFLOW = 0.18;
/** Fração da largura da árvore que precisa caber na horizontal. */
const WIDTH_FILL = 0.62;
/** Eleva o quadro inteiro (fração da altura da árvore), mantendo inclinação e escala. */
const CAMERA_LIFT = 0.085;
/** Retrato: altura (fração do quadro, de baixo) onde fica o centro da árvore — um pouco acima do meio. */
const CENTER_AT = 0.56;
/** Retrato: fração mínima do quadro abaixo das raízes (o diálogo ocupa a parte de baixo). */
const BOTTOM_ROOM = 0.12;

/**
 * O que precisa caber na horizontal: os frutos (posição no plano XZ da árvore,
 * raio do conteúdo em volta deles — gaiola de correntes + halo) ao longo do
 * balanço da árvore (faixa de guinada).
 */
export interface FramingFocus {
  points: readonly (readonly [number, number])[];
  radius: number;
  yaw: readonly [min: number, max: number];
}

/**
 * Deslocamento lateral máximo da câmera (parallax do ponteiro + deriva), em
 * unidades de mundo. Em retrato quase não há parallax: no celular o "ponteiro"
 * é o dedo, e um toque arrastaria os frutos para fora da tela estreita.
 */
export function lateralDrift(aspect: number) {
  const k = Math.min(1, Math.max(0, (aspect - 0.6) / 0.8));
  return { parallax: 0.3 + 2.3 * k, sway: 0.25 + 0.45 * k };
}

/**
 * Menor distância da câmera (ao eixo da árvore) em que nenhum fruto sai pela
 * lateral, em nenhum ponto do balanço. Um ponto em (x', z') no referencial da
 * câmera (z' para a câmera) cabe se |x'| + margem ≤ (d − z')·tan(h)·aspect.
 */
function fitFruits(focus: FramingFocus, halfFov: number, aspect: number) {
  const horizontal = Math.tan(halfFov) * aspect;
  const margin = focus.radius + lateralDrift(aspect).sway;
  let distance = 0;
  const STEPS = 16;
  for (let i = 0; i <= STEPS; i++) {
    const yaw = focus.yaw[0] + ((focus.yaw[1] - focus.yaw[0]) * i) / STEPS;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (const [x, z] of focus.points) {
      const xc = x * c + z * s;
      const zc = -x * s + z * c;
      distance = Math.max(distance, (Math.abs(xc) + margin) / horizontal + zc + focus.radius);
    }
  }
  return distance;
}

export interface HubFraming {
  distance: number;
  /** Altura da câmera em repouso. */
  cameraY: number;
  /** Ponto do eixo para onde a câmera olha. */
  lookY: number;
  beamSpan: [min: number, max: number];
  fogNear: number;
  fogFar: number;
}

export function computeHubFraming(bounds: YggdrasilData['bounds'], aspect: number, focus?: FramingFocus): HubFraming {
  const halfFov = (BASE_FOV * Math.PI) / 360;
  const pitch = (PITCH_DEGREES * Math.PI) / 180;
  const below = Math.tan(pitch - halfFov);
  const above = Math.tan(pitch + halfFov);
  const height = bounds.max[1] - bounds.min[1];
  const halfWidth = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) / 2;

  const yBottom = bounds.min[1] + height * (CAMERA_LIFT - ROOT_MARGIN);
  const yTop = bounds.max[1] + height * (CAMERA_LIFT - CANOPY_OVERFLOW);
  const fitHeight = (yTop - yBottom) / (above - below);
  const fitWidth = Math.max((halfWidth * WIDTH_FILL) / (Math.tan(halfFov) * aspect), focus ? fitFruits(focus, halfFov, aspect) : 0);
  const distance = Math.max(fitHeight, fitWidth);

  // Altura sobrando (a largura mandou): a árvore INTEIRA, centralizada — levemente
  // acima do meio, deixando o terço de baixo para a voz da árvore (o diálogo).
  let cameraY = yBottom - distance * below;
  if (fitWidth > fitHeight) {
    const treeBottom = bounds.min[1] + height * 0.02;
    const treeTop = bounds.max[1] - height * 0.04;
    const visible = distance * (above - below); // altura visível no plano do eixo
    // Centro da árvore a CENTER_AT do quadro (de baixo para cima), nunca deixando
    // menos de BOTTOM_ROOM do quadro abaixo das raízes.
    const frameBottom = Math.min((treeBottom + treeTop) / 2 - visible * CENTER_AT, treeBottom - visible * BOTTOM_ROOM);
    cameraY = frameBottom - distance * below;
  }
  const lookY = cameraY + distance * Math.tan(pitch);
  const depth = Math.max(bounds.max[2] - bounds.min[2], bounds.max[0] - bounds.min[0]) / 2;

  return {
    distance,
    cameraY,
    lookY,
    beamSpan: [cameraY + distance * below, cameraY + distance * above],
    fogNear: distance - depth * 0.3,
    fogFar: distance + depth * 1.2,
  };
}
