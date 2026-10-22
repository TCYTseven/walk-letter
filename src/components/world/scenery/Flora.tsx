"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pathLength } from "@/lib/path";
import { makeWindToonMaterial, mulberry32, paintGeometry, pick, randRange } from "./common";
import { clearanceDist, distToNearestPhoto, groundHeight, PATH_HALF } from "./layout";
import Instanced, { trs } from "./Instanced";
import { SpacingGrid, samplePoint } from "./scatter";
import { makeBlobGeometry } from "./Trees";

const PHOTO_CLEAR = 1.8;
const BUSH_GREENS = ["#97cf97", "#a6d9a4", "#8ec79b", "#b2dca0"] as const;
const BUSH_BLOOM = ["#f7bfd4", "#fbd0c0", "#e2c9f2"] as const;
const PETALS = ["#ffb7cf", "#ffd0e0", "#d9c3f5", "#c7d8ff", "#fff3f8", "#ffd9b3", "#fff0a8", "#f8a9c4"] as const;

// ---------------------------------------------------------------------------
// Geometry builders
// ---------------------------------------------------------------------------
const STEM_H = 0.34;

function stemAndCenterGeometry(): THREE.BufferGeometry {
  const stem = paintGeometry(new THREE.CylinderGeometry(0.011, 0.016, STEM_H, 4, 1).translate(0, STEM_H / 2, 0), "#7fbf7a");
  const leaf = paintGeometry(
    new THREE.SphereGeometry(0.045, 5, 3).scale(1.5, 0.25, 0.6).translate(0.05, STEM_H * 0.35, 0).rotateY(0.6),
    "#8fcb84"
  );
  const center = paintGeometry(new THREE.SphereGeometry(0.03, 6, 4).translate(0, STEM_H + 0.012, 0), "#ffd36b");
  return mergeGeometries([stem, leaf, center])!;
}

function petalsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(
      new THREE.SphereGeometry(0.055, 6, 4)
        .scale(1.25, 0.32, 0.8)
        .translate(0.06, 0, 0)
        .rotateY(a)
        .translate(0, STEM_H, 0)
    );
  }
  return mergeGeometries(parts)!;
}

/** A tuft of curved grass blades. Normals point up so blades shade like the meadow. */
function grassTuftGeometry(rng: () => number): THREE.BufferGeometry {
  const blades = 7;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const base = new THREE.Color("#86c486");
  const tip = new THREE.Color("#d9efa0");
  const mid = base.clone().lerp(tip, 0.5);
  for (let b = 0; b < blades; b++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * 0.09;
    const ox = Math.cos(a) * r;
    const oz = Math.sin(a) * r;
    const h = randRange(rng, 0.2, 0.38);
    const w = randRange(rng, 0.025, 0.04);
    const lean = randRange(rng, 0.05, 0.14);
    const dir = rng() * Math.PI * 2;
    const dx = Math.cos(dir);
    const dz = Math.sin(dir);
    // Perpendicular for blade width.
    const px = -dz * w;
    const pz = dx * w;
    const i0 = pos.length / 3;
    // base L, base R, mid L, mid R, tip
    pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz);
    const mx = ox + dx * lean * 0.35;
    const mz = oz + dz * lean * 0.35;
    pos.push(mx - px * 0.7, h * 0.55, mz - pz * 0.7, mx + px * 0.7, h * 0.55, mz + pz * 0.7);
    pos.push(ox + dx * lean, h, oz + dz * lean);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, mid.r, mid.g, mid.b, mid.r, mid.g, mid.b, tip.r, tip.g, tip.b);
    idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2, i0 + 2, i0 + 3, i0 + 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const normals = new Float32Array(pos.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------
// Scatter
// ---------------------------------------------------------------------------
function useFloraData() {
  return useMemo(() => {
    const rng = mulberry32(90210);

    // --- Bushes: low round clusters just beyond the photo frames.
    const bushes: THREE.Matrix4[] = [];
    const bushColors: THREE.Color[] = [];
    const bushGrid = new SpacingGrid(3);
    const bushCount = Math.round(pathLength * 0.85 + 30);
    let placed = 0;
    for (let a = 0; a < bushCount * 8 && placed < bushCount; a++) {
      const p = samplePoint(rng, { minLat: 4.6, spread: 14, bias: 1.6, overshoot: 30, minClear: 4.4, photoClear: 2.4 });
      if (!p || !bushGrid.free(p[0], p[1], 0.9)) continue;
      bushGrid.add(p[0], p[1], 0.9);
      const [x, z] = p;
      const y = groundHeight(x, z);
      const blooming = rng() < 0.25;
      const c = new THREE.Color(pick(rng, blooming ? BUSH_BLOOM : BUSH_GREENS));
      const r = randRange(rng, 0.45, 0.75);
      bushes.push(trs(x, y + r * 0.45, z, 0, rng() * 6.28, 0, r, r * 0.85, r));
      bushColors.push(c);
      const lobes = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < lobes; k++) {
        const ang = rng() * Math.PI * 2;
        const rr = r * randRange(rng, 0.55, 0.8);
        const off = r * randRange(rng, 0.6, 0.9);
        bushes.push(trs(x + Math.cos(ang) * off, y + rr * 0.4, z + Math.sin(ang) * off, 0, rng() * 6.28, 0, rr, rr * 0.85, rr));
        bushColors.push(c.clone().offsetHSL(0, 0, randRange(rng, -0.04, 0.03)));
      }
      placed++;
    }

    // --- Flowers: little patches lining the walkway.
    const flowers: THREE.Matrix4[] = [];
    const petalColors: THREE.Color[] = [];
    const flowerTarget = Math.min(3500, Math.round(pathLength * 9 + 80));
    for (let a = 0; a < flowerTarget * 3 && flowers.length < flowerTarget; a++) {
      const c = samplePoint(rng, {
        minLat: PATH_HALF + 0.45,
        spread: 9,
        bias: 1.8,
        overshoot: 10,
        minClear: PATH_HALF + 0.35,
        photoClear: PHOTO_CLEAR,
      });
      if (!c) continue;
      const patchColor = pick(rng, PETALS);
      const n = 4 + Math.floor(rng() * 10);
      for (let k = 0; k < n; k++) {
        const ang = rng() * Math.PI * 2;
        const rad = Math.sqrt(rng()) * 0.85;
        const x = c[0] + Math.cos(ang) * rad;
        const z = c[1] + Math.sin(ang) * rad;
        if (clearanceDist(x, z) < PATH_HALF + 0.3 || distToNearestPhoto(x, z) < PHOTO_CLEAR) continue;
        const s = randRange(rng, 1.05, 1.75);
        flowers.push(trs(x, groundHeight(x, z), z, randRange(rng, -0.15, 0.15), rng() * 6.28, randRange(rng, -0.15, 0.15), s));
        petalColors.push(new THREE.Color(rng() < 0.82 ? patchColor : pick(rng, PETALS)));
      }
    }

    // --- Grass tufts: dense near the path, thinning out.
    const grass: THREE.Matrix4[] = [];
    const grassTarget = Math.min(11000, Math.round(pathLength * 40 + 300));
    for (let a = 0; a < grassTarget * 2 && grass.length < grassTarget; a++) {
      const p = samplePoint(rng, {
        minLat: PATH_HALF + 0.1,
        spread: 18,
        bias: 1.7,
        overshoot: 12,
        minClear: PATH_HALF + 0.05,
        photoClear: PHOTO_CLEAR,
      });
      if (!p) continue;
      const s = randRange(rng, 0.6, 1.15);
      grass.push(trs(p[0], groundHeight(p[0], p[1]) - 0.01, p[1], 0, rng() * 6.28, 0, s, s * randRange(rng, 0.8, 1.3), s));
    }

    return { bushes, bushColors, flowers, petalColors, grass };
  }, []);
}

/** Bushes, flower patches and swaying grass tufts. */
export default function Flora() {
  const data = useFloraData();

  const bushGeo = useMemo(() => makeBlobGeometry(1, 0.12), []);
  const bushMat = useMemo(() => makeWindToonMaterial({ amp: 0.02, base: 1.0 }), []);
  const stemGeo = useMemo(() => stemAndCenterGeometry(), []);
  const stemMat = useMemo(() => makeWindToonMaterial({ amp: 0.5, vertexColors: true }), []);
  const petalGeo = useMemo(() => petalsGeometry(), []);
  const petalMat = useMemo(() => makeWindToonMaterial({ amp: 0.5 }), []);
  const grassGeo = useMemo(() => grassTuftGeometry(mulberry32(7)), []);
  const grassMat = useMemo(
    () => makeWindToonMaterial({ amp: 0.6, vertexColors: true, side: THREE.DoubleSide }),
    []
  );

  return (
    <group>
      <Instanced geometry={bushGeo} material={bushMat} matrices={data.bushes} colors={data.bushColors} />
      <Instanced geometry={stemGeo} material={stemMat} matrices={data.flowers} />
      <Instanced geometry={petalGeo} material={petalMat} matrices={data.flowers} colors={data.petalColors} />
      <Instanced geometry={grassGeo} material={grassMat} matrices={data.grass} />
    </group>
  );
}
