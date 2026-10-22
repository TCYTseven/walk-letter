"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pathLength } from "@/lib/path";
import { makeToonMaterial, makeWindToonMaterial, mulberry32, pick, randRange, valueNoise } from "./common";
import { groundHeight, clearanceDist, distToNearestPhoto } from "./layout";
import Instanced, { trs } from "./Instanced";
import { SpacingGrid, samplePoint, TREE_CLEAR } from "./scatter";

const GREENS = ["#9fd49a", "#b4e0a0", "#8fcf9e", "#a9dcb6", "#c2e39b"] as const;
const BLOSSOMS = ["#ffc4d6", "#ffb3cb", "#ffd3e2", "#fbc0dd"] as const;
const LILACS = ["#dcc8f2", "#e7d3f5"] as const;
const PINES = ["#86c6a6", "#95cfb0", "#7dbfa3"] as const;
const TRUNKS = ["#b98a73", "#c4957e", "#a97f6c"] as const;

/** A lumpy, smooth-shaded blob for canopies and bushes. */
export function makeBlobGeometry(detail = 2, lump = 0.12): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  geo = mergeVertices(geo);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = valueNoise(v.x * 2.1 + 5, v.z * 2.1 + v.y * 1.7) - 0.5;
    v.multiplyScalar(1 + n * lump * 2);
    v.y *= 0.92;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Rounded low-poly trees: leafy blobs, cherry blossoms, a few soft pines. */
export default function Trees() {
  const data = useMemo(() => {
    const rng = mulberry32(1337);
    const grid = new SpacingGrid(4);
    const trunks: THREE.Matrix4[] = [];
    const trunkColors: THREE.Color[] = [];
    const blobs: THREE.Matrix4[] = [];
    const blobColors: THREE.Color[] = [];
    const cones: THREE.Matrix4[] = [];
    const coneColors: THREE.Color[] = [];

    const place = (x: number, z: number, scale: number) => {
      const y = groundHeight(x, z) - 0.15;
      const roll = rng();
      const kind = roll < 0.3 ? "cherry" : roll < 0.42 ? "pine" : roll < 0.47 ? "lilac" : "leafy";
      const trunkH = randRange(rng, 1.3, 2.1) * scale;
      const trunkW = randRange(rng, 0.85, 1.2) * scale;
      const lean = (rng() - 0.5) * 0.12;
      trunks.push(trs(x, y, z, lean, rng() * Math.PI * 2, -lean, trunkW, kind === "pine" ? trunkH * 0.7 : trunkH, trunkW));
      trunkColors.push(new THREE.Color(pick(rng, TRUNKS)));

      if (kind === "pine") {
        const col = new THREE.Color(pick(rng, PINES));
        const r0 = randRange(rng, 1.2, 1.6) * scale;
        let cy = y + trunkH * 0.5;
        for (let k = 0; k < 3; k++) {
          const r = r0 * (1 - k * 0.24);
          cones.push(trs(x, cy, z, 0, rng() * Math.PI, 0, r, r * 1.05, r));
          coneColors.push(col);
          cy += r * 0.95;
        }
        return;
      }

      const palette = kind === "cherry" ? BLOSSOMS : kind === "lilac" ? LILACS : GREENS;
      const base = new THREE.Color(pick(rng, palette));
      const r = randRange(rng, 1.25, 1.85) * scale * (kind === "cherry" ? 1.1 : 1);
      const top = y + trunkH + r * 0.55;
      blobs.push(trs(x, top, z, 0, rng() * 6.28, 0, r, r * randRange(rng, 0.85, 1), r));
      blobColors.push(base);
      const extra = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < extra; k++) {
        const a = rng() * Math.PI * 2;
        const rr = r * randRange(rng, 0.55, 0.72);
        const off = r * randRange(rng, 0.55, 0.75);
        blobs.push(
          trs(x + Math.cos(a) * off, top + randRange(rng, -0.45, 0.25) * r, z + Math.sin(a) * off, 0, rng() * 6.28, 0, rr)
        );
        // Slight tint variation between lobes for a hand-painted feel.
        blobColors.push(base.clone().offsetHSL(randRange(rng, -0.015, 0.015), 0, randRange(rng, -0.04, 0.04)));
      }
    };

    // Near band: frames the walkway right behind the photos.
    const nearCount = Math.round(pathLength * 1.1 + 40);
    let placed = 0;
    for (let a = 0; a < nearCount * 8 && placed < nearCount; a++) {
      const p = samplePoint(rng, {
        minLat: TREE_CLEAR + 1.5,
        spread: 22,
        bias: 1.7,
        overshoot: 40,
        minClear: TREE_CLEAR,
        photoClear: 0,
      });
      if (!p) continue;
      const scale = randRange(rng, 0.85, 1.25);
      // Keep the whole canopy (not just the trunk) out of the photo corridor.
      if (clearanceDist(p[0], p[1]) < TREE_CLEAR + 2.2 * scale) continue;
      if (distToNearestPhoto(p[0], p[1]) < 1.8 + 3.2 * scale) continue;
      if (!grid.free(p[0], p[1], 1.5 * scale)) continue;
      grid.add(p[0], p[1], 1.5 * scale);
      place(p[0], p[1], scale);
      placed++;
    }
    // Far band: dots the rolling hills so the world feels like it goes on.
    const farCount = Math.round(pathLength * 0.9 + 80);
    placed = 0;
    for (let a = 0; a < farCount * 6 && placed < farCount; a++) {
      const p = samplePoint(rng, {
        minLat: 24,
        spread: 110,
        bias: 1.3,
        overshoot: 120,
        minClear: TREE_CLEAR,
        photoClear: 0,
      });
      if (!p) continue;
      const scale = randRange(rng, 1.1, 1.9);
      if (!grid.free(p[0], p[1], 2.2 * scale)) continue;
      grid.add(p[0], p[1], 2.2 * scale);
      place(p[0], p[1], scale);
      placed++;
    }
    return { trunks, trunkColors, blobs, blobColors, cones, coneColors };
  }, []);

  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.13, 0.22, 1, 7).translate(0, 0.5, 0), []);
  const blobGeo = useMemo(() => makeBlobGeometry(2, 0.14), []);
  const coneGeo = useMemo(() => new THREE.ConeGeometry(1, 1.5, 9).translate(0, 0.75, 0), []);
  const trunkMat = useMemo(() => makeToonMaterial(), []);
  const blobMat = useMemo(() => makeWindToonMaterial({ amp: 0.012, base: 1.0 }), []);
  const coneMat = useMemo(() => makeWindToonMaterial({ amp: 0.01, base: 0.2 }), []);

  return (
    <group>
      <Instanced geometry={trunkGeo} material={trunkMat} matrices={data.trunks} colors={data.trunkColors} />
      <Instanced geometry={blobGeo} material={blobMat} matrices={data.blobs} colors={data.blobColors} />
      <Instanced geometry={coneGeo} material={coneMat} matrices={data.cones} colors={data.coneColors} />
    </group>
  );
}
