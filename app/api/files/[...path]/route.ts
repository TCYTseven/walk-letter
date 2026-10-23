import { ID_PATTERN } from "@/lib/share";
import { readFile } from "@/lib/server/storage";

/** GET /api/files/letters/<id>/<n>.jpg serves an uploaded photo from storage. */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const [dir, id, file] = path;
  if (path.length !== 3 || dir !== "letters" || !ID_PATTERN.test(id) || !/^\d{1,3}\.jpg$/.test(file)) {
    return new Response("Not found", { status: 404 });
  }
  const bytes = await readFile(`letters/${id}/${file}`);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      // Photos never change after a letter is published.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
