import { pathLength, PHOTO_SIDE_OFFSET } from "@/lib/path";
import { randRange } from "./common";
import { clearanceDist, distToNearestPhoto, frameAtDistance } from "./layout";

/** Tiny spatial hash to enforce a minimum spacing between scattered objects. */
export class SpacingGrid {
  private cells = new Map<string, [number, number, number][]>();
  constructor(private cell: number) {}
  private key(i: number, j: number) {
    return `${i},${j}`;
  }
  /** True if no stored point (with its radius) overlaps (x,z,r). */
  free(x: number, z: number, r: number): boolean {
    const i0 = Math.floor(x / this.cell);
    const j0 = Math.floor(z / this.cell);
    for (let j = j0 - 2; j <= j0 + 2; j++)
      for (let i = i0 - 2; i <= i0 + 2; i++) {
        const list = this.cells.get(this.key(i, j));
        if (!list) continue;
        for (const [px, pz, pr] of list) if (Math.hypot(px - x, pz - z) < r + pr) return false;
      }
    return true;
  }
  add(x: number, z: number, r: number) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    const list = this.cells.get(k);
    if (list) list.push([x, z, r]);
    else this.cells.set(k, [[x, z, r]]);
  }
}

export interface ScatterOptions {
  /** Minimum lateral distance from the path centerline. */
  minLat: number;
  /** Lateral spread beyond minLat. */
  spread: number;
  /** >1 biases points toward the path. */
  bias: number;
  /** Extra distance before the start / after the end to cover. */
  overshoot: number;
  /** Minimum allowed clearance (distance to path / ending clearing). */
  minClear: number;
  /** Clear radius around photo frames. */
  photoClear: number;
}

/** Random point near the path obeying the clearance rules, or null if rejected. */
export function samplePoint(rng: () => number, o: ScatterOptions): [number, number] | null {
  const dist = randRange(rng, -o.overshoot, pathLength + o.overshoot);
  const [px, pz, tx, tz] = frameAtDistance(dist);
  const side = rng() < 0.5 ? -1 : 1;
  const lat = (o.minLat + Math.pow(rng(), o.bias) * o.spread) * side;
  const x = px - tz * lat;
  const z = pz + tx * lat;
  if (clearanceDist(x, z) < o.minClear) return null;
  if (o.photoClear > 0 && distToNearestPhoto(x, z) < o.photoClear) return null;
  return [x, z];
}

/** Trees must stay outside the photo corridor. */
export const TREE_CLEAR = PHOTO_SIDE_OFFSET + 1.5;
