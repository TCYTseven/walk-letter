"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import type { Photo } from "@/lib/types";
import type { PhotoPlacement } from "@/lib/path";
import { formatPhotoDate } from "@/lib/photos";
import { useStore } from "@/lib/store";
import { createHoloMaterial, getStickerGeometry, stickerDims } from "./holo/holoShader";
import SparkleBurst from "./holo/SparkleBurst";

/** Start loading the texture when the camera gets this close. */
const LOAD_DISTANCE = 35;
/** Reveal when within this distance AND looking roughly at the photo. */
const REVEAL_DISTANCE = 7;
const REVEAL_DOT = 0.82;
const REVEAL_DURATION = 1.1;
/** How often (s) the cheap distance checks run. */
const CHECK_INTERVAL = 0.2;

const LABEL_FONT = "/fonts/fredoka-600.woff";
const PILL_W = 1.3;
const PILL_H = 0.32;

/** Indices already revealed: survives remounts so a photo never re-hides. */
const revealedIndices = new Set<number>();

const textureLoader = new THREE.TextureLoader();

// Scratch objects (never allocate in useFrame).
const _camDir = new THREE.Vector3();
const _toPhoto = new THREE.Vector3();

let pillGeometry: THREE.ShapeGeometry | null = null;
function getPillGeometry(): THREE.ShapeGeometry {
  if (pillGeometry) return pillGeometry;
  const w = PILL_W;
  const h = PILL_H;
  const r = h / 2;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, h / 2);
  s.absarc(-w / 2 + r, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  pillGeometry = new THREE.ShapeGeometry(s, 16);
  return pillGeometry;
}

// Shared label materials (linear values kept below the bloom threshold).
let pillMaterial: THREE.MeshBasicMaterial | null = null;
let pillShadowMaterial: THREE.MeshBasicMaterial | null = null;
function getPillMaterials() {
  if (!pillMaterial || !pillShadowMaterial) {
    pillMaterial = new THREE.MeshBasicMaterial({ color: "#f2d3e6" });
    pillShadowMaterial = new THREE.MeshBasicMaterial({
      color: "#b98ad0",
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
  }
  return { pill: pillMaterial, shadow: pillShadowMaterial };
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
/** Springy overshoot for the label pop-in. */
function easeOutBack(t: number) {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

interface Props {
  photo: Photo;
  placement: PhotoPlacement;
}

export default function HoloPhoto({ photo, placement }: Props) {
  const gl = useThree((s) => s.gl);
  const groupRef = useRef<THREE.Group>(null);
  const labelRef = useRef<THREE.Group>(null);

  const dims = useMemo(() => stickerDims(photo.width, photo.height), [photo.width, photo.height]);

  // Deterministic per-photo variation.
  const seed = useMemo(() => {
    const x = Math.sin(placement.index * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }, [placement.index]);
  const phase = seed * Math.PI * 2;
  const baseTilt = (seed - 0.5) * 0.09 + (placement.side === -1 ? 0.015 : -0.015);

  const material = useMemo(() => createHoloMaterial(dims, seed * 10), [dims, seed]);
  const geometry = getStickerGeometry();

  const state = useRef({
    checkTimer: Math.random() * CHECK_INTERVAL,
    loadRequested: false,
    loaded: false,
    texture: null as THREE.Texture | null,
    revealStart: revealedIndices.has(placement.index) ? -Infinity : -1,
    revealed: revealedIndices.has(placement.index),
    hasMap: 0,
    disposed: false,
  });

  const [burst, setBurst] = useState(false);
  const dateLabel = useMemo(() => formatPhotoDate(photo.date), [photo.date]);

  // Start already-revealed photos (remount) fully visible.
  useEffect(() => {
    if (state.current.revealed) material.uniforms.uReveal.value = 1;
  }, [material]);

  // Dispose GPU resources on unmount.
  useEffect(() => {
    const s = state.current;
    s.disposed = false; // StrictMode re-runs effects after a fake unmount
    return () => {
      s.disposed = true;
      material.dispose();
      s.texture?.dispose();
      s.texture = null;
    };
  }, [material]);

  const startLoad = () => {
    const s = state.current;
    s.loadRequested = true;
    textureLoader.load(
      photo.src,
      (tex) => {
        // Component may have unmounted while loading.
        if (!s.disposed) {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
          tex.needsUpdate = true;
          // Upload the mip chain before the mesh samples it. Binding a texture
          // that is still incomplete blanks the frame on some GPUs.
          gl.initTexture(tex);
          s.texture = tex;
          material.uniforms.uMap.value = tex;
        } else {
          tex.dispose();
        }
        s.loaded = true;
      },
      undefined,
      () => {
        // On error keep the pastel fallback so the reveal still works.
        s.loaded = true;
      },
    );
  };

  useFrame(({ camera, clock }, delta) => {
    const s = state.current;
    const g = groupRef.current;
    if (!g) return;
    const t = clock.elapsedTime;
    const u = material.uniforms;
    u.uTime.value = t;

    // Gentle float + sway.
    g.position.set(
      placement.position.x,
      placement.position.y + Math.sin(t * 0.8 + phase) * 0.07,
      placement.position.z,
    );
    g.rotation.set(
      -0.04 + Math.sin(t * 0.6 + phase * 1.3) * 0.025,
      placement.rotationY + Math.sin(t * 0.45 + phase) * 0.06,
      baseTilt + Math.sin(t * 0.7 + phase * 0.7) * 0.02,
    );

    // Fade texture in once loaded.
    if (s.texture && s.hasMap < 1) {
      s.hasMap = Math.min(1, s.hasMap + delta * 2);
      u.uHasMap.value = s.hasMap;
    }

    // Throttled proximity checks.
    s.checkTimer -= delta;
    if (s.checkTimer <= 0 && (!s.loadRequested || !s.revealed)) {
      s.checkTimer = CHECK_INTERVAL;
      const dist = camera.position.distanceTo(placement.position);
      if (!s.loadRequested && dist < LOAD_DISTANCE) startLoad();
      if (!s.revealed && s.loaded && dist < REVEAL_DISTANCE) {
        camera.getWorldDirection(_camDir);
        _toPhoto.subVectors(placement.position, camera.position).normalize();
        if (_camDir.dot(_toPhoto) > REVEAL_DOT) {
          s.revealed = true;
          s.revealStart = t;
          revealedIndices.add(placement.index);
          useStore.getState().markRevealed();
          setBurst(true);
        }
      }
    }

    // Reveal animation.
    if (s.revealed) {
      const p = s.revealStart === -Infinity ? 1 : Math.min(1, (t - s.revealStart) / REVEAL_DURATION);
      if (u.uReveal.value < 1) u.uReveal.value = easeInOutCubic(p);
      const label = labelRef.current;
      if (label) {
        // Label pops in during the second half of the reveal.
        const lp = s.revealStart === -Infinity ? 1 : THREE.MathUtils.clamp((t - s.revealStart - 0.55) / 0.6, 0, 1);
        const sc = lp >= 1 ? 1 : Math.max(0.0001, easeOutBack(lp));
        label.visible = lp > 0;
        label.scale.setScalar(sc);
        label.position.y = -dims.stickerHalf.y - 0.3 + Math.sin(t * 1.6 + phase) * 0.015;
      }
    }
  });

  const pill = getPillMaterials();

  return (
    <group ref={groupRef} position={placement.position}>
      <mesh geometry={geometry} material={material} renderOrder={1} />

      {/* Cute date label (hidden until revealed). */}
      <group ref={labelRef} position={[0, -dims.stickerHalf.y - 0.3, 0.02]} visible={false} rotation={[-0.22, 0, 0]}>
        <mesh geometry={getPillGeometry()} material={pill.shadow} position={[0.025, -0.03, -0.012]} />
        <mesh geometry={getPillGeometry()} material={pill.pill} />
        <Suspense fallback={null}>
          <Text
            font={LABEL_FONT}
            fontSize={0.155}
            color="#8a4f86"
            anchorX="center"
            anchorY="middle"
            position={[0, 0.005, 0.01]}
            letterSpacing={0.02}
          >
            {dateLabel}
          </Text>
        </Suspense>
      </group>

      {burst && (
        <SparkleBurst
          halfWidth={dims.stickerHalf.x}
          halfHeight={dims.stickerHalf.y}
          onDone={() => setBurst(false)}
        />
      )}
    </group>
  );
}
