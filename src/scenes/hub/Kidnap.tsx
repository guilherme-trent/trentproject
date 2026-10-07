'use client';

import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Float32BufferAttribute,
  NormalBlending,
  ShaderMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type Group,
  type Mesh,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { easeInQuad, progress, smoothstep } from '@/engine/lib/time';
import { glsl } from '@/shaders/glsl';
import { createFullscreenTriangle } from '@/shaders/fullscreen';
import { VeilMaterial } from '../shared/VeilMaterial';
import { KIDNAP, type HubDirector } from './director';

/**
 * A mão: palma achatada + 5 dedos (tubos ao longo de Catmull-Rom, afinando
 * até a ponta). `aBase` é a junta de cada dedo e `aT` a posição ao longo
 * dele (0 na junta → 1 na ponta; −1 na palma): o vertex shader curva cada
 * dedo progressivamente em torno da junta — contorcendo-se no avanço,
 * fechando-se sobre a câmera no fim. Uma geometria, um draw call.
 */
function createHandGeometry() {
  const palm = new SphereGeometry(0.55, 18, 14);
  palm.scale(1, 1.1, 0.42);
  palm.deleteAttribute('uv');
  const palmCount = palm.getAttribute('position').count;
  palm.setAttribute('aBase', new Float32BufferAttribute(new Float32Array(palmCount * 3), 3));
  palm.setAttribute('aT', new Float32BufferAttribute(new Float32Array(palmCount).fill(-1), 1));

  const parts: BufferGeometry[] = [palm];
  const FINGERS = [
    { x: -0.5, y: 0.05, spread: -1.0, length: 0.75 }, // polegar
    { x: -0.3, y: 0.5, spread: -0.32, length: 1.05 },
    { x: -0.06, y: 0.58, spread: -0.08, length: 1.2 },
    { x: 0.18, y: 0.54, spread: 0.14, length: 1.1 },
    { x: 0.4, y: 0.42, spread: 0.38, length: 0.85 },
  ];
  const SEGMENTS = 18;
  const RADIAL = 8;
  for (const finger of FINGERS) {
    const base = new Vector3(finger.x, finger.y, 0.05);
    const direction = new Vector3(finger.spread, 1, 0).normalize();
    const points = [0, 0.35, 0.7, 1].map((k) =>
      base.clone().addScaledVector(direction, finger.length * k).add(new Vector3(0, 0, Math.sin(k * Math.PI) * 0.12)),
    );
    const curve = new CatmullRomCurve3(points);
    const tube = new TubeGeometry(curve, SEGMENTS, 0.13, RADIAL, false);
    tube.deleteAttribute('uv');
    const position = tube.getAttribute('position');
    const aBase = new Float32Array(position.count * 3);
    const aT = new Float32Array(position.count);
    const center = new Vector3();
    const p = new Vector3();
    for (let ring = 0; ring <= SEGMENTS; ring++) {
      const t = ring / SEGMENTS;
      curve.getPointAt(t, center);
      for (let r = 0; r <= RADIAL; r++) {
        const v = ring * (RADIAL + 1) + r;
        // Afina até a ponta: garra, não salsicha.
        p.fromBufferAttribute(position, v).sub(center).multiplyScalar(1 - 0.62 * t).add(center);
        position.setXYZ(v, p.x, p.y, p.z);
        aBase.set([base.x, base.y, base.z], v * 3);
        aT[v] = t;
      }
    }
    tube.computeVertexNormals();
    tube.setAttribute('aBase', new Float32BufferAttribute(aBase, 3));
    tube.setAttribute('aT', new Float32BufferAttribute(aT, 1));
    parts.push(tube);
  }
  const hand = mergeGeometries(parts)!;
  parts.forEach((part) => part.dispose());
  return hand;
}

/** Matéria escura: núcleo preto absoluto, borda de Fresnel violeta-carmim, veias pulsando. */
class AnomalyMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        attribute vec3 aBase;
        attribute float aT;
        uniform float uTime;
        uniform float uGrip;
        varying vec3 vNormalView;
        varying vec3 vView;
        varying vec3 vLocal;
        void main() {
          vec3 p = position;
          vec3 n = normal;
          if (aT >= 0.0) {
            // Contorce no avanço; fecha (curva para a frente, +Z) no agarrão.
            float writhe = sin(uTime * 9.0 + aBase.x * 11.0) * 0.35 * (1.0 - uGrip);
            float angle = (uGrip * 2.1 + writhe) * aT;
            float c = cos(angle);
            float s = sin(angle);
            vec3 local = p - aBase;
            p = aBase + vec3(local.x, c * local.y - s * local.z, s * local.y + c * local.z);
            n = vec3(n.x, c * n.y - s * n.z, s * n.y + c * n.z);
          }
          p += n * sin(uTime * 11.0 + position.y * 15.0 + position.x * 7.0) * 0.018;
          vec4 view = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * view;
          vNormalView = normalize(normalMatrix * n);
          vView = view.xyz;
          vLocal = position;
        }`,
      fragmentShader: glsl`
        uniform float uTime;
        varying vec3 vNormalView;
        varying vec3 vView;
        varying vec3 vLocal;
        void main() {
          float facing = abs(dot(normalize(vNormalView), normalize(-vView)));
          float rim = pow(1.0 - facing, 3.0);
          float veins = pow(0.5 + 0.5 * sin(vLocal.y * 22.0 + sin(vLocal.x * 13.0) * 2.0 - uTime * 6.0), 18.0);
          vec3 color = mix(vec3(0.45, 0.05, 0.9), vec3(1.0, 0.1, 0.25), rim) * rim * 2.4 + vec3(0.5, 0.1, 1.0) * veins * 0.35 * (1.0 - facing);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      uniforms: { uTime: { value: 0 }, uGrip: { value: 0 } },
    });
  }

  setState(time: number, grip: number) {
    this.uniforms.uTime.value = time;
    this.uniforms.uGrip.value = grip;
  }
}

/** Aura de escuridão atrás da mão (mistura normal, alpha radial): a distorção que engole a luz. */
class AuraMaterial extends ShaderMaterial {
  constructor() {
    super({
      vertexShader: glsl`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: glsl`
        uniform float uStrength;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec2 q = vUv - 0.5;
          float r = length(q) * 2.0;
          float wobble = 0.08 * sin(atan(q.y, q.x) * 7.0 + uTime * 5.0);
          float alpha = (1.0 - smoothstep(0.25, 1.0 + wobble, r)) * uStrength;
          gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
        }`,
      uniforms: { uStrength: { value: 0 }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
  }

  setState(strength: number, time: number) {
    this.uniforms.uStrength.value = strength;
    this.uniforms.uTime.value = time;
  }
}

const easeInCubic = (x: number) => x * x * x;

/**
 * O SEQUESTRO: do fruto 1 recém-estilhaçado emerge uma anomalia — uma mão
 * de matéria escura — que avança violentamente no eixo Z contra a câmera,
 * acelerando, com os dedos se fechando no último instante. A tela vai a
 * preto absoluto e fica assim por 1s (ver KIDNAP); então o reino começa.
 */
export function Kidnap({ director }: { director: HubDirector }) {
  const group = useRef<Group>(null);
  const aura = useRef<Mesh>(null);
  const geometry = useMemo(() => createHandGeometry(), []);
  const [materials] = useState(() => ({
    hand: new AnomalyMaterial(),
    aura: new AuraMaterial(),
    veil: new VeilMaterial(new Color(0, 0, 0)),
  }));
  const veil = useMemo(() => createFullscreenTriangle(), []);
  const path = useRef<{ from: Vector3; to: Vector3; forward: Vector3 } | null>(null);

  useFrame(({ camera, scene, clock }) => {
    const k = director.kidnapClock;
    const hand = group.current;
    if (!hand) return;
    if (k < 0) {
      // Fora do sequestro: minúscula, mas no grafo — os programas compilam no
      // carregamento da hub, não no meio da cena (custo: 2 draws de ~0 pixels).
      hand.scale.setScalar(1e-4);
      materials.veil.setAlpha(0);
      return;
    }
    if (!path.current) {
      const fruit = scene.getObjectByName('fruit:architecture');
      const from = fruit ? fruit.getWorldPosition(new Vector3()) : new Vector3();
      const forward = camera.getWorldDirection(new Vector3());
      path.current = { from, to: camera.position.clone().addScaledVector(forward, 0.7).add(new Vector3(0, -0.25, 0)), forward };
    }
    const { from, to } = path.current;
    const emerge = smoothstep(0, KIDNAP.emerge, k);
    const lunge = easeInCubic(progress(k, KIDNAP.lunge[0], KIDNAP.lunge[1]));
    hand.position.lerpVectors(from, to, lunge);
    hand.position.y += Math.sin(emerge * Math.PI) * 0.4 * (1 - lunge);
    hand.scale.setScalar(0.15 + emerge * 0.55 + lunge * 1.9);
    hand.lookAt(camera.position);
    materials.hand.setState(clock.elapsedTime, smoothstep(KIDNAP.grip[0], KIDNAP.grip[1], k));
    if (aura.current) aura.current.scale.setScalar(3.2 + lunge * 4);
    materials.aura.setState(Math.min(1, emerge * 0.7 + lunge * 0.6), clock.elapsedTime);
    materials.veil.setAlpha(easeInQuad(progress(k, KIDNAP.black[0], KIDNAP.black[1])));
  });

  return (
    <>
      <group ref={group} scale={1e-4} name="kidnap-hand">
        <mesh ref={aura} material={materials.aura} position-z={-0.4} renderOrder={40} frustumCulled={false}>
          <planeGeometry args={[1, 1]} />
        </mesh>
        <mesh geometry={geometry} material={materials.hand} renderOrder={41} frustumCulled={false} />
      </group>
      <mesh name="kidnap-veil" geometry={veil} material={materials.veil} renderOrder={300} frustumCulled={false} />
    </>
  );
}
