"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * One-shot burst of twinkly star particles, played when a photo is revealed.
 * Mounted only for the duration of the burst. Geometry is shared.
 */

const COUNT = 46;
const DURATION = 1.8;

let sharedGeometry: THREE.BufferGeometry | null = null;
function getBurstGeometry(): THREE.BufferGeometry {
  if (sharedGeometry) return sharedGeometry;
  const pos = new Float32Array(COUNT * 3);
  const dir = new Float32Array(COUNT * 3);
  const rnd = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    // Start somewhere across the sticker (-1..1), fly outward + toward viewer.
    const sx = Math.random() * 2 - 1;
    const sy = Math.random() * 2 - 1;
    pos.set([sx, sy, 0], i * 3);
    const a = Math.random() * Math.PI * 2;
    const s = 0.3 + Math.random() * 0.9;
    dir.set([Math.cos(a) * s + sx * 0.4, Math.sin(a) * s + sy * 0.4 + 0.25, 0.4 + Math.random() * 1.1], i * 3);
    rnd[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aDir", new THREE.BufferAttribute(dir, 3));
  g.setAttribute("aRand", new THREE.BufferAttribute(rnd, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
  sharedGeometry = g;
  return g;
}

const vertexShader = /* glsl */ `
  uniform float uT;
  uniform vec2 uHalf;
  uniform float uPixelRatio;
  attribute vec3 aDir;
  attribute float aRand;
  varying float vRand;
  varying float vFade;
  void main() {
    float t = clamp(uT - aRand * 0.25, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - t, 3.0);
    vec3 p = vec3(position.xy * uHalf, 0.05) + aDir * e * 0.9;
    p.y -= t * t * 0.25;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFade = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.55, 1.0, t));
    vRand = aRand;
    gl_PointSize = (14.0 + aRand * 18.0) * uPixelRatio * vFade * (1.0 / max(-mv.z, 0.5)) * 2.2;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vRand;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    // little 4-point star: soft core + cross arms
    float core = smoothstep(0.22, 0.0, d);
    float arms = smoothstep(0.06, 0.0, abs(c.x)) * smoothstep(0.5, 0.0, abs(c.y))
               + smoothstep(0.06, 0.0, abs(c.y)) * smoothstep(0.5, 0.0, abs(c.x));
    float a = clamp(core + arms * 0.7, 0.0, 1.0) * vFade;
    if (a < 0.01) discard;
    vec3 pink = vec3(1.0, 0.55, 0.85);
    vec3 gold = vec3(1.0, 0.88, 0.55);
    vec3 lilac = vec3(0.75, 0.65, 1.0);
    vec3 col = vRand < 0.33 ? pink : (vRand < 0.66 ? gold : lilac);
    col = mix(col, vec3(1.0), core * 0.6) * 2.4; // > 1 so it blooms
    gl_FragColor = vec4(col * a, a);
  }
`;

interface Props {
  halfWidth: number;
  halfHeight: number;
  onDone: () => void;
}

export default function SparkleBurst({ halfWidth, halfHeight, onDone }: Props) {
  const dpr = useThree((s) => s.viewport.dpr);
  const elapsed = useRef(0);
  const done = useRef(false);
  const geometry = getBurstGeometry();

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uT: { value: 0 },
          uHalf: { value: new THREE.Vector2(halfWidth, halfHeight) },
          uPixelRatio: { value: dpr },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, delta) => {
    if (done.current) return;
    elapsed.current += Math.min(delta, 0.05);
    const t = elapsed.current / DURATION;
    material.uniforms.uT.value = t;
    if (t >= 1.25) {
      done.current = true;
      onDone();
    }
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}
