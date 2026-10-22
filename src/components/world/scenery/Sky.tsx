"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PALETTE, SUN_DIR, FOG_NEAR, FOG_FAR } from "./common";

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  // Sit just inside the far clip plane. z == w is on the boundary, and some
  // GPUs clip the whole dome for a frame, which presents as a black flash.
  gl_Position.z = gl_Position.w * 0.9999;
}
`;

const fragment = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uGlow;
uniform vec3 uSunDir;
varying vec3 vDir;

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;

  // Vertical gradient: horizon peach -> pink/lilac -> lavender blue.
  float hp = max(h, 0.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, pow(hp, 0.8)));
  col = mix(col, uTop, smoothstep(0.18, 0.75, hp));

  // Warm glow around the sun. Faded in just above the horizon so the
  // fogged ground meets the sky without a seam.
  float sd = max(dot(dir, uSunDir), 0.0);
  float horizonMask = smoothstep(-0.03, 0.06, h);
  float glow = pow(sd, 6.0) * 0.55 + pow(sd, 32.0) * 0.6;
  // A wide horizontal band of warmth along the horizon in the sun direction.
  float band = pow(sd, 2.0) * exp(-abs(h) * 9.0) * 0.35;
  col += uGlow * (glow + band) * horizonMask;

  // Big soft sun disc (HDR so it blooms).
  float disc = smoothstep(0.9965, 0.9982, sd);
  float halo = smoothstep(0.985, 0.9982, sd);
  col = mix(col, uSun * 2.6, disc * horizonMask);
  col += uSun * halo * 0.35 * horizonMask;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Gradient sky dome + matching warm fog. The dome follows the camera. */
export default function Sky() {
  const mesh = useRef<THREE.Mesh>(null);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uTop: { value: new THREE.Color(PALETTE.skyTop) },
          uMid: { value: new THREE.Color(PALETTE.skyMid) },
          uHorizon: { value: new THREE.Color(PALETTE.fog) },
          uSun: { value: new THREE.Color(PALETTE.sun) },
          uGlow: { value: new THREE.Color(PALETTE.sunGlow) },
          uSunDir: { value: SUN_DIR.clone() },
        },
        side: THREE.BackSide,
        depthTest: false,
        depthWrite: false,
        fog: false,
      }),
    []
  );
  const geometry = useMemo(() => new THREE.SphereGeometry(400, 48, 24), []);

  useEffect(
    () => () => {
      material.dispose();
      geometry.dispose();
    },
    [material, geometry]
  );

  useFrame(({ camera }) => {
    mesh.current?.position.copy(camera.position);
  });

  return (
    <>
      <color attach="background" args={[PALETTE.fog]} />
      <fog attach="fog" args={[PALETTE.fog, FOG_NEAR, FOG_FAR]} />
      <mesh ref={mesh} geometry={geometry} material={material} renderOrder={-1000} frustumCulled={false} />
    </>
  );
}
