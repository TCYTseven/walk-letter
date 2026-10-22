"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { pathCurve, pathLength } from "@/lib/path";
import { PALETTE, makeToonMaterial, mulberry32, randRange, pick } from "./common";
import { PATH_HALF } from "./layout";

/**
 * The winding walkway: a soft-edged cobble ribbon following the path curve,
 * lined with little pastel pebbles on both sides.
 */
export default function PathRibbon() {
  const geometry = useMemo(() => {
    const segs = Math.max(8, Math.ceil(pathLength * 2.5));
    const pts = pathCurve.getSpacedPoints(segs);
    const pos = new Float32Array((segs + 1) * 2 * 3);
    const attr = new Float32Array((segs + 1) * 2 * 2);
    const normals = new Float32Array((segs + 1) * 2 * 3);
    const idx: number[] = [];
    const t = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(segs, i + 1)];
      t.subVectors(b, a).setY(0).normalize();
      const rx = -t.z;
      const rz = t.x;
      const p = pts[i];
      const along = (i / segs) * pathLength;
      for (let s = 0; s < 2; s++) {
        const side = s === 0 ? -1 : 1;
        const k = i * 2 + s;
        pos[k * 3] = p.x + rx * PATH_HALF * side;
        pos[k * 3 + 1] = 0.012;
        pos[k * 3 + 2] = p.z + rz * PATH_HALF * side;
        normals[k * 3 + 1] = 1;
        attr[k * 2] = side;
        attr[k * 2 + 1] = along;
      }
      if (i < segs) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geo.setAttribute("aPath", new THREE.BufferAttribute(attr, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }, []);

  const material = useMemo(() => {
    const mat = makeToonMaterial({ transparent: true, depthWrite: false });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSand = { value: new THREE.Color(PALETTE.pathSand) };
      shader.uniforms.uStone = { value: new THREE.Color(PALETTE.pathStone) };
      shader.uniforms.uGrout = { value: new THREE.Color(PALETTE.pathGrout) };
      shader.uniforms.uHalf = { value: PATH_HALF };
      shader.uniforms.uLength = { value: pathLength };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute vec2 aPath;
varying vec2 vPath;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vPath = aPath;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
uniform vec3 uSand;
uniform vec3 uStone;
uniform vec3 uGrout;
uniform float uHalf;
uniform float uLength;
varying vec2 vPath;

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
// Returns (F1, F2 - F1, cellHash)
vec3 voronoi(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float f1 = 8.0, f2 = 8.0, id = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(n + g);
    o = 0.5 + 0.38 * sin(6.2831 * o);
    float d = length(g + o - f);
    if (d < f1) { f2 = f1; f1 = d; id = hash22(n + g + 7.0).x; }
    else if (d < f2) { f2 = d; }
  }
  return vec3(f1, f2 - f1, id);
}`
        )
        .replace(
          "vec4 diffuseColor = vec4( diffuse, opacity );",
          `vec2 pp = vec2(vPath.x * uHalf, vPath.y) * 2.7;
vec3 vr = voronoi(pp);
float stoneMask = smoothstep(0.035, 0.09, vr.y);
vec3 stone = uStone * (0.94 + 0.1 * vr.z);
vec3 pathCol = mix(uGrout, stone, stoneMask);
// Sandy border where cobbles give way to the grass.
float ax = abs(vPath.x);
pathCol = mix(pathCol, uSand, smoothstep(0.62, 0.86, ax));
float edgeAlpha = 1.0 - smoothstep(0.86, 1.0, ax);
float endAlpha = smoothstep(0.0, 2.0, vPath.y) * smoothstep(0.0, 1.5, uLength - vPath.y);
vec4 diffuseColor = vec4(pathCol, opacity * edgeAlpha * endAlpha);`
        );
    };
    mat.customProgramCacheKey = () => "path-ribbon";
    return mat;
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  return (
    <>
      <mesh geometry={geometry} material={material} renderOrder={1} />
      <EdgePebbles />
    </>
  );
}

const PEBBLE_COLORS = ["#f6e3cf", "#efd2c4", "#e9dcea", "#f3e9d6", "#e6d6c6"] as const;

/** Little rounded stones dotted along both edges of the walkway. */
function EdgePebbles() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const spacing = 0.95;
  const perSide = Math.max(1, Math.floor((pathLength - 3) / spacing));
  const count = perSide * 2;

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(0.16, 1), []);
  const material = useMemo(() => makeToonMaterial({ color: "#ffffff" }), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const rng = mulberry32(4242);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const c = new THREE.Color();
    let k = 0;
    for (let i = 0; i < perSide; i++) {
      for (const side of [-1, 1]) {
        const dist = 1.5 + i * spacing + (rng() - 0.5) * 0.35;
        const u = THREE.MathUtils.clamp(dist / pathLength, 0, 1);
        pathCurve.getPointAt(u, p);
        pathCurve.getTangentAt(u, tan);
        const lat = (PATH_HALF + 0.08 + rng() * 0.18) * side;
        p.x += -tan.z * lat;
        p.z += tan.x * lat;
        p.y = 0.02;
        e.set(rng() * 0.4, rng() * Math.PI * 2, rng() * 0.4);
        q.setFromEuler(e);
        const sc = randRange(rng, 0.7, 1.25);
        s.set(sc * randRange(rng, 1, 1.5), sc * 0.45, sc);
        m.compose(p, q, s);
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, c.set(pick(rng, PEBBLE_COLORS)));
        k++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [perSide]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  return <instancedMesh ref={ref} args={[geometry, material, count]} />;
}
