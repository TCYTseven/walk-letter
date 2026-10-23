"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import sample from "@/data/letter.json";
import {
  type DraftPhoto,
  type LetterForm,
  type PublishedLink,
  loadLetterDraft,
  loadPendingId,
  loadPhotoDraft,
  loadPublished,
  saveLetterDraft,
  savePendingId,
  savePhotoDraft,
  savePublished,
} from "@/lib/draft";
import { prepareImage } from "@/lib/prepareImage";
import { ID_PATTERN, MAX_PHOTOS, newShareId } from "@/lib/share";
import type { LetterContent } from "@/lib/types";
import styles from "./customize.module.css";

const SAMPLE_FORM: LetterForm = {
  greeting: sample.greeting,
  body: sample.paragraphs.join("\n\n"),
  signoff: sample.signoff,
  signature: sample.signature,
  surpriseUrl: "",
};

/** Photos decode in parallel, but only a few at a time so a big batch does not exhaust memory. */
const PREPARE_CONCURRENCY = 3;
const UPLOAD_CONCURRENCY = 4;

type Publish =
  | { kind: "idle" }
  | { kind: "uploading"; done: number; total: number }
  | { kind: "saving" }
  | { kind: "done"; id: string }
  | { kind: "error"; message: string };

function toLetter(form: LetterForm): LetterContent {
  return {
    greeting: form.greeting.trim(),
    paragraphs: form.body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean),
    signoff: form.signoff.trim(),
    signature: form.signature.trim(),
    surpriseUrl: form.surpriseUrl.trim(),
  };
}

async function runPool<T>(items: T[], size: number, work: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await work(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

/** The server's one-letter-per-day limit. Retrying does not help. */
class LimitError extends Error {}

async function postJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const message = typeof data.error === "string" ? data.error : `Request failed (${res.status}).`;
  if (res.status === 429) throw new LimitError(message);
  if (!res.ok) throw new Error(message);
  return data;
}

async function uploadPhoto(id: string, n: number, blob: Blob) {
  for (let attempt = 0; ; attempt++) {
    try {
      await postJson(`/api/upload?id=${id}&n=${n}`, { method: "POST", body: blob, headers: { "Content-Type": "image/jpeg" } });
      return;
    } catch (err) {
      if (attempt >= 2 || err instanceof LimitError) throw err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

export default function Customizer() {
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [form, setForm] = useState<LetterForm>(SAMPLE_FORM);
  const [loaded, setLoaded] = useState(false);
  const [preparing, setPreparing] = useState({ done: 0, total: 0 });
  const [skipped, setSkipped] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [publish, setPublish] = useState<Publish>({ kind: "idle" });
  const [published, setPublished] = useState<PublishedLink[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Restore the draft saved in this browser.
  useEffect(() => {
    const letter = loadLetterDraft();
    if (letter) setForm({ ...SAMPLE_FORM, ...letter });
    setPublished(loadPublished());
    loadPhotoDraft().then((saved) => {
      setPhotos((current) => [...saved, ...current]);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) saveLetterDraft(form);
  }, [form, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => savePhotoDraft(photos), 400);
    return () => clearTimeout(t);
  }, [photos, loaded]);

  const thumbs = useMemo(() => new Map(photos.map((p) => [p.key, URL.createObjectURL(p.blob)])), [photos]);
  useEffect(() => () => thumbs.forEach((url) => URL.revokeObjectURL(url)), [thumbs]);

  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      const files = Array.from(list).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
      if (files.length === 0) return;
      const room = MAX_PHOTOS - photos.length;
      const accepted = files.slice(0, Math.max(0, room));
      const failed: string[] = files.slice(accepted.length).map((f) => `${f.name} (over the ${MAX_PHOTOS} photo limit)`);
      setPreparing({ done: 0, total: accepted.length });
      await runPool(accepted, PREPARE_CONCURRENCY, async (file) => {
        try {
          const img = await prepareImage(file);
          const photo: DraftPhoto = { ...img, key: crypto.randomUUID(), name: file.name };
          setPhotos((current) => [...current, photo]);
        } catch {
          failed.push(/\.(heic|heif)$/i.test(file.name) ? `${file.name} (this browser can't read HEIC; export it as JPG)` : file.name);
        }
        setPreparing((p) => ({ ...p, done: p.done + 1 }));
      });
      setPreparing({ done: 0, total: 0 });
      setSkipped(failed);
    },
    [photos.length],
  );

  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length || from === to) return;
    setPhotos((current) => {
      const next = current.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const sortByDate = () => setPhotos((current) => current.slice().sort((a, b) => a.date.localeCompare(b.date)));

  const setDate = (key: string, value: string) => {
    if (!value) return;
    setPhotos((current) => current.map((p) => (p.key === key ? { ...p, date: value.length === 16 ? `${value}:00` : value } : p)));
  };

  const letter = toLetter(form);
  const urlProblem = letter.surpriseUrl && !/^https?:\/\//i.test(letter.surpriseUrl) ? "Links must start with https://" : null;
  const busy = preparing.total > 0 || publish.kind === "uploading" || publish.kind === "saving";
  const canPublish = loaded && !busy && photos.length > 0 && letter.paragraphs.length > 0 && !urlProblem;

  const createLink = async () => {
    const pending = loadPendingId();
    const id = pending && ID_PATTERN.test(pending) ? pending : newShareId();
    savePendingId(id);
    const batch = photos.slice();
    try {
      let done = 0;
      setPublish({ kind: "uploading", done, total: batch.length });
      await runPool(batch, UPLOAD_CONCURRENCY, async (photo, n) => {
        await uploadPhoto(id, n, photo.blob);
        done++;
        setPublish({ kind: "uploading", done, total: batch.length });
      });
      setPublish({ kind: "saving" });
      await postJson("/api/letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          letter,
          photos: batch.map(({ date, width, height }) => ({ date, width, height })),
        }),
      });
      const entry: PublishedLink = { id, createdAt: new Date().toISOString(), photoCount: batch.length, greeting: letter.greeting };
      const list = [entry, ...published];
      setPublished(list);
      savePublished(list);
      savePendingId(null);
      setPublish({ kind: "done", id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setPublish({ kind: "error", message: err instanceof LimitError ? message : `${message} Try again.` });
    }
  };

  const linkFor = (id: string) => `${window.location.origin}/${id}`;

  const copy = async (id: string) => {
    const url = linkFor(id);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link:", url);
    }
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
  };

  const startOver = () => {
    if (!window.confirm("Clear all photos and reset the letter?")) return;
    setPhotos([]);
    setForm(SAMPLE_FORM);
    setSkipped([]);
    setPublish({ kind: "idle" });
  };

  return (
    <div
      className={styles.page}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.title}>Make your walk letter ♡</h1>
          <p className={styles.lead}>
            Add your photos, write a letter, and get a link to send. Your draft stays in this browser until you
            create the link. <a href="/">See the sample</a>
          </p>
        </header>

        <section className={styles.card}>
          <div className={styles.sectionHead}>
            <h2 className={styles.h2}>1. Photos</h2>
            <span className={styles.count}>
              {photos.length} / {MAX_PHOTOS}
            </span>
          </div>
          <p className={styles.hint}>
            They appear along the path in this order. Drag to reorder. Dates come from the photo when it has them.
          </p>

          <button
            type="button"
            className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ""}`}
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            {preparing.total > 0 ? (
              <>
                Preparing {preparing.done} of {preparing.total}…
                <span className={styles.bar}>
                  <span className={styles.barFill} style={{ width: `${(preparing.done / preparing.total) * 100}%` }} />
                </span>
              </>
            ) : (
              <>
                <strong>Drop photos here</strong> or click to choose. Select as many as you like.
              </>
            )}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {skipped.length > 0 && (
            <div className={styles.warn}>
              Skipped {skipped.length}: {skipped.join(", ")}
              <button type="button" className={styles.linkBtn} onClick={() => setSkipped([])}>
                dismiss
              </button>
            </div>
          )}

          {photos.length > 1 && (
            <div className={styles.toolbar}>
              <button type="button" className={styles.ghostBtn} onClick={sortByDate} disabled={busy}>
                Sort by date
              </button>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => window.confirm("Remove every photo?") && setPhotos([])}
                disabled={busy}
              >
                Remove all
              </button>
            </div>
          )}

          {photos.length > 0 && (
            <ol className={styles.grid}>
              {photos.map((p, i) => (
                <li
                  key={p.key}
                  className={`${styles.tile} ${dragKey === p.key ? styles.tileDragging : ""}`}
                  draggable={!busy}
                  onDragStart={(e) => {
                    setDragKey(p.key);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDragKey(null)}
                  onDragOver={(e) => {
                    if (dragKey) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (!dragKey) return;
                    e.preventDefault();
                    e.stopPropagation();
                    move(
                      photos.findIndex((x) => x.key === dragKey),
                      i,
                    );
                    setDragKey(null);
                  }}
                >
                  <div className={styles.thumbWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={styles.thumb} src={thumbs.get(p.key)} alt={p.name} loading="lazy" draggable={false} />
                    <span className={styles.badge}>{i + 1}</span>
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`Remove ${p.name}`}
                      onClick={() => setPhotos((current) => current.filter((x) => x.key !== p.key))}
                      disabled={busy}
                    >
                      ×
                    </button>
                  </div>
                  <input
                    className={styles.date}
                    type="datetime-local"
                    step={60}
                    value={p.date.slice(0, 16)}
                    onChange={(e) => setDate(p.key, e.target.value)}
                    aria-label={`Date for photo ${i + 1}`}
                    disabled={busy}
                  />
                  <div className={styles.moveRow}>
                    <button type="button" className={styles.moveBtn} onClick={() => move(i, i - 1)} disabled={busy || i === 0} aria-label="Move earlier">
                      ←
                    </button>
                    <button
                      type="button"
                      className={styles.moveBtn}
                      onClick={() => move(i, i + 1)}
                      disabled={busy || i === photos.length - 1}
                      aria-label="Move later"
                    >
                      →
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.h2}>2. Letter</h2>
          <label className={styles.field}>
            <span>Greeting</span>
            <input value={form.greeting} maxLength={200} onChange={(e) => setForm({ ...form, greeting: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span>Letter</span>
            <textarea
              rows={10}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Leave a blank line between paragraphs."
            />
            <small>Leave a blank line between paragraphs.</small>
          </label>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Sign-off</span>
              <input value={form.signoff} maxLength={200} onChange={(e) => setForm({ ...form, signoff: e.target.value })} />
            </label>
            <label className={styles.field}>
              <span>Your name</span>
              <input value={form.signature} maxLength={200} onChange={(e) => setForm({ ...form, signature: e.target.value })} />
            </label>
          </div>
          <label className={styles.field}>
            <span>Link at the end of the walk (optional)</span>
            <input
              type="url"
              placeholder="https://"
              value={form.surpriseUrl}
              onChange={(e) => setForm({ ...form, surpriseUrl: e.target.value })}
            />
            {urlProblem && <small className={styles.error}>{urlProblem}</small>}
          </label>
        </section>

        <section className={styles.card}>
          <h2 className={styles.h2}>3. Share</h2>
          {publish.kind === "done" ? (
            <div className={styles.share}>
              <p className={styles.hint}>Your letter is ready. Anyone with this link can open it.</p>
              <div className={styles.linkRow}>
                <input className={styles.linkInput} readOnly value={linkFor(publish.id)} onFocus={(e) => e.target.select()} />
                <button type="button" className="cute-btn" onClick={() => copy(publish.id)}>
                  {copied === publish.id ? "Copied ♡" : "Copy link"}
                </button>
              </div>
              <div className={styles.toolbar}>
                <a className={styles.ghostBtn} href={`/${publish.id}`} target="_blank" rel="noreferrer">
                  Open it
                </a>
                <button type="button" className={styles.ghostBtn} onClick={() => setPublish({ kind: "idle" })}>
                  Keep editing
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className={styles.hint}>
                This uploads your photos and letter and gives you a link. A link never changes after it is made; edit and
                create again for a new one. You can make one link per day, with up to {MAX_PHOTOS} photos.
              </p>
              {(publish.kind === "uploading" || publish.kind === "saving") && (
                <div className={styles.progress}>
                  {publish.kind === "uploading" ? `Uploading ${publish.done} of ${publish.total}…` : "Saving the letter…"}
                  <span className={styles.bar}>
                    <span
                      className={styles.barFill}
                      style={{ width: publish.kind === "uploading" ? `${(publish.done / publish.total) * 100}%` : "100%" }}
                    />
                  </span>
                </div>
              )}
              {publish.kind === "error" && <p className={styles.error}>{publish.message}</p>}
              <button type="button" className="cute-btn" disabled={!canPublish} onClick={createLink}>
                Create my link ♡
              </button>
              {!busy && photos.length === 0 && <p className={styles.hint}>Add at least one photo first.</p>}
              {!busy && photos.length > 0 && letter.paragraphs.length === 0 && <p className={styles.hint}>Write at least one paragraph.</p>}
            </>
          )}

          {published.length > 0 && (
            <div className={styles.history}>
              <h3 className={styles.h3}>Links you made in this browser</h3>
              <ul>
                {published.map((p) => (
                  <li key={p.id}>
                    <a href={`/${p.id}`} target="_blank" rel="noreferrer">
                      /{p.id}
                    </a>
                    <span>
                      {p.photoCount} photos · {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                    <button type="button" className={styles.linkBtn} onClick={() => copy(p.id)}>
                      {copied === p.id ? "copied" : "copy"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <footer className={styles.footer}>
          <button type="button" className={styles.linkBtn} onClick={startOver} disabled={busy}>
            Start over
          </button>
        </footer>
      </div>
    </div>
  );
}
