import raw from "@/data/photos.json";
import type { Photo, PhotoMeta } from "./types";

export const photos: Photo[] = (raw as PhotoMeta[]).map((p, index) => ({
  ...p,
  src: `/photos/${p.filename}`,
  index,
}));

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "May 12, 2025" */
export function formatPhotoDate(iso: string): string {
  return fmt.format(new Date(iso));
}
