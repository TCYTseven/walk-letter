import * as THREE from "three";
import {
  pathSamples,
  pathLength,
  pointAt,
  tangentAt,
  photoPlacements,
  endPosition,
  PATH_WIDTH,
} from "@/lib/path";
import { fbm, smoothstep } from "./common";

/**
 * Spatial layout helpers derived from the path: a coarse distance field to the
 * path (for fast "how far am I from the path?" queries while scattering),
 * the ground height function, bounds, and placement rules.
 */

/** Distance-field reach; anything farther reports FIELD_RADIUS. */
const FIELD_RADIUS = 26;
const CELL = 1;

// ---------------------------------------------------------------------------
// Bounds of the path (xz)
// ---------------------------------------------------------------------------
let minX = Infinity;
let maxX = -Infinity;
let minZ = Infinity;
let maxZ = -Infinity;
for (const p of pathSamples) {
  minX = Math.min(minX, p.x);
  maxX = Math.max(maxX, p.x);
  minZ = Math.min(minZ, p.z);
  maxZ = Math.max(maxZ, p.z);
}
export const pathBounds = { minX, maxX, minZ, maxZ };

// ---------------------------------------------------------------------------
// Distance field
// ---------------------------------------------------------------------------
const fx0 = minX - FIELD_RADIUS;
const fz0 = minZ - FIELD_RADIUS;
const fw = Math.ceil((maxX - minX + FIELD_RADIUS * 2) / CELL) + 1;
const fh = Math.ceil((maxZ - minZ + FIELD_RADIUS * 2) / CELL) + 1;
const field = new Float32Array(fw * fh).fill(FIELD_RADIUS);

(function buildField() {
  const r = Math.ceil(FIELD_RADIUS / CELL);
  // Samples are ~0.2 units apart; every other one is plenty for a 1-unit grid
  // because we store the exact distance from each cell center to each sample.
  for (let s = 0; s < pathSamples.length; s += 2) {
    const p = pathSamples[s];
    const cx = Math.round((p.x - fx0) / CELL);
    const cz = Math.round((p.z - fz0) / CELL);
    for (let j = Math.max(0, cz - r); j <= Math.min(fh - 1, cz + r); j++) {
      const wz = fz0 + j * CELL;
      const dz = wz - p.z;
      for (let i = Math.max(0, cx - r); i <= Math.min(fw - 1, cx + r); i++) {
        const wx = fx0 + i * CELL;
        const dx = wx - p.x;
        const d = Math.sqrt(dx * dx + dz * dz);
        const k = j * fw + i;
        if (d < field[k]) field[k] = d;
      }
    }
  }
})();

/** Approximate horizontal distance from (x,z) to the path centerline (bilinear on a 1-unit grid). */
export function distToPath(x: number, z: number): number {
  const gx = (x - fx0) / CELL;
  const gz = (z - fz0) / CELL;
  if (gx < 0 || gz < 0 || gx >= fw - 1 || gz >= fh - 1) return FIELD_RADIUS;
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const tx = gx - i;
  const tz = gz - j;
  const a = field[j * fw + i];
  const b = field[j * fw + i + 1];
  const c = field[(j + 1) * fw + i];
  const d = field[(j + 1) * fw + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

// ---------------------------------------------------------------------------
// Ground height
// ---------------------------------------------------------------------------
/** Radius around the ending platform that is kept flat and clear of trees. */
export const END_CLEAR_RADIUS = 9;

/** Effective "distance from walkable area": the path corridor plus the ending clearing. */
export function clearanceDist(x: number, z: number): number {
  const dEnd = Math.hypot(x - endPosition.x, z - endPosition.z) - (END_CLEAR_RADIUS - 4);
  return Math.min(distToPath(x, z), Math.max(0, dEnd));
}

/** Ground height: exactly 0 within ~4 units of the path, rolling pastel hills beyond. */
export function groundHeight(x: number, z: number): number {
  const d = clearanceDist(x, z);
  if (d < 4) return 0;
  const ramp = smoothstep(4, 18, d);
  const amp = 2.2 + Math.min(d, 90) * 0.075;
  const n = fbm(x * 0.022 + 13.7, z * 0.022 - 4.1, 4);
  const h = Math.max(0, n - 0.32) * 1.6 * amp;
  return h * ramp;
}

// ---------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
/**
 * Point at a distance along the path, linearly extrapolated before the start
 * and beyond the end so scenery continues into the background.
 * Returns [x, z, tangentX, tangentZ].
 */
export function frameAtDistance(dist: number): [number, number, number, number] {
  const u = THREE.MathUtils.clamp(dist / pathLength, 0, 1);
  pointAt(u, _p);
  tangentAt(u, _t);
  const extra = dist < 0 ? dist : dist > pathLength ? dist - pathLength : 0;
  return [_p.x + _t.x * extra, _p.z + _t.z * extra, _t.x, _t.z];
}

/** Horizontal distance to the nearest photo center. */
export function distToNearestPhoto(x: number, z: number): number {
  let best = Infinity;
  for (const pl of photoPlacements) {
    const d = Math.hypot(pl.position.x - x, pl.position.z - z);
    if (d < best) best = d;
  }
  return best;
}

/** Half-width of the visual path ribbon. */
export const PATH_HALF = PATH_WIDTH / 2;
