"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { heartGeometry } from "./shared";

/** Glossy red wax seal: an irregular blobby rim disc with a raised heart on top. */
export default function WaxSeal({ radius = 0.21 }: { radius?: number }) {
  const rimGeo = useMemo(() => {
    // Irregular disc: wobble the outer radius so it looks like poured wax.
    const s = new THREE.Shape();
    const N = 64;
    const phase = Math.random() * 10;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r =
        radius * (1 + 0.06 * Math.sin(a * 5 + phase) + 0.035 * Math.sin(a * 11 + phase * 2) + 0.02 * Math.sin(a * 3));
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.02,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.022,
      bevelSegments: 4,
      curveSegments: 8,
    });
    return g;
  }, [radius]);

  const heartGeo = useMemo(() => heartGeometry(radius * 1.05, 0.03, 0.6), [radius]);
  // Pressed ring inside the rim (the stamp edge).
  const ringGeo = useMemo(() => new THREE.TorusGeometry(radius * 0.8, 0.008, 8, 48), [radius]);

  return (
    <group>
      <mesh geometry={rimGeo} castShadow>
        <meshPhysicalMaterial color="#c9184a" roughness={0.38} clearcoat={0.7} clearcoatRoughness={0.25} />
      </mesh>
      <mesh geometry={ringGeo} position={[0, 0, 0.042]}>
        <meshPhysicalMaterial color="#a4133c" roughness={0.45} clearcoat={0.5} />
      </mesh>
      <mesh geometry={heartGeo} position={[0, -0.005, 0.06]}>
        <meshPhysicalMaterial
          color="#ff4d6d"
          roughness={0.28}
          clearcoat={1}
          clearcoatRoughness={0.15}
          sheen={0.4}
          sheenColor="#ffb3c1"
        />
      </mesh>
    </group>
  );
}
