"use client";

import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { useStore } from "@/lib/store";
import styles from "./ui.module.css";

const MIN_VISIBLE_MS = 900; // always show briefly on first mount
const SHOW_DEBOUNCE_MS = 250; // ignore tiny background loads
const HIDE_DEBOUNCE_MS = 350; // avoid flicker between loader batches

/**
 * Full-screen cute loader. Tracks three.js' DefaultLoadingManager via drei's
 * useProgress (works outside any Canvas). Never shown mid-walk while playing.
 */
export default function LoadingScreen() {
  const { active, progress } = useProgress();
  const playing = useStore((s) => s.playing);

  const [minDone, setMinDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const shownProgress = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), MIN_VISIBLE_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setLoading(active), active ? SHOW_DEBOUNCE_MS : HIDE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [active]);

  const visible = !minDone || (loading && !playing);

  // Monotonic progress while visible; resets once hidden.
  if (!visible) shownProgress.current = 0;
  else shownProgress.current = Math.max(shownProgress.current, active ? progress : 100);
  const pct = Math.round(shownProgress.current);

  return (
    <div
      className={`${styles.loading} ${visible ? "" : styles.loadingHidden}`}
      aria-hidden={!visible}
      role="status"
    >
      <div className={styles.beatingHeart} aria-hidden>
        ♥
      </div>
      <p className={styles.loadingText}>loading something special…</p>
      <div className={styles.bar}>
        <div className={styles.barFill} style={{ width: `${Math.max(6, pct)}%` }} />
      </div>
    </div>
  );
}
