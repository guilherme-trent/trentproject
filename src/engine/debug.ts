import { useAppStore } from './store/useAppStore';

/**
 * Ganchos de diagnóstico: `window.__ENGINE__` permite que testes automatizados
 * (CDP/Playwright) e o console inspecionem o motor sem acoplar a UI a
 * ferramentas de debug. Ativo em desenvolvimento, ou em produção com
 * `?engine-debug` na URL (para medir o build real).
 */
declare global {
  interface Window {
    __ENGINE__?: { store: typeof useAppStore; [key: string]: unknown };
  }
}

const enabled = () =>
  typeof window !== 'undefined' &&
  (process.env.NODE_ENV !== 'production' || new URLSearchParams(window.location.search).has('engine-debug'));

export function installEngineDebug() {
  if (!enabled()) return;
  window.__ENGINE__ = { ...window.__ENGINE__, store: useAppStore };
}

export function registerDebug(key: string, value: unknown) {
  if (!enabled()) return;
  window.__ENGINE__ = { ...(window.__ENGINE__ ?? { store: useAppStore }), [key]: value };
}

/** console.debug condicionado ao mesmo gate dos ganchos (dev ou `?engine-debug`). */
export function debugLog(...args: unknown[]) {
  if (enabled()) console.debug(...args);
}
