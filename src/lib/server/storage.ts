import { promises as fs } from "node:fs";
import path from "node:path";
import { get, put } from "@vercel/blob";

/**
 * File storage for letters made at /customize.
 *
 * With BLOB_READ_WRITE_TOKEN set (connect a Vercel Blob store to the project), files go to
 * Vercel Blob. Without it, files go to `.data/` next to the app, which works for `next dev`
 * and for a self-hosted `next start` with a persistent disk.
 */

const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
/** Must match the store's access mode. Vercel Blob stores are either public or private. */
const blobAccess = process.env.BLOB_ACCESS === "private" ? "private" : "public";
const localRoot = path.join(process.cwd(), ".data");

export class AlreadyExistsError extends Error {}

export class StorageUnavailableError extends Error {}

function localFile(pathname: string): string {
  const full = path.join(localRoot, pathname);
  if (!full.startsWith(localRoot + path.sep)) throw new Error("Bad path");
  return full;
}

export async function putFile(
  pathname: string,
  body: Buffer | string,
  contentType: string,
  { overwrite = false }: { overwrite?: boolean } = {},
): Promise<void> {
  if (useBlob) {
    try {
      await put(pathname, body, {
        access: blobAccess,
        contentType,
        addRandomSuffix: false,
        allowOverwrite: overwrite,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
      });
    } catch (err) {
      if (!overwrite && err instanceof Error && /already exists/i.test(err.message)) throw new AlreadyExistsError();
      throw err;
    }
    return;
  }
  if (process.env.VERCEL) {
    throw new StorageUnavailableError("Connect a Vercel Blob store to this project to save letters.");
  }
  const file = localFile(pathname);
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.writeFile(file, body, { flag: overwrite ? "w" : "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") throw new AlreadyExistsError();
    throw err;
  }
}

/** Returns the file's bytes, or null when it does not exist. */
export async function readFile(pathname: string): Promise<Buffer | null> {
  if (useBlob) {
    // Manifests are read fresh so a lookup before publishing never leaves a cached miss behind.
    const result = await get(pathname, { access: blobAccess, useCache: !pathname.endsWith(".json") });
    if (!result || result.statusCode !== 200) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  try {
    return await fs.readFile(localFile(pathname));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function fileExists(pathname: string): Promise<boolean> {
  return (await readFile(pathname)) !== null;
}
