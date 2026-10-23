import type { LetterContent, SharedLetter, SharedPhoto } from "./types";

/** Share ids are 10 base62 characters, for example "k3T9pQx2Ab". */
export const ID_PATTERN = /^[A-Za-z0-9]{10}$/;
export const MAX_PHOTOS = 300;
/** Uploads are resized in the browser first, so real files land far below this. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function newShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function photoPath(id: string, n: number): string {
  return `letters/${id}/${n}.jpg`;
}

export function manifestPath(id: string): string {
  return `letters/${id}.json`;
}

export function photoUrl(id: string, n: number): string {
  return `/api/files/${photoPath(id, n)}`;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function text(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length <= max ? v : null;
}

/** Validates letter copy from an untrusted request. Returns null when it does not fit. */
export function parseLetter(v: unknown): LetterContent | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const greeting = text(o.greeting, 200);
  const signoff = text(o.signoff, 200);
  const signature = text(o.signature, 200);
  const surpriseUrl = text(o.surpriseUrl, 2000);
  if (greeting === null || signoff === null || signature === null || surpriseUrl === null) return null;
  if (surpriseUrl && !/^https?:\/\//i.test(surpriseUrl)) return null;
  if (!Array.isArray(o.paragraphs) || o.paragraphs.length > 60) return null;
  const paragraphs = o.paragraphs.map((p) => text(p, 4000));
  if (paragraphs.some((p) => p === null)) return null;
  return { greeting, paragraphs: paragraphs as string[], signoff, signature, surpriseUrl };
}

/** Validates the photo list a publish request sends. Each `n` must be 0..count-1 in order. */
export function parsePhotos(id: string, v: unknown): SharedPhoto[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_PHOTOS) return null;
  const out: SharedPhoto[] = [];
  for (const [i, p] of v.entries()) {
    if (!p || typeof p !== "object") return null;
    const o = p as Record<string, unknown>;
    const { date, width, height } = o;
    if (typeof date !== "string" || !DATE_PATTERN.test(date)) return null;
    if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
    if ((width as number) < 1 || (height as number) < 1 || (width as number) > 10000 || (height as number) > 10000) return null;
    out.push({ src: photoUrl(id, i), date, width: width as number, height: height as number });
  }
  return out;
}

export function isSharedLetter(v: unknown): v is SharedLetter {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.version === 1 && typeof o.id === "string" && parseLetter(o.letter) !== null && Array.isArray(o.photos);
}
