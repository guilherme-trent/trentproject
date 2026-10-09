/**
 * Contrato de continuidade visual intro → hub.
 *
 * A intro termina exatamente neste estado do feixe, e a hub começa
 * renderizando o MESMO feixe (mesmo chunk GLSL, mesmos parâmetros) a partir
 * daqui. Mudar um lado sem o outro quebra a costura — por isso o contrato
 * vive num único arquivo importado pelas duas cenas.
 */
export const BEAM_HANDOFF = {
  /** Relógio do feixe (s) no instante da troca — a hub continua deste valor. */
  time: 3.1,
  /** Ponta do feixe já abaixo da borda inferior: feixe de ponta a ponta. */
  headY: -0.6,
  intensity: 1,
} as const;


/**
 * Contrato da volta "pelo pulso": um reino que termina com o pulso de luz
 * cobrindo a tela (ver PulseWipeMaterial) marca `fromPulse` antes de trocar
 * de cena, e a hub nasce do mesmo escuro, revelada pelo pulso no sentido
 * inverso. A hub zera a marca ao consumi-la.
 */
export const RETURN_HANDOFF = { fromPulse: false };

/**
 * Contrato da ruptura (hub → Architecture): pela fissura do fruto 1 já se vê
 * a Fase 1 ao vivo (RiftPreview). Quando o rasgo cobre a tela, o reino
 * CONTINUA dali: mesmo progresso da construção, mesmo relógio (o hangar que
 * já acendeu continua aceso). O reino zera a marca ao consumi-la.
 */
export const RIFT_HANDOFF = { fromRift: false, progress: 0, time: 0 };
