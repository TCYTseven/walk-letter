import raw from "@/data/photos.json";
import type { Photo, PhotoMeta, SharedPhoto } from "./types";

/**
 * Photos on the walk. Starts as the sample in src/data/photos.json; a shared letter
 * replaces it through useSharedContent before the world code loads.
 */
export const photos: Photo[] = (raw as PhotoMeta[]).map((p, index) => ({
  ...p,
  src: `/photos/${p.filename}`,
  index,
}));

export function replacePhotos(next: readonly SharedPhoto[]) {
  photos.splice(
    0,
    photos.length,
    ...next.map((p, index) => ({ ...p, filename: p.src.split("/").pop() ?? `${index}.jpg`, index })),
  );
}

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "May 12, 2025" */
export function formatPhotoDate(iso: string): string {
  return fmt.format(new Date(iso));
}
