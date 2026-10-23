import sample from "@/data/letter.json";
import { replacePhotos } from "./photos";
import type { LetterContent, SharedLetter } from "./types";

/** Letter copy shown in the envelope and at the end of the walk. Starts as src/data/letter.json. */
export const letter: LetterContent = { ...sample };

/**
 * Swaps the sample for a shared letter. Call before rendering the Experience: lib/path
 * lays out the walk from the photo count when the world code first loads.
 */
export function applySharedLetter(shared: SharedLetter) {
  Object.assign(letter, shared.letter);
  replacePhotos(shared.photos);
}
