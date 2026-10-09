import { MathUtils, Vector2, Vector3, type Group, type PerspectiveCamera } from 'three';
import { progress, smoothstep } from '@/engine/lib/time';
import { baseFov, BUILD, FORGE, PHRASES, TIMING, TUNNEL } from './config';
import { cameraZ, CORE_CENTER } from './city';
import type { MetropolisDirector } from './director';
import type { MetropolisKit } from './kit';
import type { ForgeFrame, ParticleForge } from './forge';
import { terminalLayout } from './terminal';

/** Distância (em progresso) entre o acender de um trecho e a câmera alcançá-lo. */
const PHRASE_LEAD = 0.09;

/**
 * O maestro de uniforms: a cada frame traduz o diretor em câmera e nos
 * poucos uniforms do kit. Classe (e não closure de componente): as escritas
 * por frame ficam fora do modelo de imutabilidade do React Compiler.
 */
/** FOV da câmera da forja: vê o plano z = 0 com altura `worldScale` a 2,2 alturas de distância (a perspectiva dos cacos). */
const FORGE_FOV = (2 * Math.atan(1 / 4.4) * 180) / Math.PI;

export class MetropolisFrame {
  private readonly step: ForgeFrame = {
    dt: 0,
    time: 0,
    chaos: 1,
    order: 0,
    active: 0,
    radius: 0.6,
    forge: 0,
    sapAngle: 0,
    sapCenter: new Vector3(),
    sapScale: 1,
    attractor: new Vector3(),
    attractorVel: new Vector3(),
    bounds: new Vector3(),
  };
  private readonly lastAttractor = new Vector3();
  private readonly origin = new Vector2();
  private seeded = false;

  constructor(
    private readonly kit: MetropolisKit,
    private readonly director: MetropolisDirector,
  ) {}

  sync(camera: PerspectiveCamera, root: Group | null, aspect: number, pixelHeight: number) {
    const { kit, director: d } = this;
    const p = d.progress;
    const time = d.time;
    if (root) root.visible = !d.captured;
    if (d.captured) return; // a Etapa 2 é de syncForge

    // ── Câmera: avança no túnel, com balanço suave, paralaxe e FOV de velocidade ──
    const z = cameraZ(p);
    const shake = d.shake * 0.05;
    const x = Math.sin(p * 9.4) * 0.22 + d.pointer.x * 0.12 + (Math.random() - 0.5) * shake;
    const y = TUNNEL.eye + Math.sin(p * 6.1) * 0.08 + d.pointer.y * 0.06 + (Math.random() - 0.5) * shake;
    camera.position.set(x, y, z);
    camera.lookAt(x * 0.4, TUNNEL.eye - 0.02, z - 8);
    const fov = baseFov(aspect) + MathUtils.clamp(Math.abs(d.velocity) * 45, 0, 9);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    const glitch = d.glitch;
    // O pulso do clímax: casca de luz saindo do núcleo a 26 un/s, esmaecendo.
    const since = d.pulseAt >= 0 ? d.time - d.pulseAt : -1;
    const pulse = since >= 0 ? since * 26 : 0;
    const pulseAmp = since >= 0 ? smoothstep(0, 0.15, since) * (1 - smoothstep(0.6, TIMING.pulse, since)) : 0;
    for (const material of [kit.surfaces.material, kit.lines.material, kit.points.material]) {
      material.uniforms.uCore.value.set(...CORE_CENTER);
      material.uniforms.uPulse.value = pulse;
      material.uniforms.uPulseAmp.value = pulseAmp;
    }

    // ── Espelhos ──
    const surfaces = kit.surfaces.material.uniforms;
    surfaces.uCamZ.value = z;
    surfaces.uBuildZ.value = cameraZ(Math.min(1, p + BUILD.lookahead));
    surfaces.uTime.value = time;
    surfaces.uGlitch.value = glitch;

    // ── Cidade ──
    const lines = kit.lines.material.uniforms;
    lines.uProgress.value = p;
    lines.uTime.value = time;
    lines.uGlitch.value = glitch;
    lines.uCoreAngle.value = time * 0.12 + p * 3.0;

    const points = kit.points.material.uniforms;
    points.uProgress.value = p;
    points.uTime.value = time;
    points.uGlitch.value = glitch;
    points.uPixelScale.value = pixelHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));

    // ── Manifesto ──
    kit.phrases.atlas.layout(aspect < 0.9);
    const phrases = kit.phrases.material.uniforms;
    phrases.uTime.value = time;
    phrases.uGlitch.value = glitch;
    const lead = PHRASE_LEAD * TUNNEL.length;
    const visibleWidth = 2 * lead * Math.tan((baseFov(aspect) * Math.PI) / 360) * aspect;
    PHRASES.forEach((phrase, i) => {
      const block = kit.phrases.atlas.blocks[i];
      const textZ = cameraZ(phrase.at + PHRASE_LEAD);
      const width = Math.min(4.4, visibleWidth * (aspect < 0.9 ? 0.66 : 0.86));
      phrases.uCenter.value[i].set(0, TUNNEL.eye + 0.12, textZ);
      phrases.uSize.value[i].set(width, width * block.aspect);
      phrases.uRect.value[i].set(...block.rect);
      phrases.uReveal.value[i] = progress(p, phrase.at - 0.035, phrase.at + 0.012);
      phrases.uFade.value[i] = smoothstep(0.35, 2.4, z - textZ);
    });

    // ── O pouso (só sem a fissura): a luz se dissipa sobre o túnel enquanto o hangar acende, de perto para longe.
    // Vindo pela fissura, o túnel já estava sendo visto ao vivo pela fenda: o reino só continua. ──
    const arriving = d.stage === 'arrive';
    // A luz se sustenta e então solta devagar (easeInOut), não some de uma vez.
    const landing = progress(d.clock, ...TIMING.landing);
    kit.veil.material.setState(arriving && !d.fromRift ? landing * landing * (3 - 2 * landing) : 1, time, aspect);
    // O hangar segue o relógio da cena (não a etapa): termina de acender mesmo que a jornada já tenha começado.
    surfaces.uHangar.value = (d.time - TIMING.hangar) / (TIMING.hangarBand / 0.06);
  }

  /**
   * Etapa 2. Antes do clique, calcula onde cada partícula nasce (a origem
   * da falha já é conhecida: o centro do botão). No frame da falha, sobe o
   * nascimento para a GPU. Depois: câmera da forja, atrator, ritmo das
   * fases (congelado → despertar → caos → forja → relíquia → saída).
   */
  syncForge(camera: PerspectiveCamera, forge: ParticleForge, capture: Parameters<ParticleForge['render']>[0], field: Parameters<ParticleForge['prepare']>[0], viewW: number, viewH: number, delta: number) {
    const d = this.director;
    const aspect = viewW / viewH;
    if (d.stage === 'intercept') {
      // A falha nascerá do centro do botão (o layout já é conhecido): 4096 partículas por frame.
      const layout = terminalLayout(viewW, viewH);
      const b = layout.button;
      forge.prepare(field, this.origin.set((layout.x + b.x + b.w / 2) / viewW, 1 - (layout.y + b.y + b.h / 2) / viewH), aspect, 4096);
    }
    if (d.captured && !this.seeded) {
      forge.seed(field, d.shatterOrigin, aspect);
      this.seeded = true;
    }
    forge.trails.visible = d.forging;
    if (!d.forging) return;

    // A câmera da forja reproduz a perspectiva dos cacos: a troca é invisível.
    const S = FORGE.worldScale;
    camera.position.set(0, 0, 2.2 * S);
    camera.lookAt(0, 0, 0);
    if (Math.abs(camera.fov - FORGE_FOV) > 0.01) {
      camera.fov = FORGE_FOV;
      camera.updateProjectionMatrix();
    }

    const { stage, clock } = d;
    let dt = delta;
    let gather = 0;
    let reveal = 0;
    let fade = 1;
    let awake = 1;
    if (stage === 'shatter') {
      dt = 0; // congelado no ar: a poeira nasce parada
      awake = 0;
    } else if (stage === 'chaos') {
      dt = delta * smoothstep(0, FORGE.wake, clock); // o tempo volta a correr devagar
      awake = smoothstep(0.2, 2.2, clock);
    } else if (stage === 'forge') {
      dt = clock < FORGE.freeze ? 0 : delta; // 100%: a tela congela
      gather = progress(clock, ...FORGE.gather);
      reveal = progress(clock, ...FORGE.reveal);
      fade = 1 - progress(clock, ...FORGE.fade);
    } else {
      gather = 1;
      reveal = 1;
      fade = 0;
    }

    const step = this.step;
    const attractor = step.attractor.set((d.pointerUv.x - 0.5) * aspect * S, (d.pointerUv.y - 0.5) * S, 0);
    if (delta > 0) step.attractorVel.lerp(this.lastAttractor.sub(attractor).multiplyScalar(-0.8 / delta), 1 - Math.exp(-delta * 10));
    this.lastAttractor.copy(attractor);
    step.dt = dt;
    step.time += dt;
    step.chaos = 1 - 0.75 * d.resonance;
    step.order = d.resonance;
    step.active = stage === 'chaos' ? d.orchestrating : 0;
    step.radius = 1.25 + 0.5 * d.resonance;
    step.forge = gather;
    step.sapAngle += (stage === 'forge' || stage === 'relic' || stage === 'exit' ? dt : 0) * 0.35;
    step.bounds.set(S * aspect * 0.55, S * 0.55, 2.2);
    const portrait = aspect < 0.9;
    step.sapScale = portrait ? 0.68 : 1;
    step.sapCenter.set(0, portrait ? 0.55 : 0.15, 0);
    if (dt > 0) forge.step(step);
    forge.render(capture, d.shatterClock, awake, fade, d.resonance);

    const sap = forge.sap;
    sap.visible = reveal > 0;
    sap.rotation.y = step.sapAngle;
    sap.position.copy(step.sapCenter);
    sap.scale.setScalar(step.sapScale);
    const beat = Math.pow(0.5 + 0.5 * Math.sin(d.time * 2.6), 6);
    sap.material.uniforms.uReveal.value = reveal;
    sap.material.uniforms.uTime.value = d.time;
    sap.material.uniforms.uBeat.value = beat * reveal;
    // Na saída a seiva incandesce (o bloom cresce) enquanto o pulso nasce dela.
    sap.material.uniforms.uGlow.value = (stage === 'relic' ? 0.25 * beat : 0) + (stage === 'exit' ? 2.5 * Math.min(1, clock / FORGE.exit) : 0);

    // A saída: o pulso de luz nasce na Seiva e cobre a tela; a hub renasce do mesmo pulso.
    this.kit.pulse.material.setState(stage === 'exit' ? Math.min(1, clock / FORGE.exit) : 0, aspect);
  }
}
