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
 * Contrato de continuidade "volta pela luz": um reino que termina num clarão
 * (ex.: o pilar do Monólito) marca `fromLight` antes de trocar de cena, e a
 * hub nasce do mesmo branco, dissolvendo-o. A hub zera a marca ao consumi-la.
 */
export const RETURN_HANDOFF = { fromLight: false };

/**
 * Contrato do "sequestro" (hub → Architecture): a mão de matéria escura cobre
 * a câmera e a tela fica preta por 1s; o reino nasce desse mesmo preto.
 */
export const KIDNAP_HANDOFF = { fromBlack: false };
