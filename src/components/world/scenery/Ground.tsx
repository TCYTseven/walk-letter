"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { PALETTE, fbm, makeToonMaterial, smoothstep } from "./common";
import { groundHeight, pathBounds, clearanceDist } from "./layout";

/** World-space extent of the ground around the path. */
export const GROUND_MARGIN_X = 210;
export const GROUND_MARGIN_BACK = 170;
export const GROUND_MARGIN_FRONT = 200;
const CELL = 2.5;

/** Large rolling pastel meadow, flat along the path corridor. */
export default function Ground() {
  const geometry = useMemo(() => {
    const { minX, maxX, minZ, maxZ } = pathBounds;
    const x0 = minX - GROUND_MARGIN_X;
    const x1 = maxX + GROUND_MARGIN_X;
    const z0 = minZ - GROUND_MARGIN_FRONT;
    const z1 = maxZ + GROUND_MARGIN_BACK;
    const w = x1 - x0;
    const d = z1 - z0;
    const segX = Math.ceil(w / CELL);
    const segZ = Math.ceil(d / CELL);
    const geo = new THREE.PlaneGeometry(w, d, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const cA = new THREE.Color(PALETTE.groundA);
    const cB = new THREE.Color(PALETTE.groundB);
    const cC = new THREE.Color(PALETTE.groundC);
    const warm = new THREE.Color("#d8e7a4");
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = groundHeight(x, z);
      pos.setY(i, h);
      // Soft patches of color variation + lighter hilltops.
      const n = fbm(x * 0.06 + 3.1, z * 0.06 - 7.7, 3);
      tmp.copy(cA).lerp(cC, smoothstep(0.35, 0.65, n));
      tmp.lerp(cB, smoothstep(1.5, 7, h) * 0.8);
      // Slightly warmer, sun-kissed grass right next to the path.
      const dp = clearanceDist(x, z);
      tmp.lerp(warm, (1 - smoothstep(1.5, 6, dp)) * 0.35);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  const material = useMemo(() => makeToonMaterial({ vertexColors: true }), []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  return <mesh geometry={geometry} material={material} />;
}
