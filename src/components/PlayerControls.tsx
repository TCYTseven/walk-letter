"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import {
  CORRIDOR_RADIUS,
  MAX_HEIGHT,
  MIN_HEIGHT,
  START_U,
  nearestOnPath,
  pointAt,
  startLookAt,
  startPosition,
  tangentAt,
} from "@/lib/path";

/**
 * Spectator-style floaty flying for the memory walk.
 *
 * Desktop: pointer lock + mouse look, WASD / arrows move along the look
 * direction, Space / Shift float up / down.
 * Touch:   one-finger drag to look, the ♡ button (store.touchForward) to move.
 *
 * Renders nothing; drives the default camera directly.
 */

// ---- feel tuning ---------------------------------------------------------
const SPEED = 4.5; // units / second
const ACCEL = 6.5; // how fast velocity reaches the wished velocity
const GLIDE = 2.8; // softer damping when keys are released -> floaty stop
const MOUSE_SENS = 0.0021; // radians per pixel (pointer lock)
const DRAG_SENS = 0.0055; // radians per pixel (touch / drag fallback)
const LOOK_SMOOTH = 24; // slight smoothing on look
const PITCH_LIMIT = THREE.MathUtils.degToRad(85);
const ROLL_PER_SPEED = 0.009; // tiny bank when strafing
const ROLL_SMOOTH = 4;
const MAX_MOUSE_SPIKE = 250; // ignore browser movementX/Y glitches

// ---- static path geometry used by the clamps -----------------------------
const START_POINT = pointAt(START_U).setY(0);
const START_TANGENT = tangentAt(START_U).setY(0).normalize();
const END_POINT = pointAt(1).setY(0);
const END_TANGENT = tangentAt(1).setY(0).normalize();

/** Exponential smoothing factor, frame-rate independent. */
const damp = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt);

export default function PlayerControls() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  // Look state: target angles (raw input) and smoothed angles (applied).
  const look = useRef({ yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, roll: 0 });
  const velocity = useRef(new THREE.Vector3());
  const keys = useRef(new Set<string>());
  const lastU = useRef(START_U);

  // Scratch vectors (no per-frame allocation).
  const tmp = useRef({
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    wish: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    rel: new THREE.Vector3(),
  });

  // ---- initial placement & orientation -----------------------------------
  useEffect(() => {
    camera.position.copy(startPosition);
    const dir = startLookAt.clone().sub(startPosition).normalize();
    const yaw = Math.atan2(-dir.x, -dir.z);
    const pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    Object.assign(look.current, { yaw, pitch, tYaw: yaw, tPitch: pitch, roll: 0 });
    camera.rotation.order = "YXZ";
    camera.rotation.set(pitch, yaw, 0);
    velocity.current.set(0, 0, 0);
    lastU.current = START_U;
  }, [camera]);

  // ---- input wiring -------------------------------------------------------
  useEffect(() => {
    const el = gl.domElement;
    const store = useStore.getState;
    const isTouchMode = () => store().isMobile && store().mobileAcknowledged;
    const isLocked = () => document.pointerLockElement === el;

    const addLook = (dx: number, dy: number, sens: number) => {
      const l = look.current;
      l.tYaw -= dx * sens;
      l.tPitch = THREE.MathUtils.clamp(l.tPitch - dy * sens, -PITCH_LIMIT, PITCH_LIMIT);
    };

    // Pointer lock request (called by WorldUI from a click handler).
    const requestLock = () => {
      if (isTouchMode()) {
        store().setPlaying(true);
        return;
      }
      if (typeof el.requestPointerLock !== "function") {
        // No pointer lock support: fall back to drag-to-look.
        store().setPlaying(true);
        return;
      }
      try {
        const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
        // Rejections happen e.g. when re-locking too soon after ESC; the popup just stays.
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
        /* ignore */
      }
    };
    store().setRequestLock(requestLock);

    const onLockChange = () => {
      if (isTouchMode()) return;
      const locked = isLocked();
      store().setPlaying(locked);
      if (!locked) keys.current.clear();
    };
    const onLockError = () => {
      /* stay on the instructions popup */
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked()) return;
      if (Math.abs(e.movementX) > MAX_MOUSE_SPIKE || Math.abs(e.movementY) > MAX_MOUSE_SPIKE) return;
      addLook(e.movementX, e.movementY, MOUSE_SENS);
    };

    // Drag-to-look: touch mode, or desktop fallback when pointer lock is unavailable.
    let dragId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    const dragAllowed = () => store().playing && !isLocked() && !store().reachedEnd;
    const onPointerDown = (e: PointerEvent) => {
      if (dragId !== null || !dragAllowed()) return;
      dragId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== dragId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (dragAllowed()) addLook(dx, dy, DRAG_SENS);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId === dragId) dragId = null;
    };

    const MOVE_CODES = new Set([
      "KeyW", "KeyA", "KeyS", "KeyD",
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "Space", "ShiftLeft", "ShiftRight",
    ]);
    const onKeyDown = (e: KeyboardEvent) => {
      if (!MOVE_CODES.has(e.code)) {
        // Escape in drag-fallback mode pauses (pointer lock handles it otherwise).
        if (e.code === "Escape" && store().playing && !isLocked() && !isTouchMode()) {
          store().setPlaying(false);
        }
        return;
      }
      if (store().playing) e.preventDefault();
      keys.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onBlur = () => keys.current.clear();

    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("pointerlockerror", onLockError);
    document.addEventListener("mousemove", onMouseMove);
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("pointerlockerror", onLockError);
      document.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (isLocked()) document.exitPointerLock?.();
      store().setRequestLock(() => {});
      store().setPlaying(false);
    };
  }, [gl]);

  // ---- per-frame integration ---------------------------------------------
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = useStore.getState();
    const l = look.current;
    const v = velocity.current;
    const { forward, right, wish, offset, rel } = tmp.current;

    // Smooth look.
    const lk = damp(LOOK_SMOOTH, dt);
    l.yaw += (l.tYaw - l.yaw) * lk;
    l.pitch += (l.tPitch - l.pitch) * lk;

    const cp = Math.cos(l.pitch);
    forward.set(-Math.sin(l.yaw) * cp, Math.sin(l.pitch), -Math.cos(l.yaw) * cp);
    right.set(Math.cos(l.yaw), 0, -Math.sin(l.yaw));

    // Wished direction from input.
    wish.set(0, 0, 0);
    const touchMode = s.isMobile && s.mobileAcknowledged;
    if (s.playing && !s.reachedEnd) {
      const k = keys.current;
      let f = 0;
      let r = 0;
      let u = 0;
      if (k.has("KeyW") || k.has("ArrowUp")) f += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) f -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) r += 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) r -= 1;
      if (k.has("Space")) u += 1;
      if (k.has("ShiftLeft") || k.has("ShiftRight")) u -= 1;
      if (touchMode && s.touchForward) f = 1;
      wish.addScaledVector(forward, f).addScaledVector(right, r);
      wish.y += u;
      if (wish.lengthSq() > 1e-6) wish.normalize().multiplyScalar(SPEED);
    }

    // Velocity eases toward the wish: snappier when pushing, gliding when released.
    const moving = wish.lengthSq() > 1e-6;
    v.lerp(wish, damp(moving ? ACCEL : GLIDE, dt));
    if (!moving && v.lengthSq() < 1e-5) v.set(0, 0, 0);

    const pos = camera.position;
    pos.addScaledVector(v, dt);

    // ---- clamps ----
    // 1. Corridor around the path (horizontal), sliding along the wall.
    const near = nearestOnPath(pos, lastU.current);
    lastU.current = near.u;
    if (near.lateral > CORRIDOR_RADIUS) {
      offset.set(pos.x - near.point.x, 0, pos.z - near.point.z).divideScalar(near.lateral);
      pos.x = near.point.x + offset.x * CORRIDOR_RADIUS;
      pos.z = near.point.z + offset.z * CORRIDOR_RADIUS;
      const outward = v.x * offset.x + v.z * offset.z;
      if (outward > 0) {
        v.x -= offset.x * outward;
        v.z -= offset.z * outward;
      }
    }

    // 2. Can't go backward past the start.
    if (near.u < 0.06) clampPlane(pos, v, START_POINT, START_TANGENT, -1, rel);
    // 3. Can't fly past the end.
    if (near.u > 0.94) clampPlane(pos, v, END_POINT, END_TANGENT, 1, rel);

    // 4. Height.
    if (pos.y < MIN_HEIGHT) {
      pos.y = MIN_HEIGHT;
      if (v.y < 0) v.y = 0;
    } else if (pos.y > MAX_HEIGHT) {
      pos.y = MAX_HEIGHT;
      if (v.y > 0) v.y = 0;
    }

    // Tiny bank on strafe for floatiness.
    const strafe = v.x * right.x + v.z * right.z;
    l.roll += (-strafe * ROLL_PER_SPEED - l.roll) * damp(ROLL_SMOOTH, dt);

    camera.rotation.order = "YXZ";
    camera.rotation.set(l.pitch, l.yaw, l.roll);
  });

  return null;
}

/**
 * Keep `pos` on the allowed side of a vertical plane through `origin` with
 * horizontal normal `tangent`. side = -1 forbids being behind (start),
 * side = +1 forbids being ahead (end). Kills the offending velocity component.
 */
function clampPlane(
  pos: THREE.Vector3,
  v: THREE.Vector3,
  origin: THREE.Vector3,
  tangent: THREE.Vector3,
  side: -1 | 1,
  rel: THREE.Vector3,
) {
  rel.set(pos.x - origin.x, 0, pos.z - origin.z);
  const d = rel.x * tangent.x + rel.z * tangent.z;
  if (d * side > 0) {
    pos.x -= tangent.x * d;
    pos.z -= tangent.z * d;
    const vt = v.x * tangent.x + v.z * tangent.z;
    if (vt * side > 0) {
      v.x -= tangent.x * vt;
      v.z -= tangent.z * vt;
    }
  }
}
