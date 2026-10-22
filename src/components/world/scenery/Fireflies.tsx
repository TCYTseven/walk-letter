"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { pathLength } from "@/lib/path";
import { mulberry32, randRange } from "./common";
import { frameAtDistance, groundHeight } from "./layout";

const vertex = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
attribute vec4 aSeed; // phase, speed, radius, size
varying float vAlpha;
void main() {
  vec3 p = position;
  float t = uTime * aSeed.y + aSeed.x;
  // Lazy figure-eight drift.
  p.x += sin(t * 0.9) * aSeed.z + sin(t * 2.3) * 0.12;
  p.y += sin(t * 1.3 + 1.7) * aSeed.z * 0.45;
  p.z += cos(t * 0.7) * aSeed.z;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  gl_PointSize = min(uSize * aSeed.w * uPixelRatio * (12.0 / max(dist, 0.5)), 56.0 * uPixelRatio);
  // Twinkle + fade out with distance (fog-ish) and very close up.
  float tw = 0.55 + 0.45 * sin(uTime * (1.5 + aSeed.y * 2.0) + aSeed.x * 3.0);
  vAlpha = tw * (1.0 - smoothstep(30.0, 60.0, dist)) * smoothstep(0.4, 1.4, dist);
}
`;

const fragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.0, d);
  float glow = core * core;
  float hot = smoothstep(0.18, 0.0, d);
  vec3 col = uColor * (glow * 1.2 + hot * 2.2);
  gl_FragColor = vec4(col * vAlpha, 1.0);
}
`;

/** Warm glowing fireflies floating lazily along the path. Bright enough to bloom. */
export default function Fireflies() {
  const dpr = useThree((s) => s.viewport.dpr);

  const geometry = useMemo(() => {
    const rng = mulberry32(31337);
    const count = Math.min(520, Math.round(pathLength * 2.2 + 60));
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const [px, pz, tx, tz] = frameAtDistance(randRange(rng, -6, pathLength + 8));
      const side = rng() < 0.5 ? -1 : 1;
      const lat = Math.pow(rng(), 0.8) * 9 * side;
      const x = px - tz * lat;
      const z = pz + tx * lat;
      pos[i * 3] = x;
      pos[i * 3 + 1] = groundHeight(x, z) + randRange(rng, 0.35, 3.2);
      pos[i * 3 + 2] = z;
      seed[i * 4] = rng() * 100;
      seed[i * 4 + 1] = randRange(rng, 0.25, 0.7);
      seed[i * 4 + 2] = randRange(rng, 0.25, 0.9);
      seed[i * 4 + 3] = randRange(rng, 0.6, 1.3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    geo.computeBoundingSphere();
    if (geo.boundingSphere) geo.boundingSphere.radius += 2;
    return geo;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: 1 },
          uSize: { value: 9 },
          uColor: { value: new THREE.Color(1.0, 0.82, 0.45) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    []
  );

  useEffect(() => {
    material.uniforms.uPixelRatio.value = dpr;
  }, [dpr, material]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  useFrame((_, dt) => {
    material.uniforms.uTime.value += Math.min(dt, 0.1);
  });

  return <points geometry={geometry} material={material} renderOrder={5} />;
}
