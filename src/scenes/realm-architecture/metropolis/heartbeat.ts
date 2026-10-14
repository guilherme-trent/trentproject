import { getAudioContext, getMasterGain } from '@/engine/audio/audioEngine';

/**
 * O batimento do coração: o relógio do "tum-tum" e o som.
 *
 * Ritmo: um ciclo por batida, com DUAS pancadas — a 1ª (o "tum", sístole
 * atrial e ventricular) e a 2ª, mais fraca, ~0,27 ciclo depois (o fechar
 * das válvulas). O ritmo acelera de 48 para 68 batidas por minuto conforme
 * você se aproxima, como quem chega perto de alguém.
 *
 * Som: sintetizado na hora com o Web Audio (nenhum arquivo). Cada pancada
 * são dois osciladores com queda de frequência: um grave (~58 → 36 Hz), que
 * se sente, e um mais alto (~115 → 70 Hz), que alto-falantes de notebook e
 * celular conseguem reproduzir. O volume cresce com a proximidade.
 */

const LUB = 0.03;
const DUB = 0.3;
const BPM = [48, 68] as const;

const pulse = (phase: number, at: number, width: number) => {
  let d = phase - at;
  d -= Math.round(d); // distância circular no ciclo
  return Math.exp(-((d / width) ** 2));
};

export class Heartbeat {
  /** Fase no ciclo (0..1). */
  phase = 0.5;
  /** Envelope da batida agora (0..~1,6): o shader contrai e acende com ele. */
  beat = 0;
  /** Quanto a onda da última batida já se propagou para fora (0 → 1,3). */
  wave = 1.3;
  private output: GainNode | null = null;
  private muted = false;

  /** `audible`: o reino toca o som; a prévia pela fissura, não. */
  constructor(private readonly audible: boolean) {}

  /**
   * @param heat   0..1 — proximidade do coração (ritmo, volume)
   * @param voice  o som pode tocar agora (falso na falha de sinal: silêncio de uma vez)
   */
  update(dt: number, heat: number, voice: boolean) {
    if (heat <= 0) {
      this.beat = 0;
      return;
    }
    const before = this.phase;
    this.phase = (this.phase + (dt * (BPM[0] + (BPM[1] - BPM[0]) * heat)) / 60) % 1;
    const crossed = (at: number) => (before < at && this.phase >= at) || (before > this.phase && (this.phase >= at || before < at));
    this.beat = pulse(this.phase, LUB, 0.04) + 0.65 * pulse(this.phase, DUB, 0.045);
    this.wave = ((this.phase - LUB + 1) % 1) * 1.3;

    if (voice) {
      if (crossed(LUB)) this.thump(1, heat);
      if (crossed(DUB)) this.thump(0.62, heat);
    } else this.silence();
  }

  private thump(strength: number, heat: number) {
    if (!this.audible) return;
    const context = getAudioContext();
    const master = getMasterGain();
    if (!context || !master || context.state !== 'running') return;
    if (!this.output) {
      this.output = context.createGain();
      this.output.connect(master);
    }
    if (this.muted) {
      // Com automação agendada, atribuir `.value` pode ser ignorado: reagenda.
      this.output.gain.cancelScheduledValues(context.currentTime);
      this.output.gain.setValueAtTime(1, context.currentTime);
      this.muted = false;
    }
    const volume = 0.5 * strength * heat ** 1.6;
    if (volume < 0.002) return;
    const when = context.currentTime + 0.005;
    for (const [from, to, type, share] of [[58, 36, 'sine', 1], [115, 70, 'triangle', 0.32]] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(from, when);
      oscillator.frequency.exponentialRampToValueAtTime(to, when + 0.14);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, when);
      envelope.gain.exponentialRampToValueAtTime(volume * share, when + 0.01);
      envelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.26);
      oscillator.connect(envelope).connect(this.output);
      oscillator.start(when);
      oscillator.stop(when + 0.3);
      oscillator.onended = () => envelope.disconnect();
    }
  }

  /** Corta o som que ainda soa (a falha de sinal é abrupta). */
  silence() {
    const context = getAudioContext();
    if (this.muted || !this.output || !context) return;
    this.output.gain.setTargetAtTime(0, context.currentTime, 0.015);
    this.muted = true;
  }

  dispose() {
    this.silence();
    this.output?.disconnect();
    this.output = null;
  }
}
