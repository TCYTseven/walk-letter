"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32, PALETTE, randRange } from "./common";

/**
 * Layers of soft lavender hills on the horizon (unfogged, colors pre-blended
 * toward the haze) so the sunset has depth behind the meadow.
 */
export default function DistantHills() {
  const geometry = useMemo(() => {
    const rng = mulberry32(2468);
    const haze = new THREE.Color(PALETTE.fog);
    const layers = [
      { dist: 190, color: "#c8a6cf", h: [16, 26] as const, mix: 0.45 },
      { dist: 240, color: "#b9a1d6", h: [22, 36] as const, mix: 0.6 },
    ];
    const parts: THREE.BufferGeometry[] = [];
    for (const layer of layers) {
      const top = new THREE.Color(layer.color).lerp(haze, layer.mix * 0.6);
      const bottom = haze.clone();
      // Ring of hills around the viewer (the ring follows the camera, like a skybox).
      const n = 26;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng() * 0.15;
        const x = Math.cos(a) * layer.dist;
        const z = Math.sin(a) * layer.dist;
        const r = randRange(rng, 45, 80);
        // Lower hills straight ahead (-Z) so the setting sun stays visible.
        const ahead = THREE.MathUtils.smoothstep(-Math.sin(a), 0.3, 0.95);
        const h = randRange(rng, layer.h[0], layer.h[1]) * (1 - ahead * 0.55);
        const g = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        g.scale(r, h, r * randRange(rng, 0.6, 1));
        g.rotateY(rng() * Math.PI);
        g.translate(x, -1, z);
        const pos = g.attributes.position as THREE.BufferAttribute;
        const col = new Float32Array(pos.count * 3);
        const c = new THREE.Color();
        for (let k = 0; k < pos.count; k++) {
          const t = THREE.MathUtils.clamp((pos.getY(k) + 1) / h, 0, 1);
          c.copy(bottom).lerp(top, Math.pow(t, 0.6));
          col[k * 3] = c.r;
          col[k * 3 + 1] = c.g;
          col[k * 3 + 2] = c.b;
        }
        g.setAttribute("color", new THREE.BufferAttribute(col, 3));
        g.deleteAttribute("uv");
        g.deleteAttribute("normal");
        parts.push(g);
      }
    }
    return mergeGeometries(parts)!;
  }, []);

  const material = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    ref.current?.position.set(camera.position.x, 0, camera.position.z);
  });

  return <mesh ref={ref} geometry={geometry} material={material} frustumCulled={false} renderOrder={-900} />;
}
