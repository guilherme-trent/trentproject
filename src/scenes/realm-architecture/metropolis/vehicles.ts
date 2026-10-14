import { Quaternion, Vector3, Euler } from 'three';
import { mulberry32 } from '@/engine/lib/random';
import { smoothstep } from '@/engine/lib/time';
import { cameraZ, reachAt, span, TUNNEL } from './config';
import { LANDMARKS, landmarkToWorld, VEHICLE_AT } from './landmarks';
import { box, ellipse, lathe, polyline, subdivide, type Pen, type V3 } from './lineart';

/**
 * OS VEÍCULOS — criações humanas que PASSAM pelo túnel, cada uma na sua época
 * da linha do tempo dos monumentos (landmarks.ts).
 *
 * Geometria: todos numa única geometria de linhas, em coordenadas locais (o
 * nariz aponta para +z). Movimento: por veículo, a CPU escreve 2 vec4 por
 * frame (posição + visibilidade, rotação em quatérnio) e o vertex shader
 * posiciona as linhas — 1 draw call para todos, com os mesmos reflexos do
 * túnel. A chama do Saturn V é um ESTILO de linha que o shader estica e faz
 * tremeluzir.
 *
 * Cada passagem é disparada quando a câmera chega ao seu progresso e segue o
 * RELÓGIO (o avião passa mesmo que você pare). Recuando bem antes do gatilho,
 * ela se rearma.
 */

export const VEHICLES = ['saturn', 'iss', 'bis', 'concorde', 'shinkansen'] as const;
export type VehicleId = (typeof VEHICLES)[number];

/** Estilo de cada linha (aVehicle.y): casco, detalhe (mais fraco) e chama. */
export const STYLE = { hull: 0, detail: 1, flame: 2 } as const;
/** Altura local da boca dos motores F-1 (a chama nasce dali). */
export const NOZZLE_Y = -0.14;

type StyledPen = (style: number) => Pen;

// ── Modelos ──────────────────────────────────────────────────────────────────

/** Saturn V: três estágios, a Apollo no topo com a torre de escape, as aletas e os cinco motores F-1. */
function saturnV(pen: StyledPen) {
  const hull = pen(STYLE.hull);
  const detail = pen(STYLE.detail);
  const r1 = 0.136;
  lathe(hull, [[r1, 0], [r1, 1.14], [r1, 1.98], [0.095, 2.07], [0.095, 2.49], [0.088, 2.55], [0.088, 2.66], [0.02, 2.79]], 0, 0, 8);
  pen(STYLE.detail)([0, 2.79, 0], [0, 3.0, 0], 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    detail([Math.cos(a) * 0.035, 2.79, Math.sin(a) * 0.035], [0, 2.9, 0], 0);
  }
  // As aletas da base.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const out = (r: number, y: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r];
    polyline(hull, [out(r1, 0.25), out(r1 + 0.07, 0.12), out(r1 + 0.07, -0.02), out(r1, 0)]);
  }
  // Os cinco F-1 (um no centro, quatro em cruz) e a chama de cada um.
  const rng = mulberry32(0xf1);
  const bells: [number, number][] = [[0, 0], ...[0, 1, 2, 3].map((i): [number, number] => [Math.cos(Math.PI / 4 + (i * Math.PI) / 2) * 0.08, Math.sin(Math.PI / 4 + (i * Math.PI) / 2) * 0.08])];
  for (const [bx, bz] of bells) {
    lathe(detail, [[0.028, 0], [0.05, NOZZLE_Y]], bx, bz, 6);
    const flame = pen(STYLE.flame);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const length = 0.55 + rng() * 0.45;
      flame([bx + Math.cos(a) * 0.045, NOZZLE_Y, bz + Math.sin(a) * 0.045], [bx + Math.cos(a) * 0.09, NOZZLE_Y - length, bz + Math.sin(a) * 0.09], 0);
    }
    flame([bx, NOZZLE_Y, bz], [bx, NOZZLE_Y - 1.15, bz], 0);
  }
}

/** Estação Espacial: a treliça integrada (com o X das faces), os oito painéis solares, os radiadores e os módulos. */
function iss(pen: StyledPen) {
  const hull = pen(STYLE.hull);
  const detail = pen(STYLE.detail);
  const half = 1.5;
  const w = 0.04;
  const bays = 12;
  const corners: [number, number][] = [[-w, -w], [w, -w], [w, w], [-w, w]];
  for (const [y, z] of corners) polyline(hull, subdivide([-half, y, z], [half, y, z], bays));
  for (let k = 0; k <= bays; k++) {
    const x = -half + (2 * half * k) / bays;
    polyline(detail, corners.map(([y, z]): V3 => [x, y, z]), 0, 0, true);
    if (k < bays) {
      const x1 = x + (2 * half) / bays;
      detail([x, w, -w], [x1, w, w], 0);
      detail([x, -w, w], [x1, w, w], 0);
    }
  }
  for (const x of [-1.45, -1.25, 1.25, 1.45])
    for (const dir of [-1, 1]) {
      const z0 = dir * 0.06;
      const z1 = dir * 1.0;
      polyline(hull, [[x - 0.07, 0, z0], [x + 0.07, 0, z0], [x + 0.07, 0, z1], [x - 0.07, 0, z1]], 0, 0, true);
      detail([x, 0, z0], [x, 0, z1], 0);
      for (let k = 1; k < 5; k++) {
        const z = z0 + ((z1 - z0) * k) / 5;
        detail([x - 0.07, 0, z], [x + 0.07, 0, z], 0);
      }
    }
  for (const x of [-0.55, 0.55]) {
    polyline(hull, [[x, -0.05, -0.06], [x, -0.5, -0.06], [x, -0.5, 0.06], [x, -0.05, 0.06]], 0, 0, true);
    detail([x, -0.2, -0.06], [x, -0.2, 0.06], 0);
    detail([x, -0.35, -0.06], [x, -0.35, 0.06], 0);
  }
  // Os módulos pressurizados, em fila sob a treliça.
  for (const [z0, z1] of [[-0.55, -0.25], [-0.25, 0.05], [0.05, 0.35], [0.35, 0.6]] as const) {
    const ring = (z: number) => Array.from({ length: 6 }, (_, i): V3 => { const a = (i / 6) * Math.PI * 2; return [Math.cos(a) * 0.06, -0.12 + Math.sin(a) * 0.06, z]; });
    polyline(hull, ring(z0), 0, 0, true);
    polyline(hull, ring(z1), 0, 0, true);
    ring(z0).forEach((p, i) => detail(p, ring(z1)[i], 0));
  }
}

/** 14-Bis: a célula de pato na frente, as asas-caixa em biplano com diedro, a hélice atrás e as rodas. */
function bis(pen: StyledPen) {
  const hull = pen(STYLE.hull);
  const detail = pen(STYLE.detail);
  for (const [x, y] of [[-0.04, -0.04], [0.04, -0.04], [0.04, 0.04], [-0.04, 0.04]]) hull([x, y, -0.5], [x, y, 0.55], 0);
  for (const z of [-0.5, -0.15, 0.2, 0.55]) polyline(detail, [[-0.04, -0.04, z], [0.04, -0.04, z], [0.04, 0.04, z], [-0.04, 0.04, z]], 0, 0, true);
  box(hull, [-0.12, -0.08, 0.55], [0.12, 0.12, 0.8]);
  const dihedral = (x: number) => 0.07 * (Math.abs(x) / 0.62);
  for (const y of [0, 0.2]) {
    polyline(hull, [-0.62, -0.31, 0, 0.31, 0.62].map((x): V3 => [x, y + dihedral(x), -0.26]));
    polyline(hull, [-0.62, -0.31, 0, 0.31, 0.62].map((x): V3 => [x, y + dihedral(x), -0.48]));
  }
  for (const x of [-0.62, -0.35, -0.12, 0.12, 0.35, 0.62])
    for (const z of [-0.26, -0.48]) detail([x, dihedral(x), z], [x, 0.2 + dihedral(x), z], 0);
  // A hélice (propulsora, atrás), o motor e o cesto do piloto.
  detail([-0.14, 0.02, -0.53], [0.14, -0.02, -0.53], 0);
  box(detail, [-0.04, -0.03, -0.5], [0.04, 0.05, -0.4]);
  box(detail, [-0.05, -0.06, -0.2], [0.05, 0.04, -0.08]);
  for (const x of [-0.15, 0.15]) {
    polyline(hull, Array.from({ length: 8 }, (_, i): V3 => { const a = (i / 8) * Math.PI * 2; return [x, -0.24 + Math.sin(a) * 0.06, -0.3 + Math.cos(a) * 0.06]; }), 0, 0, true);
    detail([x, -0.18, -0.3], [x * 0.3, -0.02, -0.3], 0);
  }
}

/** Concorde: a fuselagem fina com o nariz caído, a asa em ogiva, as naceles duplas e a deriva. */
function concorde(pen: StyledPen) {
  const hull = pen(STYLE.hull);
  const detail = pen(STYLE.detail);
  const radius = (z: number) => (z > 0.85 ? 0.075 * Math.sqrt(Math.max(0, (1.3 - z) / 0.45)) : z < -1.0 ? 0.075 * Math.pow(Math.max(0, (z + 1.3) / 0.3), 0.7) : 0.075);
  const droop = (z: number) => (z > 0.95 ? -0.03 * ((z - 0.95) / 0.35) : 0);
  const STATIONS = 18;
  const zs = Array.from({ length: STATIONS }, (_, i) => 1.3 - (2.6 * i) / (STATIONS - 1));
  for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI, (4 * Math.PI) / 3, (5 * Math.PI) / 3])
    polyline(hull, zs.map((z): V3 => [Math.sin(a) * radius(z), droop(z) + Math.cos(a) * radius(z) * 1.1, z]));
  for (const z of [0.85, 0.3, -0.3, -0.85]) polyline(detail, ellipse(0, droop(z), z, radius(z), radius(z) * 1.1, 8).map(([x, y, zz]): V3 => [x, y, zz]), 0, 0, true);
  for (const side of [-1, 1]) {
    const lead: V3[] = [[0.07, -0.035, 0.6], [0.11, -0.035, 0.25], [0.17, -0.035, -0.1], [0.28, -0.035, -0.5], [0.42, -0.035, -0.82], [0.52, -0.035, -1.02]].map(([x, y, z]): V3 => [side * x, y, z]);
    polyline(hull, lead);
    polyline(hull, [[side * 0.52, -0.035, -1.02], [side * 0.5, -0.035, -1.1], [side * 0.07, -0.035, -1.15]]);
    for (const x of [0.2, 0.35]) detail([side * x, -0.035, x < 0.3 ? -0.2 : -0.62], [side * x, -0.035, -1.12], 0);
    box(detail, [side > 0 ? 0.12 : -0.31, -0.1, -1.12], [side > 0 ? 0.31 : -0.12, -0.04, -0.45]);
  }
  polyline(hull, [[0, 0.07, -0.75], [0, 0.48, -1.18], [0, 0.48, -1.28], [0, 0.07, -1.3]]);
  detail([0, 0.12, -1.1], [0, 0.45, -1.25], 0);
}

/** Shinkansen Série 500: corpo de seção quase circular, os dois narizes longos, a faixa de janelas e o pantógrafo em T. */
function shinkansen(pen: StyledPen) {
  const hull = pen(STYLE.hull);
  const detail = pen(STYLE.detail);
  const R = 0.16;
  const center = 0.2;
  const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4];
  const at = (a: number, z: number, r = R, c = center): V3 => [Math.sin(a) * r, c + Math.cos(a) * r * 0.95, z];
  const cars: [number, number][] = [[2.65, 1.6], [1.55, 0.05], [0, -1.5], [-1.55, -2.6]];
  cars.forEach(([z0, z1]) => {
    for (const a of angles) hull(at(a, z0), at(a, z1), 0);
    polyline(detail, angles.map((a) => at(a, z0)), 0, 0, true);
    polyline(detail, angles.map((a) => at(a, z1)), 0, 0, true);
    for (const side of [-1, 1])
      for (let k = 0; k < 6; k++) {
        const z = z0 - ((z0 - z1) * (k + 0.2)) / 6;
        detail([side * R * 0.97, center + 0.06, z], [side * R * 0.97, center + 0.06, z - ((z0 - z1) / 6) * 0.6], 0);
      }
  });
  // Os narizes: o raio afina até a ponta, que desce (bico de martim-pescador).
  for (const [root, tip] of [[2.65, 3.4], [-2.6, -3.35]] as const) {
    const STEPS = 6;
    for (const a of angles)
      polyline(hull, Array.from({ length: STEPS + 1 }, (_, i) => { const t = i / STEPS; return at(a, root + (tip - root) * t, R * Math.sqrt(1 - t * 0.98), center - 0.08 * t); }));
    for (const t of [0.35, 0.7]) polyline(detail, angles.map((a) => at(a, root + (tip - root) * t, R * Math.sqrt(1 - t * 0.98), center - 0.08 * t)), 0, 0, true);
  }
  detail([0, center + R, 0.8], [0, center + R + 0.12, 0.8], 0);
  detail([-0.07, center + R + 0.12, 0.8], [0.07, center + R + 0.12, 0.8], 0);
}

const MODELS: Record<VehicleId, (pen: StyledPen) => void> = { saturn: saturnV, iss, bis, concorde, shinkansen };

/** Escala de cada modelo (o 14-Bis é pequeno demais na escala real do túnel). */
const SCALE: Record<VehicleId, number> = { saturn: 1, iss: 1, bis: 1.7, concorde: 1, shinkansen: 1 };

export interface TrafficGeometry {
  position: Float32Array;
  /** x: índice do veículo · y: estilo da linha */
  vehicle: Float32Array;
}

export function createTrafficGeometry(): TrafficGeometry {
  const position: number[] = [];
  const vehicle: number[] = [];
  VEHICLES.forEach((id, index) => {
    const s = SCALE[id];
    MODELS[id]((style) => (a, b) => {
      position.push(a[0] * s, a[1] * s, a[2] * s, b[0] * s, b[1] * s, b[2] * s);
      vehicle.push(index, style, index, style);
    });
  });
  return { position: new Float32Array(position), vehicle: new Float32Array(vehicle) };
}

// ── Movimento ────────────────────────────────────────────────────────────────

export interface VehicleState {
  position: Vector3;
  rotation: Quaternion;
  /** 0 = invisível. */
  alpha: number;
}

const F = TUNNEL.floor;
const pad = landmarkToWorld(LANDMARKS.find((l) => l.id === 'launchpad')!, [0, 0, 0]);
const euler = new Euler();
const fade = (t: number, duration: number, inTime: number, outTime: number) => smoothstep(0, inTime, t) * (1 - smoothstep(duration - outTime, duration, t));

/** O Saturn V decola quando a câmera está a esta distância (z) da base. */
const LAUNCH_DISTANCE = 8;

interface Pass {
  /** Progresso em que a passagem dispara. */
  trigger: number;
  duration: number;
  /** Estado no instante `t` da passagem (s), na âncora `z` (onde a câmera estava no gatilho). */
  pose(state: VehicleState, t: number, z: number): void;
}

const PASSES: Record<Exclude<VehicleId, 'saturn'>, Pass> = {
  // Cruza o túnel de um lado ao outro, devagar, balançando — o primeiro voo.
  bis: {
    trigger: VEHICLE_AT.bis,
    duration: 8,
    pose(state, t, z) {
      state.position.set(7.5 - (15 * t) / 8, 0.55 + 0.1 * Math.sin(t * 1.3), z - 6 + 0.3 * Math.sin(t * 0.5));
      state.rotation.setFromEuler(euler.set(0.05 * Math.sin(t * 2.1), -Math.PI / 2, 0.08 * Math.sin(t * 1.7)));
      state.alpha = fade(t, 8, 0.8, 1);
    },
  },
  // Deriva no alto do distrito da Estrutura, girando devagar.
  iss: {
    trigger: VEHICLE_AT.iss,
    duration: 16,
    pose(state, t, z) {
      state.position.set(-3.0, 1.62, z - 14 + 1.6 * t); // nasce já depois dos mastros do Millau
      state.rotation.setFromEuler(euler.set(0.12 * Math.sin(t * 0.3), 0.25 + t * 0.04, 0.08));
      state.alpha = fade(t, 16, 1.5, 2);
    },
  },
  // Rasga o corredor pelo alto, vindo de frente, e passa por cima da câmera.
  concorde: {
    trigger: VEHICLE_AT.concorde,
    duration: 3.2,
    pose(state, t, z) {
      state.position.set(0.7, 1.45 - 0.08 * (t / 3.2), z - 32 + (37 * t) / 3.2);
      state.rotation.setFromEuler(euler.set(-0.03, 0, -0.12 + 0.06 * Math.sin(t * 2)));
      state.alpha = fade(t, 3.2, 0.5, 0.35);
    },
  },
  // Pelos trilhos do chão do corredor, vindo de frente, passando ao lado da câmera.
  shinkansen: {
    trigger: VEHICLE_AT.shinkansen,
    duration: 3.4,
    pose(state, t, z) {
      state.position.set(0.86, F, z - 26 + (34 * t) / 3.4);
      state.rotation.identity();
      state.alpha = fade(t, 3.4, 0.4, 0.3);
    },
  },
};

/** Recuo (em progresso) abaixo do gatilho que rearma uma passagem já vista. */
const REARM = span(1.9);

/**
 * O estado de todas as passagens. Uma por instância de quadro (o reino e a
 * prévia pela fissura têm cada um a sua): ela guarda quando cada veículo partiu.
 */
export class Traffic {
  readonly states: Record<VehicleId, VehicleState> = Object.fromEntries(
    VEHICLES.map((id) => [id, { position: new Vector3(), rotation: new Quaternion(), alpha: 0 }]),
  ) as Record<VehicleId, VehicleState>;
  /** 0..1: intensidade da chama do Saturn V. */
  flame = 0;
  private readonly launchedAt: Partial<Record<VehicleId, { time: number; z: number }>> = {};

  update(progress: number, time: number) {
    for (const id of Object.keys(PASSES) as (keyof typeof PASSES)[]) {
      const pass = PASSES[id];
      const state = this.states[id];
      let launch = this.launchedAt[id];
      if (!launch && progress >= pass.trigger) launch = this.launchedAt[id] = { time, z: cameraZ(pass.trigger) };
      if (launch && progress < pass.trigger - REARM && time - launch.time > pass.duration) launch = this.launchedAt[id] = undefined;
      const t = launch ? time - launch.time : -1;
      if (t < 0 || t > pass.duration) state.alpha = 0;
      else pass.pose(state, t, launch!.z);
    }
    this.updateSaturn(progress, time);
  }

  /**
   * Na base enquanto a câmera se aproxima; a 8 unidades, ignição (a chama
   * cresce) e a subida acelerada — some ao atravessar o teto.
   */
  private updateSaturn(progress: number, time: number) {
    const state = this.states.saturn;
    const trigger = reachAt(pad[2] + LAUNCH_DISTANCE);
    const ahead = cameraZ(progress) - pad[2];
    let launch = this.launchedAt.saturn;
    if (!launch && progress >= trigger) launch = this.launchedAt.saturn = { time, z: pad[2] };
    if (launch && progress < trigger - REARM) launch = this.launchedAt.saturn = undefined;
    const t = launch ? time - launch.time : 0;
    const rise = launch ? 0.42 * Math.max(0, t - 1.6) ** 2 : 0;
    state.position.set(pad[0], F + 0.2 + rise, pad[2]);
    state.rotation.identity();
    // Visível com a base (a construção chega ~16 unidades à frente) e até sumir no teto.
    state.alpha = smoothstep(17, 12, ahead) * (1 - smoothstep(TUNNEL.ceiling - F + 0.5, TUNNEL.ceiling - F + 1.5, rise));
    this.flame = launch ? smoothstep(0, 1.4, t) * (1 - smoothstep(6, 7, t)) : 0;
  }
}
