import * as THREE from "three";

/**
 * Holographic sticker shader shared by every <HoloPhoto/>.
 *
 * One mesh draws: a soft iridescent halo (outside the sticker), the thick white
 * die-cut border, and the rounded photo, all via SDF rounded rects. The plane is
 * a shared unit geometry, scaled + bent in the vertex shader, so every photo
 * (regardless of aspect) reuses the same BufferGeometry.
 *
 * Brightness note: the world's bloom threshold is ~0.8-0.9 on linear values, so
 * the resting sticker is kept just under it (PHOTO_GAIN / BORDER_GAIN). Only the
 * reveal edge and tiny glints exceed 1.0 so they bloom.
 */

export const PHOTO_GAIN = 0.84;
export const BORDER_GAIN = 0.78;

/** Unit plane, subdivided along x so it can bend. Shared by all photos. */
let sharedGeometry: THREE.PlaneGeometry | null = null;
export function getStickerGeometry(): THREE.PlaneGeometry {
  if (!sharedGeometry) {
    sharedGeometry = new THREE.PlaneGeometry(1, 1, 28, 1);
    // Real extents come from uniforms; give culling a generous bound instead.
    sharedGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.4);
    sharedGeometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(-2, -2, -0.5),
      new THREE.Vector3(2, 2, 0.5),
    );
  }
  return sharedGeometry;
}

/** Dark 1x1 stand-in until the real photo texture arrives. */
let placeholder: THREE.DataTexture | null = null;
export function getPlaceholderTexture(): THREE.DataTexture {
  if (!placeholder) {
    placeholder = new THREE.DataTexture(new Uint8Array([40, 30, 60, 255]), 1, 1);
    // Complete without a mip chain. Sampling an incomplete texture can blank
    // the framebuffer for a frame on ANGLE/Metal.
    placeholder.generateMipmaps = false;
    placeholder.minFilter = THREE.LinearFilter;
    placeholder.magFilter = THREE.LinearFilter;
    placeholder.colorSpace = THREE.SRGBColorSpace;
    placeholder.needsUpdate = true;
  }
  return placeholder;
}

const vertexShader = /* glsl */ `
  uniform vec2 uPlane;   // full plane size (sticker + halo margin)
  uniform float uBend;   // depth of the curl at the left/right edges

  varying vec2 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    vec2 p = position.xy * uPlane;
    float hw = uPlane.x * 0.5;
    float xn = p.x / hw;
    // Gentle cylindrical curl: edges bend back, away from the viewer.
    float z = -uBend * xn * xn;
    vec3 n = normalize(vec3(2.0 * uBend * xn / hw, 0.0, 1.0));

    vec4 world = modelMatrix * vec4(p, z, 1.0);
    vLocal = p;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasMap;     // 0..1 fade-in once the texture has loaded
  uniform float uReveal;     // 0 = silhouette, 1 = fully revealed
  uniform float uTime;
  uniform float uSeed;
  uniform vec2 uStickerHalf;
  uniform vec2 uPhotoHalf;
  uniform float uOuterR;
  uniform float uInnerR;
  uniform float uPhotoGain;
  uniform float uBorderGain;

  varying vec2 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // Soft cosine rainbow (thin-film-ish palette).
  vec3 rainbow(float t) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    if (!gl_FrontFacing) N = -N;
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 2.0);

    // --- shapes -----------------------------------------------------------
    float dOuter = sdRoundRect(vLocal, uStickerHalf, uOuterR);
    float dInner = sdRoundRect(vLocal, uPhotoHalf, uInnerR);
    float aa = max(fwidth(dOuter), 1e-4);
    float stickerMask = 1.0 - smoothstep(-aa, aa, dOuter);
    float photoMask = (1.0 - smoothstep(-aa, aa, dInner)) * (gl_FrontFacing ? 1.0 : 0.0);

    vec2 puv = vLocal / (uPhotoHalf * 2.0) + 0.5;
    vec2 suv = vLocal / (uStickerHalf * 2.0) + 0.5;

    // --- holographic sheen ---------------------------------------------------
    float hue = ndv * 1.7 + dot(suv, vec2(0.55, 0.35)) + V.x * 0.5 + V.y * 0.35
              + uTime * 0.03 + uSeed;
    vec3 rb = rainbow(hue);
    vec3 holo = mix(vec3(1.0), rb, 0.55);

    // Glitter: sparse cells that glint as the view angle / time changes.
    vec2 gridScale = vec2(64.0 * uStickerHalf.x / uStickerHalf.y, 64.0);
    vec2 g = suv * gridScale;
    vec2 cell = floor(g);
    float h = hash12(cell + uSeed * 17.0);
    float tw = sin(uTime * 2.1 + h * 60.0 + dot(V, vec3(11.0, 7.0, 5.0)));
    float glint = step(0.94, h) * pow(max(tw, 0.0), 14.0)
                * smoothstep(0.5, 0.0, length(fract(g) - 0.5));

    // --- revealed look -----------------------------------------------------
    vec3 tex = texture2D(uMap, puv).rgb;
    vec3 fallback = mix(vec3(0.95, 0.72, 0.85), vec3(0.72, 0.78, 0.98), puv.y);
    vec3 photo = mix(fallback, tex, uHasMap) * uPhotoGain;
    photo = mix(photo, photo * holo * 1.1, 0.10 + 0.22 * fres) + rb * 0.035 * fres;

    vec3 border = vec3(uBorderGain) * mix(vec3(1.0), holo, 0.32 + 0.5 * fres);
    border += rb * 0.07 * fres;

    vec3 revealed = mix(border, photo, photoMask);
    revealed += glint * mix(0.45, 0.12, photoMask) * holo;

    // --- silhouette (frosted, blurred, dark) -------------------------------
    // Wide taps instead of textureLod. Lod sampling needs a finished mip chain,
    // and a photo is incomplete for a frame while it uploads — that blanks the
    // whole canvas on some GPUs, which showed up as black flashes while walking.
    vec2 frostPx = vec2(0.06, 0.045);
    vec3 blurred = texture2D(uMap, puv).rgb * 0.36
                 + texture2D(uMap, puv + frostPx).rgb * 0.16
                 + texture2D(uMap, puv - frostPx).rgb * 0.16
                 + texture2D(uMap, puv + frostPx.yx * vec2(1.0, -1.0)).rgb * 0.16
                 + texture2D(uMap, puv - frostPx.yx * vec2(1.0, -1.0)).rgb * 0.16;
    float lum = dot(blurred, vec3(0.299, 0.587, 0.114));
    vec3 frostBase = vec3(0.075, 0.065, 0.14);
    float grain = hash12(floor(vLocal * 180.0)) * 0.025;
    vec3 photoFrost = frostBase + (vec3(0.16, 0.13, 0.26) * lum + blurred * 0.06) * uHasMap;
    vec3 borderFrost = frostBase * 1.6 + vec3(0.02, 0.015, 0.04) * fres;
    vec3 silhouette = mix(borderFrost, photoFrost, photoMask) + grain;
    // faint shimmering holographic outline hugging the sticker edge
    float pulse = 0.7 + 0.3 * sin(uTime * 1.4 + uSeed * 9.0);
    float rim = exp(-abs(dOuter) * 38.0) * pulse;
    silhouette += rb * rim * 0.45;

    // --- dissolve reveal ---------------------------------------------------
    float n = vnoise(vLocal * 3.0 + uSeed * 7.0) * 0.65 + vnoise(vLocal * 9.0 + uSeed * 3.0) * 0.35;
    const float band = 0.09;
    float thr = uReveal * (1.0 + 2.0 * band) - band;
    float mask = 1.0 - smoothstep(thr - 0.015, thr + 0.015, n);
    float revealActive = step(0.001, uReveal) * step(uReveal, 0.999);
    float edge = 1.0 - smoothstep(0.0, band, abs(n - thr));
    edge *= edge * revealActive;
    vec3 edgeCol = mix(vec3(1.0, 0.45, 0.8), vec3(1.0, 0.88, 0.55), n) * 3.2;

    vec3 col = mix(silhouette, revealed, mask) + edgeCol * edge * stickerMask;

    // --- halo outside the sticker -----------------------------------------
    float haloD = max(dOuter, 0.0);
    float halo = exp(-haloD * 10.0) * (1.0 - stickerMask);
    vec3 haloCol = rainbow(hue + haloD * 2.5) * mix(0.55, 0.75, uReveal);
    float haloA = halo * mix(0.10 * pulse, 0.2, uReveal);

    col = mix(haloCol, col, stickerMask);
    float alpha = stickerMask + haloA;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface StickerDims {
  /** Full plane size including the halo margin. */
  plane: THREE.Vector2;
  stickerHalf: THREE.Vector2;
  photoHalf: THREE.Vector2;
}

export const PHOTO_LONG_SIDE = 2.2;
export const BORDER = 0.13;
export const HALO_MARGIN = 0.32;

export function stickerDims(width: number, height: number): StickerDims {
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const pw = aspect >= 1 ? PHOTO_LONG_SIDE : PHOTO_LONG_SIDE * aspect;
  const ph = aspect >= 1 ? PHOTO_LONG_SIDE / aspect : PHOTO_LONG_SIDE;
  const photoHalf = new THREE.Vector2(pw / 2, ph / 2);
  const stickerHalf = photoHalf.clone().addScalar(BORDER);
  const plane = stickerHalf.clone().addScalar(HALO_MARGIN).multiplyScalar(2);
  return { plane, stickerHalf, photoHalf };
}

export function createHoloMaterial(dims: StickerDims, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uMap: { value: getPlaceholderTexture() },
      uHasMap: { value: 0 },
      uReveal: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: seed },
      uPlane: { value: dims.plane },
      uBend: { value: 0.09 },
      uStickerHalf: { value: dims.stickerHalf },
      uPhotoHalf: { value: dims.photoHalf },
      uOuterR: { value: 0.2 },
      uInnerR: { value: 0.085 },
      uPhotoGain: { value: PHOTO_GAIN },
      uBorderGain: { value: BORDER_GAIN },
    },
    transparent: true,
    // Halo pixels are see-through. Writing depth with them punches holes that
    // flash the clear color while the camera moves past a sticker.
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
}
