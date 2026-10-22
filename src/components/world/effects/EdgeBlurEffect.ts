import { Uniform } from "three";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";

/**
 * Dreamy edge blur: a radial (zoom) blur toward the screen center whose
 * strength ramps up with distance from the center. The middle of the frame
 * stays perfectly sharp; the borders melt softly, like an old lens.
 */
const fragmentShader = /* glsl */ `
uniform float strength;
uniform float inner;
uniform float outer;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 d = uv - 0.5;
  // Aspect-corrected distance so the sharp zone is round, not stretched.
  float r = length(vec2(d.x * aspect, d.y)) / max(aspect, 1.0) * 2.0;
  float m = smoothstep(inner, outer, r);
  if (m < 0.002) {
    outputColor = inputColor;
    return;
  }
  vec2 stepUv = d * strength * m / float(SAMPLES);
  // Per-pixel jitter hides banding between taps.
  float jitter = hash12(gl_FragCoord.xy);
  vec3 acc = inputColor.rgb;
  float wsum = 1.0;
  for (int i = 1; i < SAMPLES; i++) {
    float fi = float(i) - 0.5 + jitter;
    float w = 1.0 - float(i) / float(SAMPLES) * 0.6;
    acc += texture2D(inputBuffer, uv - stepUv * fi).rgb * w;
    wsum += w;
  }
  outputColor = vec4(acc / wsum, inputColor.a);
}
`;

export interface EdgeBlurOptions {
  /** Blur length as a fraction of the distance to center (0.04 - 0.12 is tasteful). */
  strength?: number;
  /** Normalized radius where blurring starts (0 = center, 1 = edge midpoint). */
  inner?: number;
  /** Normalized radius where blur reaches full strength. */
  outer?: number;
  samples?: number;
}

export class EdgeBlurEffect extends Effect {
  constructor({ strength = 0.08, inner = 0.45, outer = 1.25, samples = 10 }: EdgeBlurOptions = {}) {
    super("EdgeBlurEffect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      defines: new Map([["SAMPLES", String(Math.max(2, Math.round(samples)))]]),
      uniforms: new Map<string, Uniform>([
        ["strength", new Uniform(strength)],
        ["inner", new Uniform(inner)],
        ["outer", new Uniform(outer)],
      ]),
    });
  }

  get strength(): number {
    return this.uniforms.get("strength")!.value as number;
  }
  set strength(v: number) {
    this.uniforms.get("strength")!.value = v;
  }
  get inner(): number {
    return this.uniforms.get("inner")!.value as number;
  }
  set inner(v: number) {
    this.uniforms.get("inner")!.value = v;
  }
  get outer(): number {
    return this.uniforms.get("outer")!.value as number;
  }
  set outer(v: number) {
    this.uniforms.get("outer")!.value = v;
  }
}
