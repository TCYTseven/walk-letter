"use client";

import { useFrame } from "@react-three/fiber";
import { LIGHT_DIR, PALETTE, windTime } from "./scenery/common";
import Sky from "./scenery/Sky";
import Ground from "./scenery/Ground";
import PathRibbon from "./scenery/PathRibbon";
import Trees from "./scenery/Trees";
import Flora from "./scenery/Flora";
import Clouds from "./scenery/Clouds";
import Fireflies from "./scenery/Fireflies";
import DistantHills from "./scenery/DistantHills";

/** Advances the shared wind clock used by grass, flowers and canopies. */
function WindClock() {
  useFrame((_, dt) => {
    windTime.value += Math.min(dt, 0.1);
  });
  return null;
}

/**
 * The cartoony golden-hour world around the memory path: gradient sunset sky,
 * pastel rolling meadow, cobble walkway, toon trees, flowers, swaying grass,
 * drifting clouds and fireflies.
 */
export default function Scenery() {
  const lightPos = LIGHT_DIR.clone().multiplyScalar(60);
  return (
    <group>
      <WindClock />
      <hemisphereLight args={[PALETTE.hemiSky, PALETTE.hemiGround, 1.7]} />
      <directionalLight position={lightPos.toArray()} color={PALETTE.sunLight} intensity={2.3} />

      <Sky />
      <DistantHills />
      <Clouds />
      <Ground />
      <PathRibbon />
      <Trees />
      <Flora />
      <Fireflies />
    </group>
  );
}
