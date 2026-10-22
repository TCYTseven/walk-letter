"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";

export interface InstanceData {
  matrices: THREE.Matrix4[];
  /** Optional per-instance colors (same length as matrices). */
  colors?: THREE.Color[];
}

interface Props extends InstanceData {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Dispose geometry + material on unmount (default true). */
  disposeResources?: boolean;
}

/** Thin wrapper: fills an InstancedMesh from precomputed matrices/colors. */
export default function Instanced({ geometry, material, matrices, colors, disposeResources = true }: Props) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = Math.max(1, matrices.length);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.count = matrices.length;
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
      if (colors) mesh.setColorAt(i, colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices, colors]);

  useEffect(
    () => () => {
      if (!disposeResources) return;
      geometry.dispose();
      material.dispose();
    },
    [geometry, material, disposeResources]
  );

  return <instancedMesh key={count} ref={ref} args={[geometry, material, count]} />;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
/** Compose a matrix from position, Euler rotation and (possibly non-uniform) scale. */
export function trs(
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,
  sx: number,
  sy = sx,
  sz = sx
): THREE.Matrix4 {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}
