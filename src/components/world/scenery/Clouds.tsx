"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { pathLength } from "@/lib/path";
import { mulberry32, randRange, SUN_DIR } from "./common";
import { pathBounds } from "./layout";

const vertex = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vNormal = normalize(mat3(m) * normal);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
uniform vec3 uShadow;
uniform vec3 uMid;
uniform vec3 uLit;
uniform vec3 uRim;
uniform vec3 uSunDir;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  // Cel bands driven mostly by "up-ness" (sky light) plus some sun.
  float t = (n.y * 0.5 + 0.5) * 0.75 + max(dot(n, uSunDir), 0.0) * 0.35;
  float w = fwidth(t) * 1.2;
  vec3 col = mix(uShadow, uMid, smoothstep(0.42 - w, 0.42 + w, t));
  col = mix(col, uLit, smoothstep(0.66 - w, 0.66 + w, t));
  // Warm sunset rim on the silhouette.
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += uRim * rim * 0.45;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface CloudPuff {
  /** Offsets of each sphere relative to the cloud center + radius. */
  puffs: [number, number, number, number][];
  x: number;
  y: number;
  z: number;
  speed: number;
  /** Accumulated drift (mutated every frame). */
  offset: number;
}

/** Puffy toon clouds drifting slowly across the sunset sky. */
export default function Clouds() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { minX, maxX, minZ, maxZ } = pathBounds;
  const spanX0 = minX - 170;
  const spanX1 = maxX + 170;

  const clouds = useMemo<CloudPuff[]>(() => {
    const rng = mulberry32(777);
    const count = Math.round(14 + pathLength / 14);
    const list: CloudPuff[] = [];
    for (let i = 0; i < count; i++) {
      const puffs: CloudPuff["puffs"] = [];
      const n = 5 + Math.floor(rng() * 5);
      const len = randRange(rng, 7, 16);
      for (let k = 0; k < n; k++) {
        const f = n === 1 ? 0.5 : k / (n - 1);
        // Bigger puffs in the middle, flat-ish bottom.
        const r = (1 - Math.abs(f - 0.5) * 1.1) * randRange(rng, 3.2, 5.2);
        puffs.push([(f - 0.5) * len, r * 0.35 + randRange(rng, -0.4, 0.8), randRange(rng, -2, 2), r]);
      }
      list.push({
        puffs,
        x: randRange(rng, spanX0, spanX1),
        y: randRange(rng, 30, 62),
        z: randRange(rng, minZ - 150, maxZ + 70),
        speed: randRange(rng, 0.35, 0.9),
        offset: 0,
      });
    }
    return list;
  }, [spanX0, spanX1, minZ, maxZ]);

  const total = useMemo(() => clouds.reduce((s, c) => s + c.puffs.length, 0), [clouds]);
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 2), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uShadow: { value: new THREE.Color("#c9b4e3") },
          uMid: { value: new THREE.Color("#f7c9dc") },
          uLit: { value: new THREE.Color("#fff0e6") },
          uRim: { value: new THREE.Color("#ffb08a") },
          uSunDir: { value: SUN_DIR.clone() },
        },
        fog: false,
      }),
    []
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  const m = useMemo(() => new THREE.Matrix4(), []);
  const writeMatrices = (dt: number) => {
    const mesh = ref.current;
    if (!mesh) return;
    let k = 0;
    const width = spanX1 - spanX0;
    clouds.forEach((c) => {
      c.offset += c.speed * dt;
      let cx = c.x + c.offset;
      cx = spanX0 + ((((cx - spanX0) % width) + width) % width);
      for (const [ox, oy, oz, r] of c.puffs) {
        m.makeScale(r, r * 0.82, r).setPosition(cx + ox, c.y + oy, c.z + oz);
        mesh.setMatrixAt(k++, m);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  useEffect(() => writeMatrices(0), [clouds]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => writeMatrices(Math.min(dt, 0.1)));

  return <instancedMesh ref={ref} args={[geometry, material, total]} frustumCulled={false} />;
}
