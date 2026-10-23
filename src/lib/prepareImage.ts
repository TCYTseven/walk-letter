/** Longest edge of an uploaded photo. The walk shows photos about a meter wide, so this is plenty. */
const MAX_EDGE = 2048;
const QUALITY = 0.86;

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  /** Wall-clock capture time, YYYY-MM-DDTHH:mm:ss. */
  date: string;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toWallClock(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function captureDate(file: File): Promise<Date> {
  try {
    // Loaded on demand: exifr probes Node modules when it is imported during prerendering.
    const { default: exifr } = await import("exifr");
    const tags = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]);
    const d = tags?.DateTimeOriginal ?? tags?.CreateDate;
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  } catch {
    // No EXIF block; fall back to the file's timestamp.
  }
  return new Date(file.lastModified || Date.now());
}

/** Decodes, orients, downsizes, and re-encodes a photo as JPEG. Throws when the browser cannot decode it. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const [bitmap, date] = await Promise.all([createImageBitmap(file, { imageOrientation: "from-image" }), captureDate(file)]);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable.");
    // JPEG has no alpha; paint transparent PNG areas cream instead of black.
    ctx.fillStyle = "#fffaf2";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) throw new Error("Could not encode the photo.");
    return { blob, width, height, date: toWallClock(date) };
  } finally {
    bitmap.close();
  }
}
