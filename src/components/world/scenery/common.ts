import * as THREE from "three";

/**
 * Shared building blocks for the scenery: palette, seeded randomness, noise,
 * the toon gradient ramp and the wind-swaying toon material.
 */

// ---------------------------------------------------------------------------
// Palette (sRGB hex; THREE.Color converts to linear for us)
// ---------------------------------------------------------------------------
export const PALETTE = {
  skyTop: "#8f9fe0",
  skyMid: "#d9a8d8",
  skyHorizon: "#ffc9b0",
  fog: "#f8c8b4",
  sun: "#fff1d6",
  sunGlow: "#ffb38a",
  hemiSky: "#ffe0e6",
  hemiGround: "#a6d39a",
  sunLight: "#ffd9b0",
  groundA: "#a2d894",
  groundB: "#c4e3a0",
  groundC: "#8dcc8c",
  pathSand: "#f4dcb6",
  pathStone: "#fbe9cf",
  pathGrout: "#e8cba8",
} as const;

/** Direction toward the (visual) sun: low on the horizon, straight ahead (-Z). */
export const SUN_DIR = new THREE.Vector3(0, 0.12, -1).normalize();
/** Direction the key light comes FROM: upper right-front, so faces stay readable. */
export const LIGHT_DIR = new THREE.Vector3(0.45, 0.65, -0.6).normalize();

export const FOG_NEAR = 24;
export const FOG_FAR = 150;

// ---------------------------------------------------------------------------
// Seeded RNG + noise
// ---------------------------------------------------------------------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randRange = (rng: () => number, a: number, b: number) => a + (b - a) * rng();
export const pick = <T,>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** Smooth value noise in [0,1]. */
export function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal noise in roughly [0,1]. */
export function fbm(x: number, z: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Toon ramp
// ---------------------------------------------------------------------------
let _gradient: THREE.DataTexture | null = null;
/** 4-step cel ramp shared by every toon material. */
export function toonGradient(): THREE.DataTexture {
  if (_gradient) return _gradient;
  const steps = new Uint8Array([105, 160, 215, 255]);
  const tex = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  _gradient = tex;
  return tex;
}

// ---------------------------------------------------------------------------
// Wind
// ---------------------------------------------------------------------------
/** Single time uniform shared by every swaying material (ticked in Scenery). */
export const windTime = { value: 0 };

interface WindOptions {
  /** Sway amplitude per unit of (height + base)^2. */
  amp: number;
  /** Added to local y before squaring (use >0 for canopies centered at the origin). */
  base?: number;
  vertexColors?: boolean;
  color?: THREE.ColorRepresentation;
  side?: THREE.Side;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
}

/**
 * MeshToonMaterial whose vertices sway in the wind. Works with InstancedMesh:
 * the phase is taken from each instance's translation so neighbours move
 * slightly out of sync, like a breeze rolling across a meadow.
 */
export function makeWindToonMaterial(opts: WindOptions): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({
    color: opts.color ?? "#ffffff",
    gradientMap: toonGradient(),
    vertexColors: opts.vertexColors ?? false,
    side: opts.side ?? THREE.FrontSide,
    emissive: opts.emissive ?? "#000000",
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
  const amp = opts.amp;
  const base = opts.base ?? 0;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uTime;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
{
  #ifdef USE_INSTANCING
    vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  #else
    vec3 iPos = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
  #endif
  float hw = max(position.y + ${base.toFixed(3)}, 0.0);
  hw *= hw;
  float ph = uTime * 1.5 + iPos.x * 0.23 + iPos.z * 0.17;
  float gust = 0.65 + 0.35 * sin(uTime * 0.37 + iPos.z * 0.05);
  float s = (sin(ph) * 0.7 + sin(ph * 2.3 + 1.7) * 0.3) * gust;
  transformed.x += s * ${amp.toFixed(4)} * hw;
  transformed.z += cos(ph * 0.83 + 0.4) * ${(amp * 0.5).toFixed(4)} * hw;
}`
      );
  };
  mat.customProgramCacheKey = () => `wind-${amp}-${base}`;
  return mat;
}

/** Plain (non-swaying) toon material with the shared ramp. */
export function makeToonMaterial(params: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...params });
}

/** Paint every vertex of a geometry with a single color (for merged multi-color geometry). */
export function paintGeometry(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}
