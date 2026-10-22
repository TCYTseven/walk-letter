"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { startPosition, startLookAt } from "@/lib/path";
import { PALETTE } from "./world/scenery/common";
import Scenery from "./world/Scenery";
import WorldEffects from "./world/WorldEffects";
import PhotoGallery from "./world/PhotoGallery";
import PlayerControls from "./PlayerControls";
import Ending from "./Ending";
import WorldUI from "./ui/WorldUI";

/** Scene 2: the memory walk. */
export default function MemoryWorld() {
  return (
    <>
      <Canvas
        dpr={[1, 1.75]}
        gl={{
          alpha: false,
          antialias: false,
          powerPreference: "high-performance",
          stencil: false,
        }}
        camera={{ fov: 70, near: 0.1, far: 500, position: startPosition.toArray() }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(startLookAt);
          // Opaque canvas. A transparent drawing buffer presents as black for a
          // frame whenever the browser drops it (pointer lock, resize, missed vsync).
          gl.setClearColor(PALETTE.fog, 1);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Suspense fallback={null}>
          <Scenery />
          <PhotoGallery />
          <Ending />
          <WorldEffects />
        </Suspense>
        <PlayerControls />
      </Canvas>
      <WorldUI />
    </>
  );
}
