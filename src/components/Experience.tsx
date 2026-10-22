"use client";

import { Suspense, lazy, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { useStore } from "@/lib/store";
import EnvelopeScene from "./EnvelopeScene";
import LetterOverlay from "./LetterOverlay";
import FlashTransition from "./FlashTransition";
import LoadingScreen from "./ui/LoadingScreen";
import MobileGate from "./ui/MobileGate";

// The world is heavy; only fetch its code once we need it.
const MemoryWorld = lazy(() => import("./MemoryWorld"));

export default function Experience() {
  const stage = useStore((s) => s.stage);
  const isMobile = useStore((s) => s.isMobile);
  const mobileAcknowledged = useStore((s) => s.mobileAcknowledged);
  const setMobile = useStore((s) => s.setMobile);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    setMobile(coarse && (small || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)));
    // Debug shortcut: `?skip` jumps straight to the memory walk.
    if (new URLSearchParams(window.location.search).has("skip")) useStore.getState().setStage("world");
    // Warm the world chunk while the letter is on screen.
    import("./MemoryWorld");
  }, [setMobile]);

  return (
    <main style={{ position: "fixed", inset: 0 }}>
      {stage !== "world" ? (
        <>
          <Canvas
            shadows
            dpr={[1, 2]}
            gl={{ antialias: false, stencil: false }}
            camera={{ position: [0, 0.2, 6], fov: 40, near: 0.1, far: 100 }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Suspense fallback={null}>
              <EnvelopeScene />
            </Suspense>
          </Canvas>
          <LetterOverlay />
        </>
      ) : (
        <Suspense fallback={null}>
          <MemoryWorld />
        </Suspense>
      )}
      <LoadingScreen />
      {isMobile && !mobileAcknowledged && <MobileGate />}
      <FlashTransition />
    </main>
  );
}
