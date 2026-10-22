"use client";

import { useMemo } from "react";
import { Float, Sparkles } from "@react-three/drei";
import { heartGeometry } from "./shared";

const COLORS = ["#ffb3c6", "#ffc8dd", "#ff8fab", "#fcd5ce", "#ffafcc"];

/** Soft floating hearts + sparkles far behind the envelope, purely decorative. */
export default function BackgroundHearts() {
  const geo = useMemo(() => heartGeometry(1, 0.35, 0.5), []);
  const hearts = useMemo(() => {
    // Deterministic-ish scatter around (but not in front of) the envelope.
    const out: { pos: [number, number, number]; s: number; rot: number; color: string; speed: number }[] = [];
    const spots: [number, number][] = [
      [-4.2, 1.8], [4.0, 2.1], [-3.4, -1.6], [3.6, -1.4], [-5.6, 0.2], [5.4, 0.4],
      [-1.8, 2.7], [2.0, -2.6], [0.6, 3.0], [-2.4, -2.8], [6.4, 2.6], [-6.6, -2.2],
    ];
    spots.forEach(([x, y], i) => {
      out.push({
        pos: [x, y, -3 - (i % 4) * 1.1],
        s: 0.28 + ((i * 37) % 10) / 40,
        rot: ((i * 53) % 20) / 40 - 0.25,
        color: COLORS[i % COLORS.length],
        speed: 0.8 + (i % 3) * 0.35,
      });
    });
    return out;
  }, []);

  return (
    <group>
      {hearts.map((h, i) => (
        <Float key={i} speed={h.speed} rotationIntensity={0.5} floatIntensity={1.2} floatingRange={[-0.15, 0.15]}>
          <mesh geometry={geo} position={h.pos} scale={h.s} rotation={[0, 0, h.rot]}>
            <meshStandardMaterial color={h.color} roughness={0.55} />
          </mesh>
        </Float>
      ))}
      <Sparkles count={60} scale={[14, 8, 6]} position={[0, 0, -3]} size={3} speed={0.25} opacity={0.7} color="#ffffff" />
      <Sparkles count={30} scale={[12, 7, 4]} position={[0, 0, -2]} size={4} speed={0.2} opacity={0.6} color="#ff8fab" />
    </group>
  );
}
