"use client";

import { useMemo } from "react";
import { Vector2 } from "three";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
  ToneMapping,
} from "@react-three/postprocessing";
import { KernelSize, ToneMappingMode } from "postprocessing";
import EdgeBlur from "./effects/EdgeBlur";

/**
 * Post-processing for the memory walk:
 *   edge blur (custom) -> bloom -> edge-only chromatic aberration -> vignette -> ACES tone mapping.
 *
 * Notes:
 * - The composer renders into a HalfFloat (HDR) buffer, so the sun disc and
 *   fireflies (>1.0) survive until Bloom picks them up.
 * - Multisampling stays off, and bloom uses a kernel blur instead of
 *   half-float mipmaps. Both of those paths intermittently present a fully
 *   black frame on macOS while the camera is moving.
 * - @react-three/postprocessing v3 forces `gl.toneMapping = NoToneMapping`
 *   while the composer is mounted, so ACES is applied exactly once, here.
 * - Effects are merged automatically ("auto" mergeMode): EdgeBlur+Bloom share
 *   one pass, ChromaticAberration+Vignette+ToneMapping share another.
 */
export default function WorldEffects() {
  const caOffset = useMemo(() => new Vector2(0.0016, 0.0011), []);

  return (
    <EffectComposer multisampling={0}>
      <EdgeBlur strength={0.05} inner={0.5} outer={1.15} samples={10} />
      <Bloom
        mipmapBlur={false}
        kernelSize={KernelSize.LARGE}
        luminanceThreshold={0.85}
        luminanceSmoothing={0.2}
        intensity={0.75}
      />
      <ChromaticAberration offset={caOffset} radialModulation modulationOffset={0.35} />
      <Vignette offset={0.32} darkness={0.42} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
