import { generateYggdrasil } from './generator';

/**
 * Gera a Yggdrasil fora do main thread (~130ms de CPU que nunca tocam um frame).
 * Os typed arrays são TRANSFERIDOS, não copiados: a posse dos ~5MB passa ao
 * main thread em O(1).
 */
self.onmessage = (event: MessageEvent<{ threadCount: number }>) => {
  const data = generateYggdrasil(event.data.threadCount);
  self.postMessage(data, {
    transfer: [data.positions.buffer, data.thread.buffer, data.index.buffer, data.mainBranches.buffer, data.mainBranchRegions.buffer],
  });
};
