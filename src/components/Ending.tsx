"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { END_TRIGGER_RADIUS, endPosition } from "@/lib/path";

/**
 * The end of the memory walk: a round pastel platform with a glowing ring,
 * a soft column of rising light motes and a floating, spinning heart.
 * Stepping onto it sets `reachedEnd` and releases the pointer.
 */

const PLATFORM_RADIUS = 1.7;
const BEAM_HEIGHT = 7;
const PARTICLE_COUNT = 90;

/** Colors pushed above 1 so the bloom pass picks them up. */
const RING_GLOW = new THREE.Color("#ff9ec0").multiplyScalar(2.6);
const INNER_GLOW = new THREE.Color("#ffd6e6").multiplyScalar(1.6);

function makeHeartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(5, 5);
  s.bezierCurveTo(5, 5, 4, 0, 0, 0);
  s.bezierCurveTo(-6, 0, -6, 7, -6, 7);
  s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
  s.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
  s.bezierCurveTo(16, 7, 16, 0, 10, 0);
  s.bezierCurveTo(7, 0, 5, 5, 5, 5);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 3.5,
    bevelEnabled: true,
    bevelSegments: 6,
    bevelSize: 1.6,
    bevelThickness: 1.6,
    curveSegments: 24,
  });
  geo.center();
  geo.rotateZ(Math.PI); // the classic shape is upside down
  geo.scale(0.03, 0.03, 0.03);
  geo.computeVertexNormals();
  return geo;
}

// ---- shaders -------------------------------------------------------------
const beamVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const beamFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    // Soft edges: brightest where we look straight through the column's middle.
    float facing = abs(dot(vNormalV, vViewDir));
    float body = pow(facing, 1.6);
    float fade = pow(1.0 - vUv.y, 2.2) * smoothstep(0.0, 0.04, vUv.y);
    float shimmer = 0.85 + 0.15 * sin(vUv.y * 22.0 - uTime * 2.0 + vUv.x * 6.2831);
    float a = body * fade * shimmer * 0.32;
    gl_FragColor = vec4(uColor, a);
  }
`;

const glowVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const glowFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = pow(max(0.0, 1.0 - d), 2.0) * (0.55 + 0.1 * sin(uTime * 1.6));
    gl_FragColor = vec4(uColor, a);
  }
`;

const moteVert = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  uniform float uSize;
  uniform float uPixelRatio;
  attribute vec4 aSeed; // angle, radius, speed, phase
  varying float vAlpha;
  void main() {
    float h = mod(aSeed.w * uHeight + uTime * aSeed.z, uHeight);
    float t = h / uHeight;
    float ang = aSeed.x + uTime * 0.35 + h * 0.4;
    float r = aSeed.y * (1.0 - t * 0.45);
    vec3 p = vec3(cos(ang) * r, h + 0.2, sin(ang) * r);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.6 + aSeed.z * 0.5) / max(0.1, -mv.z);
    vAlpha = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.55, 1.0, t));
  }
`;
const moteFrag = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * a * vAlpha);
  }
`;

export default function Ending() {
  const heartRef = useRef<THREE.Group>(null);
  const checkTimer = useRef(0);

  const heartGeo = useMemo(makeHeartGeometry, []);

  const beamMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: beamVert,
        fragmentShader: beamFrag,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color("#ffd9e8").multiplyScalar(1.4) } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const glowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: glowVert,
        fragmentShader: glowFrag,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color("#ffb3cc").multiplyScalar(1.3) } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  const motes = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3));
    const seeds = new Float32Array(PARTICLE_COUNT * 4);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      seeds[i * 4] = Math.random() * Math.PI * 2;
      seeds[i * 4 + 1] = 0.15 + Math.sqrt(Math.random()) * 1.05;
      seeds[i * 4 + 2] = 0.35 + Math.random() * 0.75;
      seeds[i * 4 + 3] = Math.random();
    }
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    const mat = new THREE.ShaderMaterial({
      vertexShader: moteVert,
      fragmentShader: moteFrag,
      uniforms: {
        uTime: { value: 0 },
        uHeight: { value: BEAM_HEIGHT * 0.85 },
        uSize: { value: 70 },
        uPixelRatio: { value: 1 },
        uColor: { value: new THREE.Color("#fff0f6").multiplyScalar(1.8) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geo, mat };
  }, []);

  const pearl = useMemo(() => new THREE.SphereGeometry(0.09, 16, 12), []);
  const pearls = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        return [Math.cos(a) * (PLATFORM_RADIUS - 0.02), 0.2, Math.sin(a) * (PLATFORM_RADIUS - 0.02)] as [number, number, number];
      }),
    [],
  );

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    beamMat.uniforms.uTime.value = t;
    glowMat.uniforms.uTime.value = t;
    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uPixelRatio.value = state.gl.getPixelRatio();

    if (heartRef.current) {
      heartRef.current.rotation.y = t * 0.9;
      heartRef.current.position.y = 2.3 + Math.sin(t * 1.4) * 0.12;
      const beat = 1 + Math.max(0, Math.sin(t * 3.2)) ** 6 * 0.08;
      heartRef.current.scale.setScalar(beat);
    }

    // Throttled arrival check.
    checkTimer.current += dt;
    if (checkTimer.current < 0.15) return;
    checkTimer.current = 0;
    const s = useStore.getState();
    if (s.reachedEnd) return;
    const cam = state.camera.position;
    const dx = cam.x - endPosition.x;
    const dz = cam.z - endPosition.z;
    if (dx * dx + dz * dz < END_TRIGGER_RADIUS * END_TRIGGER_RADIUS) {
      s.setReachedEnd(true);
      s.setTouchForward(false);
      if (document.pointerLockElement) document.exitPointerLock?.();
      s.setPlaying(false);
    }
  });

  return (
    <group position={[endPosition.x, endPosition.y, endPosition.z]}>
      {/* Platform: cream base, pink inlay, pearl rim */}
      <mesh position={[0, 0.09, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[PLATFORM_RADIUS, PLATFORM_RADIUS + 0.12, 0.18, 64]} />
        <meshStandardMaterial color="#fff3f6" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.19, 0]}>
        <cylinderGeometry args={[PLATFORM_RADIUS - 0.3, PLATFORM_RADIUS - 0.3, 0.03, 64]} />
        <meshStandardMaterial color="#ffd1dc" roughness={0.5} emissive="#ffb3c8" emissiveIntensity={0.25} />
      </mesh>
      {pearls.map((p, i) => (
        <mesh key={i} geometry={pearl} position={p}>
          <meshStandardMaterial color="#fffaf2" roughness={0.25} metalness={0.1} />
        </mesh>
      ))}

      {/* Glowing rings */}
      <mesh position={[0, 0.215, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[PLATFORM_RADIUS - 0.3, 0.035, 12, 96]} />
        <meshBasicMaterial color={RING_GLOW} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.215, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.55, 0.02, 10, 64]} />
        <meshBasicMaterial color={INNER_GLOW} toneMapped={false} />
      </mesh>

      {/* Soft ground glow around the platform */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={glowMat} renderOrder={1}>
        <planeGeometry args={[PLATFORM_RADIUS * 3.4, PLATFORM_RADIUS * 3.4]} />
      </mesh>

      {/* Light column */}
      <mesh position={[0, 0.2 + BEAM_HEIGHT / 2, 0]} material={beamMat} renderOrder={2}>
        <cylinderGeometry args={[0.85, PLATFORM_RADIUS - 0.35, BEAM_HEIGHT, 48, 1, true]} />
      </mesh>
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} renderOrder={3} />
      <Sparkles count={28} scale={[3.2, 4, 3.2]} position={[0, 2.2, 0]} size={3} speed={0.3} color="#ffc2d6" />

      {/* Floating heart */}
      <group ref={heartRef} position={[0, 2.3, 0]}>
        <mesh geometry={heartGeo} castShadow>
          <meshStandardMaterial
            color="#ff6f91"
            emissive="#ff4d7d"
            emissiveIntensity={1.3}
            roughness={0.35}
            toneMapped={false}
          />
        </mesh>
      </group>

      <pointLight position={[0, 1.6, 0]} color="#ffb3c8" intensity={6} distance={9} decay={2} />
    </group>
  );
}
