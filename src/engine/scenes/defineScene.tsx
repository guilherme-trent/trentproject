'use client';

import { use, type ComponentType } from 'react';

/**
 * Contrato de um módulo de cena: export default do componente e, opcionalmente,
 * um `prepare()` para trabalho de CPU que deve estar pronto ANTES do primeiro
 * frame (gerar grafos, decodificar dados). A cena só monta após o prepare.
 */
export interface SceneModule {
  default: ComponentType;
  prepare?: () => Promise<void>;
}

export interface SceneDefinition {
  Component: ComponentType;
  /** Baixa o chunk JS e executa `prepare()`. Idempotente. */
  preload: () => Promise<void>;
}

/**
 * Carregador de cena com preload que elimina o frame de suspensão.
 *
 * POR QUE NÃO `React.lazy`?
 *   Mesmo com o chunk já baixado, `lazy` suspende ao menos uma vez na primeira
 *   renderização: o <Suspense> mostra o fallback (tela preta) por um frame. Numa
 *   transição contínua (o feixe da intro virando a constelação da hub) esse
 *   frame é um "pisca" visível.
 *
 *   Aqui o componente resolvido fica em memória: se `preload()` já terminou, a
 *   cena renderiza SÍNCRONA. Se não, suspende via `use()` — o comportamento de
 *   Suspense continua idêntico para quem chega sem preload.
 */
export function defineScene(loader: () => Promise<SceneModule>): SceneDefinition {
  let Resolved: ComponentType | null = null;
  let pending: Promise<void> | null = null;

  const preload = () =>
    (pending ??= loader()
      .then(async (mod) => {
        await mod.prepare?.();
        Resolved = mod.default;
      })
      .catch((error: unknown) => {
        pending = null; // permite nova tentativa (ex.: rede instável)
        throw error;
      }));

  function SceneBoundary() {
    if (!Resolved) use(preload());
    const Scene = Resolved as ComponentType | null;
    return Scene ? <Scene /> : null;
  }

  return { Component: SceneBoundary, preload };
}
