/**
 * Enquadramento responsivo da constelação.
 *
 * A distância da câmera é a MAIOR entre o encaixe vertical e o horizontal:
 * em telas retrato (celular), o encaixe horizontal domina e a câmera recua.
 *
 * `beamHalfHeight` é a meia-altura visível no plano z = 0 a essa distância.
 * Os nós partem de `originY × beamHalfHeight`, ou seja, exatamente de cima do
 * feixe de tela cheia — qualquer que seja o aspect ratio.
 */

/** < 1 corta levemente as bordas: a estrutura parece maior que a tela ("colossal"). */
const FILL = 0.8;

export interface HubFraming {
  distance: number;
  beamHalfHeight: number;
  fogNear: number;
  fogFar: number;
}

export function computeHubFraming(aspect: number, fovDegrees: number, radius: number): HubFraming {
  const tanHalf = Math.tan((fovDegrees * Math.PI) / 360);
  const fitted = radius * FILL;
  const distance = Math.max(fitted / tanHalf, fitted / (tanHalf * aspect));
  return {
    distance,
    beamHalfHeight: distance * tanHalf,
    fogNear: distance - radius * 0.3,
    fogFar: distance + radius,
  };
}
