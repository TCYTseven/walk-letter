import { ID_PATTERN, MAX_PHOTOS, manifestPath, parseLetter, parsePhotos } from "@/lib/share";
import { QuotaError, claimLetter, clientIp } from "@/lib/server/quota";
import { AlreadyExistsError, StorageUnavailableError, putFile } from "@/lib/server/storage";
import type { SharedLetter } from "@/lib/types";

/** POST /api/letters publishes a letter whose photos were sent to /api/upload. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!ID_PATTERN.test(id)) return Response.json({ error: "Bad id." }, { status: 400 });
  const letter = parseLetter(body.letter);
  if (!letter) return Response.json({ error: "The letter has a field that is too long or invalid." }, { status: 400 });
  const photos = parsePhotos(id, body.photos);
  if (!photos) return Response.json({ error: `Add between 1 and ${MAX_PHOTOS} photos with valid dates.` }, { status: 400 });

  const manifest: SharedLetter = { version: 1, id, createdAt: new Date().toISOString(), letter, photos };
  try {
    await claimLetter(clientIp(request), id);
    await putFile(manifestPath(id), JSON.stringify(manifest), "application/json");
  } catch (err) {
    if (err instanceof QuotaError) return Response.json({ error: err.message }, { status: 429 });
    if (err instanceof AlreadyExistsError) return Response.json({ error: "This letter is already published." }, { status: 409 });
    if (err instanceof StorageUnavailableError) return Response.json({ error: err.message }, { status: 503 });
    throw err;
  }
  return Response.json({ id });
}
