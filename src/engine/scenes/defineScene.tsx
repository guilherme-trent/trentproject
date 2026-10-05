'use client';

import { use, type ComponentType } from 'react';
import type { Camera, WebGLRenderer } from 'three';

export interface WarmupContext {
  gl: WebGLRenderer;
  camera: Camera;
  aspect: number;
}

/**
 * Contrato de um módulo de cena:
 *   default   o componente
 *   prepare   trabalho de CPU necessário ANTES do primeiro frame (gerar dados).
 *             A cena só monta depois dele.
 *   warmup    trabalho de GPU executado enquanto a cena ANTERIOR ainda roda:
 *             compilar shaders e subir buffers, para a troca não engasgar.
 */
export interface SceneModule {
  default: ComponentType;
  prepare?: () => Promise<void>;
  warmup?: (context: WarmupContext) => Promise<void>;
}

export interface SceneDefinition {
  Component: ComponentType;
  /** Baixa o chunk JS e executa `prepare()`. Idempotente. */
  preload: () => Promise<void>;
  /** `preload()` + `warmup()` do módulo. A idempotência do warmup é da cena. */
  warmup: (context: WarmupContext) => Promise<void>;
}

/**
 * Carregador de cena com preload que elimina o frame de suspensão.
 *
 * POR QUE NÃO `React.lazy`?
 *   Mesmo com o chunk já baixado, `lazy` suspende ao menos uma vez na primeira
 *   renderização: o <Suspense> mostra o fallback (tela preta) por um frame. Numa
 *   transição contínua esse frame é um "pisca" visível.
 *
 *   Aqui o componente resolvido fica em memória: se `preload()` já terminou, a
 *   cena renderiza SÍNCRONA. Se não, suspende via `use()` — o comportamento de
 *   Suspense continua idêntico para quem chega sem preload.
 */
export function defineScene(loader: () => Promise<SceneModule>): SceneDefinition {
  let resolved: SceneModule | null = null;
  let pending: Promise<void> | null = null;

  const preload = () =>
    (pending ??= loader()
      .then(async (mod) => {
        await mod.prepare?.();
        resolved = mod;
      })
      .catch((error: unknown) => {
        pending = null; // permite nova tentativa (ex.: rede instável)
        throw error;
      }));

  const warmup = async (context: WarmupContext) => {
    await preload();
    await resolved?.warmup?.(context);
  };

  function SceneBoundary() {
    if (!resolved) use(preload());
    const Scene = (resolved as SceneModule | null)?.default;
    return Scene ? <Scene /> : null;
  }

  return { Component: SceneBoundary, preload, warmup };
}
