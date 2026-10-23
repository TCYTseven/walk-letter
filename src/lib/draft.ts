/**
 * The /customize draft lives in this browser only: letter copy in localStorage and the
 * resized photos in IndexedDB (localStorage is too small for images). Every call
 * tolerates storage being unavailable, as in some private windows.
 */

export interface DraftPhoto {
  key: string;
  blob: Blob;
  width: number;
  height: number;
  date: string;
  name: string;
}

/** The letter form as typed. The body keeps blank lines; it becomes paragraphs on publish. */
export interface LetterForm {
  greeting: string;
  body: string;
  signoff: string;
  signature: string;
  surpriseUrl: string;
}

export interface PublishedLink {
  id: string;
  createdAt: string;
  photoCount: number;
  greeting: string;
}

const LETTER_KEY = "walk-letter:draft-letter";
const PUBLISHED_KEY = "walk-letter:published";
const DB_NAME = "walk-letter";
const STORE = "draft";
const PHOTOS_KEY = "photos";

export function loadLetterDraft(): LetterForm | null {
  try {
    const raw = localStorage.getItem(LETTER_KEY);
    return raw ? (JSON.parse(raw) as LetterForm) : null;
  } catch {
    return null;
  }
}

export function saveLetterDraft(letter: LetterForm) {
  try {
    localStorage.setItem(LETTER_KEY, JSON.stringify(letter));
  } catch {
    // Storage full or blocked; the draft only lasts this tab.
  }
}

export function loadPublished(): PublishedLink[] {
  try {
    const raw = localStorage.getItem(PUBLISHED_KEY);
    return raw ? (JSON.parse(raw) as PublishedLink[]) : [];
  } catch {
    return [];
  }
}

export function savePublished(list: PublishedLink[]) {
  try {
    localStorage.setItem(PUBLISHED_KEY, JSON.stringify(list));
  } catch {
    // Ignore; the link is still shown on screen.
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadPhotoDraft(): Promise<DraftPhoto[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(PHOTOS_KEY);
      req.onsuccess = () => resolve((req.result as DraftPhoto[] | undefined) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function savePhotoDraft(photos: DraftPhoto[]) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(photos, PHOTOS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Storage full or blocked; the draft only lasts this tab.
  }
}
