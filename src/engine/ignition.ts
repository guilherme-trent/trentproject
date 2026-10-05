import { useAppStore } from './store/useAppStore';
import { unlockAudio } from './audio/audioEngine';

let igniting = false;

/** Executa `task` depois que o navegador pintar o próximo frame (rAF → macrotask). */
function afterNextPaint(task: () => void) {
  requestAnimationFrame(() => setTimeout(task, 0));
}

/**
 * A Ignição: o único ponto de entrada da experiência.
 *
 * Divide o trabalho em dois tempos:
 *   1. DENTRO do gesto (síncrono): desbloquear o áudio — o Safari recusa
 *      AudioContext.resume() fora de um gesto do usuário.
 *   2. DEPOIS do próximo paint: trocar de cena. Montar a intro custava ~130ms
 *      dentro do handler de clique (medido via Long Animation Frames API), o
 *      que segurava o próximo paint (INP ruim). Agora o handler retorna em
 *      poucos ms, o navegador pinta, e só então a intro é montada.
 *
 * Idempotente: toques repetidos durante a ignição são ignorados.
 */
export function ignite() {
  if (igniting || useAppStore.getState().currentScene !== 'boot') return;
  igniting = true;

  unlockAudio();
  afterNextPaint(() => {
    useAppStore.getState().setScene('intro');
    igniting = false;
  });
}
