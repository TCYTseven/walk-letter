"use client";

import { useStore } from "@/lib/store";
import styles from "./ui.module.css";

/** Gentle heads-up for phones; continuing switches the world to touch controls. */
export default function MobileGate() {
  const acknowledgeMobile = useStore((s) => s.acknowledgeMobile);

  return (
    <div className={styles.gate} role="dialog" aria-modal="true">
      <div className={`${styles.card} ${styles.cardIn}`}>
        <div className={styles.emoji} aria-hidden>
          💻
        </div>
        <h2 className={styles.heading}>psst…</h2>
        <p className={styles.body}>
          This was made for a laptop 💻 — it&apos;s way better on a bigger screen with a keyboard.
        </p>
        <div style={{ marginTop: 22 }}>
          <button type="button" className="cute-btn" onClick={acknowledgeMobile}>
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  );
}
