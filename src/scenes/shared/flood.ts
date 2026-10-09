import type { RGB } from './palette';

/**
 * A LUZ DA FISSURA — a cor (RGB linear, HDR) que inunda a tela no fim da
 * ruptura do fruto 1. A hub termina nela; o reino nasce dela e a dissolve.
 * Um número só nos dois lados: a costura entre as cenas não tem degrau.
 */
// Esmeralda luminoso, não branco: abaixo do limiar do bloom no grosso da tela (só a névoa e a chuva de dados brilham).
export const FLOOD_LIGHT: RGB = [0.05, 0.42, 0.3];
