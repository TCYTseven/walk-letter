"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, OrbitControls, RoundedBox } from "@react-three/drei";
import { useStore } from "@/lib/store";
import WaxSeal from "./envelope/WaxSeal";
import BackgroundHearts from "./envelope/BackgroundHearts";
import EnvelopeEffects from "./envelope/EnvelopeEffects";
import {
  ENVELOPE_OPENED_EVENT,
  ENV_D,
  ENV_H,
  ENV_W,
  FLAP_DEPTH,
  LETTER_ASPECT,
  easeInOutCubic,
  easeOutBack,
  letterCardSize,
  letterTexture,
  paperTexture,
  seg,
  triangleGeometry,
} from "./envelope/shared";

/* ------------------------------------------------------------------ */
/* Timeline (seconds after the click)                                  */
/* ------------------------------------------------------------------ */
const T_SEAL = 0; //        seal squish
const T_FLAP = 0.18; //     flap opens
const D_FLAP = 0.9;
const T_SLIDE = T_FLAP + D_FLAP + 0.05; // letter slides up out of the pocket
const D_SLIDE = 1.0;
const T_FLY = T_SLIDE + D_SLIDE + 0.1; // letter flies to the camera, envelope drifts away
const D_FLY = 1.35;
const T_DONE = T_FLY + D_FLY;

/** Letter size while folded inside the envelope. */
const LETTER_IN_W = ENV_W * 0.88;
const LETTER_IN_H = ENV_H * 0.84;
const LETTER_THICK = 0.012;
const LETTER_Y_IN = -0.06;
const LETTER_Y_OUT = 1.0;
/** Distance in front of the camera where the letter ends up. */
const READ_DIST = 2.2;

const FLAP_Z_CLOSED = ENV_D / 2 + 0.006;
const FLAP_Z_OPEN = -ENV_D / 2 + 0.014;

export default function EnvelopeScene() {
  return (
    <>
      <color attach="background" args={["#cfe6ff"]} />
      <hemisphereLight args={["#ffffff", "#ffd6e4", 1.35]} />
      <directionalLight position={[2.5, 4, 5]} intensity={1.6} color="#fff6ee" />
      <directionalLight position={[-4, 1, 2]} intensity={0.45} color="#dbe9ff" />
      <ambientLight intensity={0.25} />

      <BackgroundHearts />
      <Envelope />

      <ContactShadows
        position={[0, -1.35, 0]}
        scale={7}
        blur={2.6}
        far={2.2}
        opacity={0.32}
        resolution={512}
        color="#5a6f9a"
      />

      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.6}
        minDistance={4}
        maxDistance={8}
        minAzimuthAngle={-0.6}
        maxAzimuthAngle={0.6}
        minPolarAngle={Math.PI / 2 - 0.45}
        maxPolarAngle={Math.PI / 2 + 0.3}
        // Left click is reserved for opening the envelope; only right-drag orbits.
        mouseButtons={{ RIGHT: THREE.MOUSE.ROTATE }}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      />

      <EnvelopeEffects />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The envelope + letter, with the whole opening timeline              */
/* ------------------------------------------------------------------ */
function Envelope() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;

  const envRef = useRef<THREE.Group>(null);
  const flapRef = useRef<THREE.Group>(null);
  const sealRef = useRef<THREE.Group>(null);
  const letterRef = useRef<THREE.Mesh>(null);

  const [hovered, setHovered] = useState(false);
  const openedAt = useRef<number | null>(null);
  const opened = useRef(false);
  const arrived = useRef(false);
  const envFading = useRef(false);
  // Snapshot of the letter's world transform when it starts flying.
  const flyFrom = useRef<{ pos: THREE.Vector3; quat: THREE.Quaternion; sx: number; sy: number } | null>(null);

  /* ---------- materials (kept in memo so we can fade them) ---------- */
  const mats = useMemo(() => {
    const grain = paperTexture();
    const paper = new THREE.MeshStandardMaterial({ color: "#ffffff", map: grain, roughness: 0.92 });
    const paperShade = new THREE.MeshStandardMaterial({ color: "#f6f0e8", map: grain, roughness: 0.92 });
    const paperShade2 = new THREE.MeshStandardMaterial({ color: "#f1eadf", map: grain, roughness: 0.92 });
    const flapOuter = new THREE.MeshStandardMaterial({ color: "#fffdf9", map: grain, roughness: 0.9 });
    const liner = new THREE.MeshStandardMaterial({ color: "#ffd3df", map: grain, roughness: 0.85, side: THREE.BackSide });
    const inside = new THREE.MeshStandardMaterial({ color: "#ffc9d6", map: grain, roughness: 0.9 });
    const letter = new THREE.MeshStandardMaterial({ color: "#ffffff", map: letterTexture(), roughness: 0.95 });
    return { paper, paperShade, paperShade2, flapOuter, liner, inside, letter, grain };
  }, []);
  const fadeMats = useMemo(
    () => [mats.paper, mats.paperShade, mats.paperShade2, mats.flapOuter, mats.liner, mats.inside],
    [mats],
  );

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
      document.body.style.cursor = "";
    },
    [mats],
  );

  /* ---------- geometry ---------- */
  const geos = useMemo(() => {
    const w = ENV_W / 2;
    const h = ENV_H / 2;
    // Front pocket = left + right side flaps + bottom flap (leaves a V opening at the top).
    const left = triangleGeometry([-w, h], [-w, -h], [0.06, -0.02]);
    const right = triangleGeometry([w, -h], [w, h], [-0.06, -0.02]);
    const bottom = triangleGeometry([-w, -h], [w, -h], [0, 0.14]);
    // Top flap, hinged at y=0 (pivot), tip pointing down with a soft rounded point.
    const fs = new THREE.Shape();
    fs.moveTo(-w, 0);
    fs.lineTo(w, 0);
    fs.lineTo(0.16, -FLAP_DEPTH + 0.08);
    fs.quadraticCurveTo(0, -FLAP_DEPTH - 0.02, -0.16, -FLAP_DEPTH + 0.08);
    fs.closePath();
    const flap = new THREE.ShapeGeometry(fs, 12);
    const letter = new THREE.BoxGeometry(1, 1, 1);
    return { left, right, bottom, flap, letter };
  }, []);
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);

  /* ---------- interaction ---------- */
  const open = (e: ThreeEvent<MouseEvent>) => {
    // Only a left click or a tap opens the envelope.
    if (opened.current || (e.nativeEvent && e.nativeEvent.button !== 0)) return;
    e.stopPropagation();
    opened.current = true;
    openedAt.current = null; // set on next frame from the r3f clock
    setHovered(false);
    document.body.style.cursor = "";
    if (controls) controls.enabled = false;
    window.dispatchEvent(new CustomEvent(ENVELOPE_OPENED_EVENT));
  };

  useEffect(() => {
    if (!opened.current) document.body.style.cursor = hovered ? "pointer" : "";
  }, [hovered]);

  /* ---------- per-frame timeline ---------- */
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const tmpS = useMemo(() => new THREE.Vector3(), []);
  const camDir = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const env = envRef.current;
    const flap = flapRef.current;
    const seal = sealRef.current;
    const letter = letterRef.current;
    if (!env || !flap || !seal || !letter) return;
    const time = state.clock.elapsedTime;

    if (opened.current && openedAt.current === null) openedAt.current = time;
    const t = openedAt.current === null ? -1 : time - openedAt.current;

    /* Idle float (keeps gently going while it opens). */
    env.position.y = Math.sin(time * 1.2) * 0.06;
    env.rotation.z = Math.sin(time * 0.8) * 0.018;
    env.rotation.y = Math.sin(time * 0.55) * 0.06;
    env.rotation.x = Math.sin(time * 0.7) * 0.025;

    /* Hover scale. */
    const targetScale = !opened.current && hovered ? 1.06 : 1;
    const s = THREE.MathUtils.damp(env.scale.x, targetScale, 8, dt);
    env.scale.setScalar(s);

    /* Seal squish on click. */
    if (t >= 0) {
      const p = seg(t, T_SEAL, 0.28);
      const squish = Math.sin(p * Math.PI) * 0.18;
      seal.scale.set(1 + squish, 1 + squish, 1 - squish);
    }

    /* Flap opens: swings out toward the viewer, then up and slightly back. */
    const pf = t >= 0 ? easeInOutCubic(seg(t, T_FLAP, D_FLAP)) : 0;
    flap.rotation.x = -Math.PI * 1.06 * pf;
    // Once past vertical, slide the hinge behind the letter so the letter can emerge in front of it.
    flap.position.z = THREE.MathUtils.lerp(FLAP_Z_CLOSED, FLAP_Z_OPEN, THREE.MathUtils.smoothstep(pf, 0.45, 0.8));

    /* Envelope drifts down & fades while the letter flies. */
    const pAway = t >= 0 ? easeInOutCubic(seg(t, T_FLY, D_FLY * 0.9)) : 0;
    if (pAway > 0) {
      if (!envFading.current) {
        envFading.current = true;
        fadeMats.forEach((m) => {
          m.transparent = true;
          m.needsUpdate = true;
        });
      }
      env.position.y -= pAway * 2.4;
      env.position.z = -pAway * 1.2;
      env.rotation.x += pAway * 0.5;
      fadeMats.forEach((m) => (m.opacity = 1 - pAway));
      env.visible = pAway < 0.999;
    }
    env.updateMatrixWorld();

    /* Letter: inside / sliding -> follows the envelope; then flies to the camera. */
    const pSlide = t >= 0 ? easeInOutCubic(seg(t, T_SLIDE, D_SLIDE)) : 0;
    const pFly = t >= 0 ? easeInOutCubic(seg(t, T_FLY, D_FLY)) : 0;

    if (pFly <= 0) {
      tmpV.set(0, THREE.MathUtils.lerp(LETTER_Y_IN, LETTER_Y_OUT, pSlide), 0);
      env.localToWorld(tmpV);
      env.getWorldQuaternion(tmpQ);
      letter.position.copy(tmpV);
      letter.quaternion.copy(tmpQ);
      letter.scale.set(LETTER_IN_W * s, LETTER_IN_H * s, LETTER_THICK);
    } else {
      if (!flyFrom.current) {
        flyFrom.current = {
          pos: letter.position.clone(),
          quat: letter.quaternion.clone(),
          sx: letter.scale.x,
          sy: letter.scale.y,
        };
      }
      const from = flyFrom.current;
      // Target: centred in front of the camera, sized to match the DOM letter card exactly.
      camera.getWorldDirection(camDir);
      const target = tmpV.copy(camera.position).addScaledVector(camDir, READ_DIST);
      const visibleH = 2 * READ_DIST * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const card = letterCardSize(size.width, size.height);
      const targetH = (card.h / size.height) * visibleH;
      const targetW = targetH * LETTER_ASPECT;

      // Arc slightly upward mid-flight for a softer, "floating" feel.
      letter.position.lerpVectors(from.pos, target, pFly);
      letter.position.y += Math.sin(pFly * Math.PI) * 0.25;
      letter.quaternion.slerpQuaternions(from.quat, camera.quaternion, pFly);
      // A tiny playful tilt that settles to zero.
      tmpQ.setFromAxisAngle(tmpS.set(0, 0, 1), Math.sin(pFly * Math.PI) * 0.12);
      letter.quaternion.multiply(tmpQ);
      // Unfold: the scale morphs from the folded landscape sheet to the tall readable page.
      const pUnfold = easeOutBack(seg(t, T_FLY + D_FLY * 0.25, D_FLY * 0.75));
      letter.scale.set(
        THREE.MathUtils.lerp(from.sx, targetW, pUnfold),
        THREE.MathUtils.lerp(from.sy, targetH, pUnfold),
        LETTER_THICK,
      );
    }

    if (t >= T_DONE && !arrived.current) {
      arrived.current = true;
      useStore.getState().setStage("letter");
    }
  });

  const w = ENV_W / 2;
  const h = ENV_H / 2;

  return (
    <>
      <group
        ref={envRef}
        onClick={open}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (!opened.current) setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        {/* Back panel + pink liner visible through the V opening */}
        <RoundedBox args={[ENV_W, ENV_H, 0.02]} radius={0.008} smoothness={2} position={[0, 0, -ENV_D / 2]} material={mats.paperShade} />
        <mesh position={[0, 0, -ENV_D / 2 + 0.0105]} material={mats.inside}>
          <planeGeometry args={[ENV_W * 0.985, ENV_H * 0.985]} />
        </mesh>

        {/* Side walls so the edges look like folded paper */}
        <mesh position={[-w, 0, 0]} material={mats.paperShade}>
          <boxGeometry args={[0.012, ENV_H, ENV_D]} />
        </mesh>
        <mesh position={[w, 0, 0]} material={mats.paperShade}>
          <boxGeometry args={[0.012, ENV_H, ENV_D]} />
        </mesh>
        <mesh position={[0, -h, 0]} material={mats.paperShade}>
          <boxGeometry args={[ENV_W, 0.012, ENV_D]} />
        </mesh>

        {/* Front pocket (sits in front of the letter so the letter appears to come out of it) */}
        <mesh geometry={geos.left} position={[0, 0, ENV_D / 2]} material={mats.paperShade} />
        <mesh geometry={geos.right} position={[0, 0, ENV_D / 2 + 0.0005]} material={mats.paperShade} />
        <mesh geometry={geos.bottom} position={[0, 0, ENV_D / 2 + 0.002]} material={mats.paper} />

        {/* Hinged top flap; pivot sits on the top edge */}
        <group ref={flapRef} position={[0, h, FLAP_Z_CLOSED]}>
          <mesh geometry={geos.flap} position={[0, 0, 0.001]} material={mats.flapOuter} />
          <mesh geometry={geos.flap} material={mats.liner} />
          {/* Wax seal rides on the flap tip */}
          <group ref={sealRef} position={[0, -FLAP_DEPTH + 0.14, 0.004]}>
            <WaxSeal />
          </group>
        </group>
      </group>

      {/* The letter lives at the top level; its world transform is driven every frame. */}
      <mesh ref={letterRef} geometry={geos.letter} material={mats.letter} />
    </>
  );
}
