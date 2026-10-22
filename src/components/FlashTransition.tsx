"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

const FADE_IN_MS = 180;
const HOLD_MS = 450;
const FADE_OUT_MS = 900;

/** Full-screen white flash. Swaps to the memory walk at peak brightness. */
export default function FlashTransition() {
  const flashing = useStore((s) => s.flashing);
  const [phase, setPhase] = useState<"idle" | "in" | "hold" | "out">("idle");

  useEffect(() => {
    if (!flashing) return;
    const { setStage, endFlash } = useStore.getState();
    setPhase("in");
    const t1 = setTimeout(() => {
      setPhase("hold");
      setStage("world");
    }, FADE_IN_MS);
    const t2 = setTimeout(() => setPhase("out"), FADE_IN_MS + HOLD_MS);
    const t3 = setTimeout(() => {
      setPhase("idle");
      endFlash();
    }, FADE_IN_MS + HOLD_MS + FADE_OUT_MS);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, [flashing]);

  const opacity = phase === "in" || phase === "hold" ? 1 : 0;
  const duration = phase === "in" ? FADE_IN_MS : phase === "out" ? FADE_OUT_MS : 0;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "#fff",
        opacity,
        transition: `opacity ${duration}ms ${phase === "in" ? "ease-in" : "ease-out"}`,
        pointerEvents: phase === "idle" ? "none" : "auto",
      }}
    />
  );
}
