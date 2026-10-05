import { generateConstellation } from './constellation';

/**
 * Gera a constelação fora do main thread. Os typed arrays são TRANSFERIDOS
 * (não copiados): a posse da memória passa ao main thread em O(1).
 */
self.onmessage = (event: MessageEvent<{ nodeCount: number }>) => {
  const data = generateConstellation(event.data.nodeCount);
  const { lines } = data;
  self.postMessage(data, {
    transfer: [
      data.matrices.buffer,
      data.seeds.buffer,
      data.originY.buffer,
      data.segmentOffsets.buffer,
      lines.positions.buffer,
      lines.originY.buffer,
      lines.nodeSeed.buffer,
      lines.segmentSeed.buffer,
      lines.side.buffer,
    ],
  });
};
