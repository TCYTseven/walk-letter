import { ID_PATTERN, MAX_PHOTOS, MAX_UPLOAD_BYTES, manifestPath, photoPath, photoUrl } from "@/lib/share";
import { StorageUnavailableError, fileExists, putFile } from "@/lib/server/storage";

/** POST /api/upload?id=<shareId>&n=<index> with a JPEG body. Stores one photo of an unpublished letter. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const n = Number(url.searchParams.get("n"));
  if (!ID_PATTERN.test(id) || !Number.isInteger(n) || n < 0 || n >= MAX_PHOTOS) {
    return Response.json({ error: "Bad id or index." }, { status: 400 });
  }
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length === 0 || body.length > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Photo is empty or too large." }, { status: 413 });
  }
  // JPEG files start with FF D8 FF.
  if (body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) {
    return Response.json({ error: "Photos must be JPEG." }, { status: 415 });
  }
  try {
    // A published letter never changes.
    if (await fileExists(manifestPath(id))) {
      return Response.json({ error: "This letter is already published." }, { status: 409 });
    }
    await putFile(photoPath(id, n), body, "image/jpeg", { overwrite: true });
  } catch (err) {
    if (err instanceof StorageUnavailableError) return Response.json({ error: err.message }, { status: 503 });
    throw err;
  }
  return Response.json({ src: photoUrl(id, n) });
}
