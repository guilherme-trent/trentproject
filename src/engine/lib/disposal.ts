import type { BufferGeometry, Material, Object3D, Scene, Texture } from 'three';

/**
 * Primitivas de coleta de recursos de GPU.
 *
 * Usamos duck typing (`isTexture`, `isMaterial`…) em vez de `instanceof` para
 * não quebrar caso duas cópias de `three` acabem no bundle.
 */

export interface Disposable {
  dispose(): void;
}

/**
 * Chave em `userData` que protege um objeto (e toda sua subárvore), material,
 * geometria ou textura do garbage collector. Use para assets compartilhados
 * entre cenas: HDRIs, materiais globais, a "centelha" persistente etc.
 */
export const PERSISTENT_KEY = 'persistent';

export function markPersistent<T extends { userData: Record<string, unknown> }>(target: T): T {
  target.userData[PERSISTENT_KEY] = true;
  return target;
}

const isPersistent = (target: { userData?: Record<string, unknown> }) =>
  target.userData?.[PERSISTENT_KEY] === true;

type MaybeTexture = Partial<Texture> & { isRenderTargetTexture?: boolean };

function addTexture(value: unknown, out: Set<Disposable>) {
  const texture = value as MaybeTexture | null;
  if (!texture?.isTexture || isPersistent(texture)) return;
  // Texturas de render target pertencem ao seu WebGLRenderTarget (ex.: useFBO),
  // que tem ciclo de vida próprio. Descartá-las isoladamente corrompe o FBO.
  if (texture.isRenderTargetTexture) return;
  out.add(texture as Texture);
}

function addTextureLike(value: unknown, out: Set<Disposable>) {
  if (Array.isArray(value)) value.forEach((item) => addTexture(item, out));
  else addTexture(value, out);
}

function addMaterial(material: Material, out: Set<Disposable>) {
  if (!material?.isMaterial || isPersistent(material)) return;
  out.add(material);

  // Varre TODAS as propriedades (map, normalMap, roughnessMap, alphaMap, …)
  // em vez de uma lista fixa: cobre materiais custom e futuras versões do three.
  for (const value of Object.values(material)) addTextureLike(value, out);

  // ShaderMaterial / RawShaderMaterial / onBeforeCompile: texturas vivem em uniforms.
  const uniforms = (material as Material & { uniforms?: Record<string, { value: unknown }> })
    .uniforms;
  if (uniforms) {
    for (const uniform of Object.values(uniforms)) addTextureLike(uniform?.value, out);
  }
}

type RenderableLike = Object3D & {
  geometry?: BufferGeometry;
  material?: Material | Material[];
  skeleton?: Disposable;
  isInstancedMesh?: boolean;
  isBatchedMesh?: boolean;
};

/**
 * Coleta todos os recursos descartáveis alcançáveis a partir de `root`.
 * Caminhada recursiva manual (não `traverse`) para poder PODAR subárvores persistentes.
 */
export function collectResources(
  root: Object3D,
  out: Set<Disposable> = new Set(),
): Set<Disposable> {
  const visit = (object: Object3D) => {
    if (isPersistent(object)) return;

    const node = object as RenderableLike;

    if (node.geometry?.isBufferGeometry && !isPersistent(node.geometry)) out.add(node.geometry);

    if (Array.isArray(node.material)) node.material.forEach((m) => addMaterial(m, out));
    else if (node.material) addMaterial(node.material, out);

    // SkinnedMesh: o Skeleton aloca uma boneTexture na GPU.
    if (node.skeleton) out.add(node.skeleton);

    // InstancedMesh/BatchedMesh: o próprio objeto libera instanceMatrix/instanceColor.
    if (node.isInstancedMesh || node.isBatchedMesh) out.add(node as Object3D & Disposable);

    for (const child of object.children) visit(child);
  };

  visit(root);
  return out;
}

/**
 * Conjunto "vivo": tudo que a cena ainda referencia, incluindo recursos de
 * nível de cena que não estão no grafo de filhos (background, environment).
 */
export function collectLiveResources(scene: Scene): Set<Disposable> {
  const live = collectResources(scene);
  addTextureLike(scene.background, live);
  addTextureLike(scene.environment, live);
  if (scene.overrideMaterial) addMaterial(scene.overrideMaterial, live);
  return live;
}

/**
 * Sweep: descarta todo recurso pendente que NÃO está mais vivo.
 * Recursos pendentes que ainda estão vivos (compartilhados com a nova cena, ou
 * ocultos por um Suspense em transição) permanecem pendentes e serão
 * reavaliados no próximo sweep — nunca são descartados enquanto em uso.
 *
 * @returns quantidade de recursos descartados.
 */
export function sweepResources(pending: Set<Disposable>, live: Set<Disposable>): number {
  let disposed = 0;
  for (const resource of pending) {
    if (live.has(resource)) continue;
    resource.dispose();
    pending.delete(resource); // seguro: deletar durante for…of de Set é especificado.
    disposed++;
  }
  return disposed;
}
