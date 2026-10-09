/**
 * A Metrópole — constantes da jornada (unidades de mundo, progresso 0..1).
 *
 * O túnel: chão e teto espelhados em `floor`/`ceiling`; a câmera viaja de
 * `start` até `start − length` no eixo Z conforme o scroll. O núcleo
 * simétrico espera no fim, `coreGap` à frente da câmera.
 */
export const TUNNEL = { floor: -1.8, ceiling: 2.2, eye: 0.2, start: 4, length: 64, coreGap: 11 } as const;

export const CAMERA = { fov: 55, portraitFov: 76, near: 0.05, far: 100 } as const;

/** FOV vertical pelo aspect: em retrato abre (senão o FOV horizontal estreito mostra só o corredor, não a cidade). */
export const baseFov = (aspect: number) => CAMERA.fov + (CAMERA.portraitFov - CAMERA.fov) * Math.min(1, Math.max(0, (1.25 - aspect) / 0.75));

/**
 * Pilotagem por SEGURAR: W/↑ avança, S/↓ retrocede (no toque: tocar,
 * arrastar para cima e segurar). A velocidade persegue o alvo com
 * amortecimento — arranca e freia como algo pesado, nunca salta.
 *   maxSpeed   progresso/s com o acelerador no fundo (jornada ≥ 1/maxSpeed s)
 *   accel      taxa de aproximação da velocidade-alvo ao acelerar
 *   brake      taxa ao soltar (um pouco mais firme: para sem escorregar)
 *   dragRange  arraste (em alturas de tela) para o acelerador chegar ao fundo
 */
export const DRIVE = { maxSpeed: 0.058, accel: 2.2, brake: 3.2, dragRange: 0.14, dragDead: 0.012 } as const;

/** A metrópole se constrói este tanto de progresso À FRENTE da câmera. */
export const BUILD = { lookahead: 0.16, corridor: 1.35, width: 11 } as const;

/**
 * Cópias espelhadas (reflexão planar exata por geometria): original, reflexo
 * no chão, no teto, e os reflexos de 2ª ordem (chão-do-teto, teto-do-chão).
 * `gain` é a refletância de cada salto.
 */
const F = TUNNEL.floor;
const C = TUNNEL.ceiling;
export const MIRRORS = [
  { sign: 1, offset: 0, gain: 1 },
  { sign: -1, offset: 2 * F, gain: 0.42 },
  { sign: -1, offset: 2 * C, gain: 0.42 },
  { sign: 1, offset: 2 * F - 2 * C, gain: 0.15 },
  { sign: 1, offset: 2 * C - 2 * F, gain: 0.15 },
] as const;

/** O manifesto no espaço: progresso em que cada trecho se acende. */
export const PHRASES = [
  { at: 0.1, text: 'Dominar ferramentas capazes de criar o que ainda nem sequer existe...' },
  { at: 0.4, text: '...e trazer experiências únicas e imersivas é uma habilidade de desbravação.' },
  { at: 0.7, text: 'Uma habilidade que permite explorar, criar, desenvolver e inovar.' },
  { at: 0.9, text: 'Quando você domina essas qualificações, recebe um título natural gravado em seu ser pelo resto da vida.' },
] as const;

/**
 * arrive   o pouso: a luz da fissura se dissipa devagar (landing) enquanto o
 *          hangar acende faixa a faixa, de perto para longe (hangar: atraso até
 *          a primeira; hangarBand: intervalo entre faixas de 3 unidades)
 */
export const TIMING = { arrive: 2.3, landing: [0.15, 2.6] as const, hangar: 0.55, hangarBand: 0.085, pulse: 3.2, glitch: 1.1 } as const;

/**
 * Estilhaço Zero-G (s desde o clique): a trinca corre, os cacos explodem
 * contra a câmera desacelerando até PARAR (bullet-time), ficam suspensos e
 * se desintegram em poeira — que vira as partículas da Etapa 2.
 */
export const SHATTER = { crack: 0.18, explode: 0.95, dissolveStart: 1.6, dissolve: 0.8, end: 2.75 } as const;

/**
 * A Forja (Etapa 2). `worldScale`: altura do plano z = 0 em unidades de
 * mundo — a câmera da forja reproduz EXATAMENTE a perspectiva dos cacos
 * (câmera a 2,2 alturas de tela), então cada partícula nasce sobre o seu pixel.
 */
export const FORGE = {
  worldScale: 6,
  wake: 1.4,
  freeze: 0.55,
  gather: [0.55, 3.0] as const,
  reveal: [2.4, 3.6] as const,
  fade: [3.0, 3.9] as const,
  relicAt: 3.9,
  relicHold: 5.4,
  exit: 0.9,
} as const;

/**
 * Ressonância: sobe com movimento SUAVE do ponteiro (velocidade estável,
 * nem parado nem frenético) e cai quando ele para — o caos volta.
 * Velocidades em alturas de tela por segundo.
 */
export const RESONANCE = { gain: 1 / 7, decay: 0.12, grace: 0.6, minSpeed: 0.08, maxSpeed: 4.5 } as const;

export const ADMIN = '[ Acesso Administrativo: Guilherme Trent ]';
export const CHAOS_MESSAGE = '[ CAOS DETECTADO. ORQUESTRE O FLUXO. ]';
export const BACK_LABEL = '[ Voltar para a Hub ]';

export const INTERCEPT = [
  { delay: 0.7, text: 'Escute, ocorreu um erro de contenção. Preciso que você vol-' },
  { delay: 2.3, text: '-te para a Hub imediatamente. Não interaja com a estrutu-' },
  { delay: 2.1, text: 'Apenas clique em Vol-' },
] as const;
