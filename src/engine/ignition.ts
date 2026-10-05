import { useAppStore } from './store/useAppStore';
import { unlockAudio } from './audio/audioEngine';

/**
 * A Ignição: o único ponto de entrada da experiência.
 *
 * Precisa rodar SÍNCRONA dentro do gesto do usuário (por causa do áudio).
 * É idempotente: toques duplos ou repetidos são ignorados fora da cena 'boot'.
 *
 * O fade-out do botão não é comandado aqui: a UI é derivada do store, então
 * ao sair de 'boot' o AnimatePresence do UIOverlay anima a saída sozinho.
 */
export function ignite() {
  const { currentScene, setScene } = useAppStore.getState();
  if (currentScene !== 'boot') return;

  unlockAudio();
  setScene('intro');
}
