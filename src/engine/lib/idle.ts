/**
 * Agenda trabalho para quando o main thread estiver ocioso.
 * `timeout` garante a execução mesmo sob carga contínua; Safari não tem
 * requestIdleCallback, então caímos para um setTimeout curto.
 *
 * @returns função de cancelamento
 */
export function runWhenIdle(task: () => void, timeout = 500): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(task, { timeout });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(task, 16);
  return () => window.clearTimeout(handle);
}
