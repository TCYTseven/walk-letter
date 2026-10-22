/**
 * build-photos.ts — turns the photos in drop/ into
 * web-ready JPGs in public/photos/ and writes src/data/photos.json.
 *
 *   npm run photos        (also runs automatically before `next dev` / `next build`)
 *
 * - Originals in drop/ are never modified, moved, or deleted.
 * - HEIC is decoded with pure-JS/WASM libheif (works on Vercel's Linux builders).
 * - Outputs: max 1600px long side, EXIF auto-rotated, progressive mozjpeg, all
 *   metadata stripped (no GPS leaks).
 * - Incremental: an output newer than its original is not re-encoded.
 * - Merge-safe: if originals are absent (e.g. a deploy without them), existing
 *   photos.json entries whose output still exists are kept.
 *
 * Dates are stored as *wall-clock* ISO strings without a zone
 * ("2024-06-14T18:12:00"). EXIF DateTimeOriginal has no reliable timezone, so
 * this keeps the capture-local date stable no matter which machine/timezone
 * runs the build, and `new Date(str)` in the browser shows that same date.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import exifr from "exifr";

const ROOT = process.cwd();
const DROP_DIR = path.join(ROOT, "drop");
const OUT_DIR = path.join(ROOT, "public", "photos");
const JSON_PATH = path.join(ROOT, "src", "data", "photos.json");

const MAX_SIDE = 1600;
const QUALITY = 80;
const CONCURRENCY = 4;
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp"]);
/** Max Hamming distance between dHashes to call two outputs "the same picture". */
const DUP_HASH_DISTANCE = 1;

interface PhotoEntry {
  filename: string;
  date: string;
  width: number;
  height: number;
}

interface Result extends PhotoEntry {
  source: string;
  dateSource: "exif" | "mtime";
  encoded: boolean;
  dhash: bigint;
  outBytes: number;
}

// ---------------------------------------------------------------- helpers ---

const pad = (n: number) => String(n).padStart(2, "0");

/** Wall-clock ISO (no zone) from a Date's local components. */
function wallClockIso(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

const exists = (p: string) =>
  fs.stat(p).then(
    (s) => s,
    () => null,
  );

const sha1 = (buf: Buffer) => createHash("sha1").update(buf).digest("hex");

function sniffHeic(buf: Buffer): boolean {
  if (buf.length < 12 || buf.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buf.toString("ascii", 8, 12).replace("\0", " ").trim();
  return ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand);
}

/** Read a capture date from EXIF; exifr builds Dates in *local* time from naive EXIF strings. */
const DATE_TAGS = ["DateTimeOriginal", "CreateDate", "ModifyDate"] as const;

async function dateFromExifInput(input: string | Buffer): Promise<Date | null> {
  try {
    const tags = await exifr.parse(input, { pick: [...DATE_TAGS] });
    for (const key of DATE_TAGS) {
      const v = tags?.[key];
      if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
    }
  } catch {
    /* no / unreadable EXIF */
  }
  return null;
}

async function readExifDate(file: string, buf: Buffer): Promise<Date | null> {
  const direct = await dateFromExifInput(file);
  if (direct) return direct;
  // Fallback: exifr rejects some newer iPhone HEICs ("Unknown file format",
  // their ftyp box is longer than it expects). The EXIF payload is still a
  // plain TIFF block prefixed by "Exif\0\0" — find it and parse it directly.
  for (const sig of ["Exif\0\0MM\0*", "Exif\0\0II*\0"]) {
    const i = buf.indexOf(Buffer.from(sig, "latin1"));
    if (i >= 0) return dateFromExifInput(buf.subarray(i + 6));
  }
  return null;
}

/** 64-bit difference hash of an image (cheap near-duplicate detection). */
async function dHash(input: Buffer | string): Promise<bigint> {
  const px = await sharp(input).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let h = 0n;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) h = (h << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
  return h;
}

function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/** Decode a HEIC buffer into a sharp pipeline (raw RGBA, orientation already applied by libheif). */
async function heicToSharp(buf: Buffer): Promise<ReturnType<typeof sharp>> {
  try {
    const { default: decode } = await import("heic-decode");
    const img = await decode({ buffer: buf });
    return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), {
      raw: { width: img.width, height: img.height, channels: 4 },
    });
  } catch (err) {
    // Fallback: heic-convert -> JPEG buffer.
    const { default: convert } = await import("heic-convert");
    const jpg = await convert({ buffer: buf, format: "JPEG", quality: 0.95 });
    return sharp(Buffer.from(jpg));
  }
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

// ------------------------------------------------------------------- main ---

async function findOriginals(): Promise<string[]> {
  const entries = await fs.readdir(DROP_DIR, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort();

  // Dedupe 1: same basename (case-insensitive) -> keep the largest file.
  const byBase = new Map<string, { name: string; size: number }>();
  const skipped: string[] = [];
  for (const name of files) {
    const base = path.parse(name).name.toLowerCase();
    const size = (await fs.stat(path.join(DROP_DIR, name))).size;
    const prev = byBase.get(base);
    if (!prev) byBase.set(base, { name, size });
    else if (size > prev.size) {
      skipped.push(prev.name);
      byBase.set(base, { name, size });
    } else skipped.push(name);
  }

  // Dedupe 2: byte-identical originals under different names.
  const byHash = new Map<string, string>();
  const kept: string[] = [];
  for (const { name } of byBase.values()) {
    const h = sha1(await fs.readFile(path.join(DROP_DIR, name)));
    if (byHash.has(h)) skipped.push(name);
    else {
      byHash.set(h, name);
      kept.push(name);
    }
  }
  for (const s of skipped) console.log(`  dup   ${s} (same basename or identical bytes, skipped)`);
  return kept.sort();
}

async function processOne(name: string, previous: Map<string, PhotoEntry>): Promise<Result | null> {
  const src = path.join(DROP_DIR, name);
  const outName = `${path.parse(name).name}.jpg`;
  const out = path.join(OUT_DIR, outName);
  try {
    const [srcStat, outStat, buf] = await Promise.all([fs.stat(src), exists(out), fs.readFile(src)]);

    const exifDate = await readExifDate(src, buf);
    // Without EXIF, prefer a previously recorded date over mtime (mtime changes
    // on every fresh git clone, so it is the least trustworthy source).
    const date = exifDate
      ? wallClockIso(exifDate)
      : (previous.get(outName)?.date ?? wallClockIso(srcStat.mtime));

    let encoded = false;
    if (!outStat || outStat.mtimeMs < srcStat.mtimeMs) {
      const pipeline = sniffHeic(buf) ? await heicToSharp(buf) : sharp(buf, { failOn: "none" });
      const jpg = await pipeline
        .rotate() // apply EXIF orientation (no-op for decoded HEIC: libheif already applied it)
        .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" }) // PNG transparency -> white
        .toColourspace("srgb")
        .jpeg({ quality: QUALITY, progressive: true, mozjpeg: true })
        .toBuffer(); // sharp strips all metadata unless withMetadata() is called
      const tmp = `${out}.tmp`;
      await fs.writeFile(tmp, jpg);
      await fs.rename(tmp, out);
      // Stamp the output with max(now, original mtime) so the freshness check
      // holds even when originals carry future mtimes (clock/zone skew on copy).
      const stamp = new Date(Math.max(Date.now(), srcStat.mtimeMs));
      await fs.utimes(out, stamp, stamp);
      encoded = true;
    }

    const meta = await sharp(out).metadata();
    const outBytes = (await fs.stat(out)).size;
    return {
      filename: outName,
      date,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      source: name,
      dateSource: exifDate ? "exif" : "mtime",
      encoded,
      dhash: await dHash(out),
      outBytes,
    };
  } catch (err) {
    console.warn(`  WARN  ${name}: ${(err as Error).message}`);
    return null;
  }
}

async function main() {
  const t0 = Date.now();
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(JSON_PATH), { recursive: true });

  await fs.mkdir(DROP_DIR, { recursive: true });
  console.log("build-photos");
  let existing: PhotoEntry[] = [];
  try {
    existing = JSON.parse(await fs.readFile(JSON_PATH, "utf8"));
    if (!Array.isArray(existing)) existing = [];
  } catch {
    existing = [];
  }
  const previous = new Map(existing.filter((e) => e?.filename).map((e) => [e.filename, e]));

  const originals = await findOriginals();
  console.log(`  ${originals.length} original image(s) in drop/`);

  let done = 0;
  const results = (
    await pool(originals, CONCURRENCY, async (name) => {
      const r = await processOne(name, previous);
      done++;
      if (r?.encoded) console.log(`  [${done}/${originals.length}] encoded ${r.source} -> ${r.filename}`);
      return r;
    })
  ).filter((r): r is Result => r !== null);
  const failed = originals.length - results.length;

  // Dedupe 3: visually identical outputs (near-equal dHash + same aspect). Keep the first.
  const fresh: Result[] = [];
  for (const r of results.sort((a, b) => a.date.localeCompare(b.date) || a.filename.localeCompare(b.filename))) {
    const twin = fresh.find(
      (k) =>
        hamming(k.dhash, r.dhash) <= DUP_HASH_DISTANCE &&
        Math.abs(k.width / k.height - r.width / r.height) < 0.01,
    );
    if (twin) {
      console.log(`  dup   ${r.source} looks identical to ${twin.source}, skipped`);
      await fs.rm(path.join(OUT_DIR, r.filename), { force: true });
    } else fresh.push(r);
  }

  // Merge with existing photos.json (works when originals are not present, e.g. on deploy).
  const entries = new Map<string, PhotoEntry>();
  for (const e of existing) {
    if (!e?.filename || !(await exists(path.join(OUT_DIR, e.filename)))) continue;
    entries.set(e.filename, e);
  }
  const freshNames = new Set(fresh.map((r) => r.filename));
  const keptFromJson = [...entries.keys()].filter((f) => !freshNames.has(f)).length;
  for (const r of fresh) {
    entries.set(r.filename, { filename: r.filename, date: r.date, width: r.width, height: r.height });
  }
  // Remove entries for outputs we just dropped as visual duplicates.
  for (const r of results) if (!freshNames.has(r.filename)) entries.delete(r.filename);

  // Orphan JPGs in public/photos with no entry (date from mtime).
  let orphans = 0;
  for (const f of await fs.readdir(OUT_DIR)) {
    if (!/\.jpe?g$/i.test(f) || entries.has(f)) continue;
    const p = path.join(OUT_DIR, f);
    const [meta, st] = await Promise.all([sharp(p).metadata(), fs.stat(p)]);
    entries.set(f, { filename: f, date: wallClockIso(st.mtime), width: meta.width ?? 0, height: meta.height ?? 0 });
    orphans++;
  }

  const list = [...entries.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.filename.localeCompare(b.filename),
  );
  await fs.writeFile(JSON_PATH, JSON.stringify(list, null, 2) + "\n");

  // ---- summary
  let totalBytes = 0;
  for (const e of list) totalBytes += (await fs.stat(path.join(OUT_DIR, e.filename))).size;
  const encoded = fresh.filter((r) => r.encoded).length;
  const noExif = fresh.filter((r) => r.dateSource === "mtime");
  console.log("  ─────────────────────────────────────");
  console.log(`  photos in json   ${list.length}`);
  console.log(`  encoded          ${encoded}  (up to date: ${fresh.length - encoded})`);
  if (keptFromJson) console.log(`  kept (no orig.)  ${keptFromJson}`);
  if (orphans) console.log(`  orphans added    ${orphans}`);
  if (failed) console.log(`  failed           ${failed}`);
  console.log(`  no EXIF date     ${noExif.length}${noExif.length ? `  (${noExif.map((r) => r.source).join(", ")})` : ""}`);
  if (list.length) console.log(`  date range       ${list[0].date.slice(0, 10)} → ${list[list.length - 1].date.slice(0, 10)}`);
  console.log(`  total size       ${mb(totalBytes)}`);
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("build-photos failed:", err);
  process.exit(1);
});
