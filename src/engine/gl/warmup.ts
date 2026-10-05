import { HalfFloatType, Scene, Vector4, WebGLRenderTarget, type Camera, type Object3D, type WebGLRenderer } from 'three';
import { TIER_PROFILES } from '../config/performance';
import { useAppStore } from '../store/useAppStore';
import { debugLog } from '../debug';

/**
 * Aquecimento de GPU: compila programas e sobe buffers ANTES de uma cena aparecer.
 *
 * ARMADILHA DE VARIANTES:
 *   O three compila uma variante de programa por combinação de parâmetros, e
 *   dois deles dependem de ONDE se renderiza:
 *     - tela:          toneMapping do renderer + saída sRGB
 *     - render target: sem toneMapping + saída linear
 *   Com bloom ativo, o EffectComposer renderiza a cena num render target. Um
 *   `compileAsync` com a tela vinculada compilaria a variante errada e o
 *   engasgo voltaria no primeiro frame. Por isso vinculamos um alvo 1×1
 *   enquanto compilamos, espelhando exatamente a pipeline em uso.
 */

let scratchTarget: WebGLRenderTarget | null = null;

/** A cena está sendo renderizada num render target (pós-processamento ativo)? */
export function isOffscreenPipeline(): boolean {
  return TIER_PROFILES[useAppStore.getState().performanceTier].bloom !== null;
}

function getScratchTarget() {
  return (scratchTarget ??= new WebGLRenderTarget(1, 1, { type: HalfFloatType }));
}

/**
 * Compila os programas de `root` para a pipeline atual. A parte síncrona do
 * `compileAsync` (criação dos programas) acontece na chamada — o alvo é
 * restaurado em seguida, antes de qualquer frame do R3F.
 */
export async function compileForPipeline(gl: WebGLRenderer, root: Object3D, camera: Camera, offscreen = isOffscreenPipeline()) {
  const previous = gl.getRenderTarget();
  if (offscreen) gl.setRenderTarget(getScratchTarget());
  const syncStart = performance.now();
  const ready = gl.compileAsync(root, camera);
  const syncMs = performance.now() - syncStart;
  gl.setRenderTarget(previous);
  await ready.catch(() => undefined); // falha de pré-compilação nunca deve travar o fluxo
  return syncMs;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Aquecimento FATIADO: um objeto (um programa) por frame.
 *
 * Sem a extensão KHR_parallel_shader_compile (comum em GPUs integradas e
 * Linux), compilar é síncrono: aquecer a hub inteira de uma vez travou um
 * frame de 250ms no meio da intro (medido). Fatiado, cada frame paga no
 * máximo o shader mais caro, e o main thread respira entre eles.
 */
export async function warmGpuSliced(gl: WebGLRenderer, objects: readonly Object3D[], camera: Camera) {
  const stage = new Scene();
  for (const object of objects) {
    stage.add(object);
    const startedAt = performance.now();
    // `userData.offscreen`: objetos que SEMPRE renderizam num render target
    // próprio (ex.: passes em baixa resolução), qualquer que seja a pipeline.
    const offscreen = object.userData.offscreen === true || isOffscreenPipeline();
    const { compileSyncMs, uploadMs } = await warmGpu(gl, stage, camera, offscreen);
    debugLog(
      `[warmup] ${object.name || object.type}: total ${(performance.now() - startedAt).toFixed(0)}ms ` +
        `(bloqueante: compile ${compileSyncMs.toFixed(0)}ms + upload ${uploadMs.toFixed(0)}ms)`,
    );
    stage.remove(object);
    await nextFrame();
  }
}

/**
 * Compila E sobe os buffers de geometria (um draw de 1×1 pixel): no primeiro
 * frame real da cena, a GPU já tem programas e atributos residentes.
 */
export async function warmGpu(gl: WebGLRenderer, root: Object3D, camera: Camera, offscreen = isOffscreenPipeline()) {
  const compileSyncMs = await compileForPipeline(gl, root, camera, offscreen);
  const uploadStart = performance.now();

  const previous = gl.getRenderTarget();
  const autoClear = gl.autoClear;
  gl.autoClear = false; // não apagar o frame visível

  if (offscreen) {
    gl.setRenderTarget(getScratchTarget());
    gl.render(root, camera);
  } else {
    // Mesma variante da tela, desenhando num único pixel que o próximo frame sobrescreve.
    const viewport = gl.getViewport(new Vector4());
    const scissor = gl.getScissor(new Vector4());
    const scissorTest = gl.getScissorTest();
    gl.setRenderTarget(null);
    gl.setScissorTest(true);
    gl.setScissor(0, 0, 1, 1);
    gl.setViewport(0, 0, 1, 1);
    gl.render(root, camera);
    gl.setViewport(viewport);
    gl.setScissor(scissor);
    gl.setScissorTest(scissorTest);
  }

  gl.setRenderTarget(previous);
  gl.autoClear = autoClear;
  return { compileSyncMs, uploadMs: performance.now() - uploadStart };
}
