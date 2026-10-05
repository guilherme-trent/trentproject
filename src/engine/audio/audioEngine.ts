import { useAppStore } from '../store/useAppStore';

/**
 * Motor de áudio (fundação).
 *
 * Browsers só permitem iniciar um AudioContext dentro de um gesto do usuário.
 * `unlockAudio()` deve ser chamada SÍNCRONA no handler de clique/toque — um
 * `await` antes dela tira a chamada do gesto e o Safari recusa o desbloqueio.
 *
 * O grafo nasce com um GainNode master: toda fonte futura (trilha, SFX da
 * onda de choque, sonificação dos nós) conecta nele, o que dá mute/fade
 * global num único ponto.
 *
 * O AudioContext NÃO vai para o store (não é serializável e não é estado de
 * UI); o store guarda só `audioState`, para a UI reagir.
 */

let context: AudioContext | null = null;
let master: GainNode | null = null;

const syncState = () => {
  if (context) useAppStore.getState().setAudioState(context.state);
};

type AudioContextCtor = typeof AudioContext;

export function unlockAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;

  if (!Ctor) {
    useAppStore.getState().setAudioState('unsupported');
    return null;
  }

  if (!context) {
    context = new Ctor({ latencyHint: 'interactive' });
    master = context.createGain();
    master.gain.value = 0.8;
    master.connect(context.destination);
    context.addEventListener('statechange', syncState);

    // iOS pode suspender o contexto ao trocar de app; tentamos retomar ao voltar.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && context?.state !== 'running') {
        void context?.resume().catch(() => undefined);
      }
    });
  }

  // iOS/Safari antigos só "acordam" de fato ao tocar um buffer dentro do gesto.
  const silence = context.createBuffer(1, 1, context.sampleRate);
  const source = context.createBufferSource();
  source.buffer = silence;
  source.connect(context.destination);
  source.start(0);

  void context.resume().then(syncState, syncState);
  return context;
}

export const getAudioContext = () => context;
export const getMasterGain = () => master;
