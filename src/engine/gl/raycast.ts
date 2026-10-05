import { Sphere, Vector3, type Intersection, type Mesh, type Raycaster } from 'three';

const sphere = new Sphere();
const hit = new Vector3();

/**
 * Raycast analítico contra uma esfera: O(1), sem tocar em triângulos.
 *
 * Substitui `Mesh.raycast` em alvos interativos pequenos (ex.: Nexus Points).
 * O raio vem de `userData.hitRadius`. Junto com o fato de o R3F só testar
 * objetos que TÊM handlers de evento, o custo de hover por movimento do mouse é
 * de 3 testes raio-esfera — as ~160 mil linhas da árvore nunca são consultadas.
 */
export function sphereRaycast(this: Mesh, raycaster: Raycaster, intersects: Intersection[]) {
  this.getWorldPosition(sphere.center);
  sphere.radius = (this.userData.hitRadius as number | undefined) ?? 1;
  if (!raycaster.ray.intersectSphere(sphere, hit)) return;

  const distance = raycaster.ray.origin.distanceTo(hit);
  if (distance < raycaster.near || distance > raycaster.far) return;
  intersects.push({ distance, point: hit.clone(), object: this });
}
