import { runWhenIdle } from '@/engine/lib/idle';
import { generateYggdrasil, YGGDRASIL, type YggdrasilData } from './generator';

/**
 * Cache da Yggdrasil + orquestração da geração.
 *
 * Disparada pelo `prepare()` da hub — na prática durante a intro — num Web
 * Worker. Sem suporte a Worker (ou se ele falhar), cai para o main thread em idle.
 *
 * Os dados ficam em memória JS para revisitas (voltar de um reino): a hub
 * reconstrói os buffers de GPU sem gerar de novo. A VRAM, essa sim, é
 * devolvida pelo useCleanup a cada saída da cena.
 */

let prepared: YggdrasilData | null = null;
let pending: Promise<YggdrasilData> | null = null;
let generatedBy: 'worker' | 'main-thread' = 'worker';

function generateOnMainThread(): Promise<YggdrasilData> {
  generatedBy = 'main-thread';
  return new Promise((resolve) => runWhenIdle(() => resolve(generateYggdrasil()), 1000));
}

function generateInWorker(): Promise<YggdrasilData> {
  if (typeof Worker === 'undefined') return generateOnMainThread();

  return new Promise((resolve) => {
    const worker = new Worker(new URL('./yggdrasil.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<YggdrasilData>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = () => {
      worker.terminate();
      resolve(generateOnMainThread());
    };
    worker.postMessage({ threadCount: YGGDRASIL.threads });
  });
}

export function prepareYggdrasil(): Promise<YggdrasilData> {
  const startedAt = performance.now();
  return (pending ??= generateInWorker().then((data) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(
        `[yggdrasil] ${data.threadCount} fios / ${data.index.length / 2} segmentos ` +
          `prontos em ${(performance.now() - startedAt).toFixed(0)}ms (via ${generatedBy})`,
      );
    }
    return (prepared = data);
  }));
}

/** Leitura síncrona — válida somente depois que `prepareYggdrasil()` resolveu. */
export function getYggdrasil(): YggdrasilData {
  if (!prepared) throw new Error('Yggdrasil não preparada: a cena hub deve montar via prepare().');
  return prepared;
}
