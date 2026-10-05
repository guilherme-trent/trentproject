import { runWhenIdle } from '@/engine/lib/idle';
import { generateConstellation, MAX_NODES, type ConstellationData } from './constellation';

/**
 * Cache da constelação + orquestração da geração.
 *
 * A geração (~30–50ms de CPU) roda num Web Worker disparado pelo `prepare()`
 * da cena — ou seja, durante a intro, sem tirar um único frame do Big Bang.
 * Sem suporte a Worker (ou se ele falhar), cai para o main thread em idle.
 *
 * O resultado fica em memória JS (~1.5MB) para revisitas: a hub reconstrói os
 * buffers de GPU a partir dele sem gerar de novo. A VRAM, essa sim, é liberada
 * pelo useCleanup a cada saída da cena.
 */

let prepared: ConstellationData | null = null;
let pending: Promise<ConstellationData> | null = null;
let generatedBy: 'worker' | 'main-thread' = 'worker';

function generateOnMainThread(): Promise<ConstellationData> {
  generatedBy = 'main-thread';
  return new Promise((resolve) => runWhenIdle(() => resolve(generateConstellation(MAX_NODES)), 1000));
}

function generateInWorker(): Promise<ConstellationData> {
  if (typeof Worker === 'undefined') return generateOnMainThread();

  return new Promise((resolve) => {
    const worker = new Worker(new URL('./constellation.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<ConstellationData>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = () => {
      worker.terminate();
      resolve(generateOnMainThread());
    };
    worker.postMessage({ nodeCount: MAX_NODES });
  });
}

export function prepareConstellation(): Promise<ConstellationData> {
  const startedAt = performance.now();
  return (pending ??= generateInWorker().then((data) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(
        `[constellation] ${data.nodeCount} nós / ${data.segmentOffsets[data.nodeCount]} sinapses ` +
          `prontos em ${(performance.now() - startedAt).toFixed(0)}ms (via ${generatedBy})`,
      );
    }
    return (prepared = data);
  }));
}

/** Leitura síncrona — válida somente depois que `prepareConstellation()` resolveu. */
export function getConstellation(): ConstellationData {
  if (!prepared) throw new Error('Constelação não preparada: a cena hub deve montar via prepare().');
  return prepared;
}
