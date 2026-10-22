"use client";

import { useMemo } from "react";
import { Vector2 } from "three";
import { useThree } from "@react-three/fiber";
import { EffectComposer, ChromaticAberration, Vignette, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import EdgeBlur from "../world/effects/EdgeBlur";

/**
 * Scene 1 post-processing: the same dreamy edge blur as the memory walk, so the
 * envelope stays crisp in the center while the floating hearts soften at the borders.
 * The composer disables renderer tone mapping, so ACES is re-applied last.
 */
export default function EnvelopeEffects() {
  const dpr = useThree((s) => s.viewport.dpr);
  const caOffset = useMemo(() => new Vector2(0.0012, 0.0008), []);

  return (
    <EffectComposer multisampling={dpr > 1.3 ? 2 : 4}>
      <EdgeBlur strength={0.05} inner={0.5} outer={1.15} samples={10} />
      <ChromaticAberration offset={caOffset} radialModulation modulationOffset={0.4} />
      <Vignette offset={0.35} darkness={0.25} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
