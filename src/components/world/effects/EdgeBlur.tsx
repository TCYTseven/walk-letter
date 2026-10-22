"use client";

import { forwardRef, useEffect, useMemo } from "react";
import { EdgeBlurEffect, type EdgeBlurOptions } from "./EdgeBlurEffect";

/** React wrapper for EdgeBlurEffect, usable inside <EffectComposer>. */
const EdgeBlur = forwardRef<EdgeBlurEffect, EdgeBlurOptions>(function EdgeBlur(
  { strength = 0.06, inner = 0.45, outer = 1.15, samples = 10 },
  ref
) {
  // `samples` is a compile-time define, so changing it rebuilds the effect.
  const effect = useMemo(() => new EdgeBlurEffect({ samples }), [samples]);

  useEffect(() => {
    effect.strength = strength;
    effect.inner = inner;
    effect.outer = outer;
  }, [effect, strength, inner, outer]);

  useEffect(() => () => effect.dispose(), [effect]);

  return <primitive ref={ref} object={effect} dispose={null} />;
});

export default EdgeBlur;
