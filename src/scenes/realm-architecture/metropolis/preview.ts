import { HalfFloatType, LineSegments, Mesh, PerspectiveCamera, Points, Scene, Vector2, WebGLRenderTarget, type WebGLRenderer } from 'three';
import { CAMERA, TIMING } from './config';
import { MetropolisDirector } from './director';
import { MetropolisFrame } from './frame';
import { acquireMetropolisKit } from './kit';

/**
 * A Fase 1 vista PELA FISSURA, ao vivo, ainda na hub: o túnel de espelhos
 * (os mesmos objetos do kit, já aquecidos) renderizado num render target com
 * a MESMA câmera e o MESMO maestro de uniforms do reino. O rasgo amostra
 * esse alvo em coordenadas de tela — um portal. Quando o rasgo cobre a tela,
 * o reino assume a partir do mesmo progresso e do mesmo relógio (ver
 * RIFT_HANDOFF): o quadro seguinte é a continuação, não um corte.
 */
export class RiftPreview {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
  private readonly director = new MetropolisDirector();
  private readonly frame: MetropolisFrame;
  private readonly size = new Vector2();
  readonly target: WebGLRenderTarget;
  /** Progresso e relógio do último quadro — o reino continua deles (RIFT_HANDOFF). */
  progress = 0;
  time = 0;

  constructor(gl: WebGLRenderer) {
    const kit = acquireMetropolisKit();
    this.frame = new MetropolisFrame(kit, this.director);
    const objects = [
      Object.assign(new Mesh(kit.surfaces.geometry, kit.surfaces.material), { renderOrder: -10 }),
      Object.assign(new LineSegments(kit.lines.geometry, kit.lines.material), { renderOrder: 1 }),
      Object.assign(new Points(kit.points.geometry, kit.points.material), { renderOrder: 2 }),
    ];
    for (const object of objects) object.frustumCulled = false;
    this.scene.add(...objects);
    gl.getDrawingBufferSize(this.size);
    this.target = new WebGLRenderTarget(this.size.x, this.size.y, { type: HalfFloatType, depthBuffer: false });
  }

  /**
   * Desenha o túnel no `progress` da construção, com o hangar acendendo há
   * `hangarSeconds` (o relógio do reino é derivado disso).
   */
  render(gl: WebGLRenderer, progress: number, hangarSeconds: number, aspect: number) {
    const time = TIMING.hangar + hangarSeconds;
    this.progress = progress;
    this.time = time;
    gl.getDrawingBufferSize(this.size);
    if (this.target.width !== this.size.x || this.target.height !== this.size.y) this.target.setSize(this.size.x, this.size.y);
    this.director.progress = progress;
    this.director.time = time;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.frame.sync(this.camera, null, aspect, this.size.y);
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(this.target);
    gl.clear();
    gl.render(this.scene, this.camera);
    gl.setRenderTarget(previous);
  }

  dispose() {
    this.target.dispose();
  }
}
