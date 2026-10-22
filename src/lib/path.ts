import * as THREE from "three";
import { photos } from "./photos";

/**
 * The memory walk path. Runs from near the origin toward -Z, winding left/right.
 * Everything that needs to know about the path (scenery, photo placement,
 * player clamping, the ending) reads from here.
 */

/** Distance (world units) along the path between consecutive photos. */
export const PHOTO_SPACING = 4.5;
/** Path length before the first photo. */
export const INTRO_LENGTH = 8;
/** Path length after the last photo, leading to the ending platform. */
export const OUTRO_LENGTH = 14;
/** Lateral distance of photo centers from the path center. */
export const PHOTO_SIDE_OFFSET = 3.4;
/** Photo center height above ground. */
export const PHOTO_HEIGHT = 1.9;
/** Player may stray at most this far (horizontally) from the nearest path point. */
export const CORRIDOR_RADIUS = 2.6;
/** Camera height limits. */
export const MIN_HEIGHT = 0.9;
export const MAX_HEIGHT = 4.5;
/** Default eye height and spawn. */
export const EYE_HEIGHT = 1.7;
/** Ground is flat at y = 0 along the path. */
export const GROUND_Y = 0;
/** Path ribbon width (visual). */
export const PATH_WIDTH = 2.4;

const targetLength = INTRO_LENGTH + Math.max(1, photos.length - 1) * PHOTO_SPACING + OUTRO_LENGTH;

function buildControlPoints(length: number): THREE.Vector3[] {
  const step = 12;
  const n = Math.max(4, Math.ceil(length / step) + 1);
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k < n; k++) {
    // Start straight, then wind.
    const ramp = Math.min(1, k / 2);
    const x = ramp * (Math.sin(k * 0.85) * 7 + Math.sin(k * 0.31 + 1.3) * 4);
    pts.push(new THREE.Vector3(x, GROUND_Y, -k * step));
  }
  return pts;
}

/** Iteratively extend the curve until its arc length covers targetLength. */
function buildCurve(): THREE.CatmullRomCurve3 {
  let guess = targetLength;
  let curve = new THREE.CatmullRomCurve3(buildControlPoints(guess), false, "centripetal");
  for (let i = 0; i < 6 && curve.getLength() < targetLength; i++) {
    guess *= targetLength / curve.getLength() + 0.02;
    curve = new THREE.CatmullRomCurve3(buildControlPoints(guess), false, "centripetal");
  }
  return curve;
}

export const pathCurve = buildCurve();
pathCurve.arcLengthDivisions = 2000;
export const pathLength = pathCurve.getLength();

/** Uniformly spaced samples for fast nearest-point lookups. */
const SAMPLE_COUNT = 1200;
export const pathSamples: THREE.Vector3[] = pathCurve.getSpacedPoints(SAMPLE_COUNT);

/** Arc-length parameter u (0..1) for a distance along the path. */
export function uAtDistance(d: number): number {
  return THREE.MathUtils.clamp(d / pathLength, 0, 1);
}

/** Point on path at arc-length parameter u (0..1). */
export function pointAt(u: number, target = new THREE.Vector3()): THREE.Vector3 {
  return pathCurve.getPointAt(THREE.MathUtils.clamp(u, 0, 1), target);
}

/** Unit tangent (direction of travel) at u. */
export function tangentAt(u: number, target = new THREE.Vector3()): THREE.Vector3 {
  return pathCurve.getTangentAt(THREE.MathUtils.clamp(u, 0, 1), target).normalize();
}

/** Horizontal unit vector pointing to the RIGHT of travel at u. */
export function rightAt(u: number, target = new THREE.Vector3()): THREE.Vector3 {
  const t = tangentAt(u, target);
  return target.set(-t.z, 0, t.x).normalize();
}

export interface NearestResult {
  u: number;
  distanceAlong: number;
  point: THREE.Vector3;
  /** Horizontal distance from the query to the path point. */
  lateral: number;
}

const _tmp = new THREE.Vector3();
/**
 * Nearest point on the path to `pos`, ignoring height.
 * Pass the previous `u` as `hintU` to search only a local window (much cheaper).
 */
export function nearestOnPath(pos: THREE.Vector3, hintU?: number): NearestResult {
  let lo = 0;
  let hi = SAMPLE_COUNT;
  if (hintU !== undefined) {
    const c = Math.round(hintU * SAMPLE_COUNT);
    lo = Math.max(0, c - 60);
    hi = Math.min(SAMPLE_COUNT, c + 60);
  }
  let best = lo;
  let bestD = Infinity;
  for (let i = lo; i <= hi; i++) {
    const s = pathSamples[i];
    const dx = s.x - pos.x;
    const dz = s.z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const u = best / SAMPLE_COUNT;
  _tmp.copy(pathSamples[best]);
  return { u, distanceAlong: u * pathLength, point: _tmp.clone(), lateral: Math.sqrt(bestD) };
}

export interface PhotoPlacement {
  index: number;
  u: number;
  /** -1 = left of path, +1 = right of path */
  side: -1 | 1;
  position: THREE.Vector3;
  /** Y rotation so the photo faces the path (and slightly toward the oncoming walker). */
  rotationY: number;
}

export const photoPlacements: PhotoPlacement[] = photos.map((_, i) => {
  const u = uAtDistance(INTRO_LENGTH + i * PHOTO_SPACING);
  const side: -1 | 1 = i % 2 === 0 ? -1 : 1;
  const p = pointAt(u);
  const r = rightAt(u);
  const t = tangentAt(u);
  const position = p.clone().addScaledVector(r, side * PHOTO_SIDE_OFFSET);
  position.y = GROUND_Y + PHOTO_HEIGHT;
  // Face back toward the path center, turned ~25deg toward where the walker comes from (-tangent).
  const facing = r.clone().multiplyScalar(-side).addScaledVector(t, -0.45).normalize();
  const rotationY = Math.atan2(facing.x, facing.z);
  return { index: i, u, side, position, rotationY };
});

/** Spawn point and the ending platform. */
export const START_U = 0.004;
export const startPosition = pointAt(START_U).setY(GROUND_Y + EYE_HEIGHT);
export const startLookAt = pointAt(START_U + 0.03).setY(GROUND_Y + EYE_HEIGHT);
export const END_U = 1;
export const endPosition = pointAt(END_U - 2 / pathLength).setY(GROUND_Y);
/** Distance (horizontal) from endPosition that counts as "reached". */
export const END_TRIGGER_RADIUS = 2.5;
