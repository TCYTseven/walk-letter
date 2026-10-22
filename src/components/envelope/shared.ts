import * as THREE from "three";

/** Fired on window by EnvelopeScene the moment the envelope is clicked/tapped. */
export const ENVELOPE_OPENED_EVENT = "envelope-opened";

/* ---------------- Envelope dimensions (world units) ---------------- */
export const ENV_W = 2.4;
export const ENV_H = 1.6;
export const ENV_D = 0.07;
/** How far the top flap reaches down the front. */
export const FLAP_DEPTH = ENV_H * 0.6;

/* ---------------- Letter sizing (shared by 3D letter and DOM card) ---------------- */
/** Width / height of the unfolded letter. */
export const LETTER_ASPECT = 0.72;

/** Pixel size of the readable letter card for a given viewport. */
export function letterCardSize(vw: number, vh: number) {
  const h = Math.min(vh * 0.86, (vw * 0.92) / LETTER_ASPECT, 880);
  return { w: h * LETTER_ASPECT, h };
}

/* ---------------- Easing ---------------- */
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
/** Progress 0..1 of a segment [start, start+dur] at time t. */
export const seg = (t: number, start: number, dur: number) => clamp01((t - start) / dur);

/* ---------------- Shapes ---------------- */

/** Classic bezier heart, centred on the origin, point facing down, ~1 unit wide. */
export function heartShape(): THREE.Shape {
  const s = new THREE.Shape();
  // Classic three.js heart (point at +y), flipped below via negated y.
  const p = (x: number, y: number): [number, number] => [(x - 5) / 22, -(y - 9.5) / 22];
  s.moveTo(...p(5, 5));
  s.bezierCurveTo(...p(5, 5), ...p(4, 0), ...p(0, 0));
  s.bezierCurveTo(...p(-6, 0), ...p(-6, 7), ...p(-6, 7));
  s.bezierCurveTo(...p(-6, 11), ...p(-3, 15.4), ...p(5, 19));
  s.bezierCurveTo(...p(12, 15.4), ...p(16, 11), ...p(16, 7));
  s.bezierCurveTo(...p(16, 7), ...p(16, 0), ...p(10, 0));
  s.bezierCurveTo(...p(7, 0), ...p(5, 5), ...p(5, 5));
  return s;
}

/** Extruded, bevelled heart geometry of roughly `size` width, centred. */
export function heartGeometry(size: number, depth: number, bevel = 0.25) {
  const g = new THREE.ExtrudeGeometry(heartShape(), {
    depth: depth / size,
    bevelEnabled: true,
    bevelThickness: bevel * (depth / size),
    bevelSize: 0.06,
    bevelSegments: 5,
    curveSegments: 24,
  });
  g.center();
  g.scale(size, size, size);
  return g;
}

export function triangleGeometry(a: [number, number], b: [number, number], c: [number, number]) {
  const s = new THREE.Shape();
  s.moveTo(...a);
  s.lineTo(...b);
  s.lineTo(...c);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

/* ---------------- Canvas textures ---------------- */

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

/** Soft paper grain, tileable-ish; used as a colour map on white paper. */
export function paperTexture(base = "#fbf8f3", grain = 14) {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const img = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * grain;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  // a few faint fibres
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = "#a89a88";
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1.5, 1.5);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Cream letter face: grain + an inset pink border + a tiny heart, mirroring the DOM card. */
export function letterTexture() {
  const W = 720;
  const H = Math.round(W / LETTER_ASPECT);
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = "#fffaf2";
  ctx.fillRect(0, 0, W, H);
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 8;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  // soft edge vignette
  const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, "rgba(255,240,220,0)");
  g.addColorStop(1, "rgba(230,205,175,0.25)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // inset border
  ctx.strokeStyle = "rgba(255,143,171,0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, W - 44, H - 44);
  // faint "handwriting" scribbles so the paper reads as a letter while in flight
  ctx.strokeStyle = "rgba(59,47,74,0.28)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  let y = 90;
  const rows = [0.35, 0.9, 0.85, 0.92, 0.6, 0, 0.9, 0.88, 0.93, 0.86, 0.9, 0.7, 0, 0.9, 0.84, 0.5, 0, 0.2, 0.18];
  for (const r of rows) {
    if (r > 0) {
      ctx.beginPath();
      const x0 = 60;
      const x1 = x0 + (W - 120) * r;
      ctx.moveTo(x0, y);
      for (let x = x0; x < x1; x += 6) ctx.lineTo(x, y + Math.sin(x * 0.21) * 2.5 + Math.sin(x * 0.047) * 1.5);
      ctx.stroke();
    }
    y += 46;
  }
  // tiny heart at bottom
  ctx.fillStyle = "#ff6f91";
  ctx.font = "36px serif";
  ctx.textAlign = "center";
  ctx.fillText("♥", W / 2, H - 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
