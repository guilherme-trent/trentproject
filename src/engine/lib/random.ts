/**
 * PRNG determinístico (mulberry32): rápido, 32 bits, sem alocação.
 * Conteúdo procedural deve ser reproduzível — a mesma semente gera a mesma
 * árvore, a mesma chuva, os mesmos caídos — e funções impuras (Math.random)
 * não podem rodar durante o render do React.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
