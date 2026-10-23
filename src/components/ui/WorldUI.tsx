"use client";

import { useEffect, useRef, useState } from "react";
import { letter } from "@/lib/letter";
import { useStore } from "@/lib/store";
import styles from "./ui.module.css";

/** DOM overlay for the memory walk: start popup, touch button, ending card. */
export default function WorldUI() {
  const playing = useStore((s) => s.playing);
  const reachedEnd = useStore((s) => s.reachedEnd);
  const isMobile = useStore((s) => s.isMobile);
  const mobileAcknowledged = useStore((s) => s.mobileAcknowledged);
  const touchMode = isMobile && mobileAcknowledged;

  return (
    <>
      {!playing && !reachedEnd && <StartPopup touchMode={touchMode} />}
      {touchMode && playing && !reachedEnd && <ForwardButton />}
      {reachedEnd && <EndingCard />}
    </>
  );
}

/** "Click to start" card. The first appearance waits for the white flash to fade. */
let shownOnce = false;
function StartPopup({ touchMode }: { touchMode: boolean }) {
  const [delay] = useState(() => (shownOnce ? 120 : 900));
  useEffect(() => {
    shownOnce = true;
  }, []);

  const start = () => {
    const s = useStore.getState();
    if (touchMode) s.setPlaying(true);
    else s.requestLock();
  };

  return (
    <div
      className={styles.fullOverlay}
      style={{ animationDelay: `${delay}ms`, opacity: 0 }}
      onClick={start}
      role="button"
      aria-label="Start"
    >
      <div className={`${styles.card} ${styles.cardIn}`} style={{ animationDelay: `${delay + 80}ms` }}>
        <span className={styles.floatHeart} aria-hidden>
          💗
        </span>
        <h2 className={styles.heading}>our little walk</h2>
        {touchMode ? (
          <>
            <p className={styles.body}>Drag to look around and hold the ♡ button to walk forward.</p>
            <p className={styles.cta}>Tap to start</p>
          </>
        ) : (
          <>
            <p className={styles.body}>
              Use <span className={styles.key}>W</span>
              <span className={styles.key}>A</span>
              <span className={styles.key}>S</span>
              <span className={styles.key}>D</span> to move and your mouse to look around.
            </p>
            <p className={styles.cta}>Click to start</p>
            <p className={styles.small}>space / shift to float up &amp; down · esc to pause</p>
          </>
        )}
      </div>
    </div>
  );
}

/** Hold-to-walk button for touch mode. */
function ForwardButton() {
  const [held, setHeld] = useState(false);
  const setTouchForward = useStore((s) => s.setTouchForward);
  const ref = useRef<HTMLButtonElement>(null);

  const set = (v: boolean) => {
    setHeld(v);
    setTouchForward(v);
  };
  useEffect(() => () => useStore.getState().setTouchForward(false), []);

  return (
    <button
      ref={ref}
      type="button"
      aria-label="Walk forward"
      className={`${styles.touchBtn} ${held ? styles.touchBtnActive : ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        ref.current?.setPointerCapture?.(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      ♡
    </button>
  );
}

/** Final card at the end platform. */
function EndingCard() {
  return (
    <div className={styles.endOverlay} style={{ animationDelay: "500ms", opacity: 0 }}>
      <div className={`${styles.card} ${styles.cardIn}`} style={{ animationDelay: "700ms" }}>
        <span className={styles.floatHeart} aria-hidden>
          🎁
        </span>
        <h2 className={styles.heading}>One last note</h2>
        {letter.surpriseUrl.trim() ? (
          <div style={{ marginTop: 18 }}>
            <button
              type="button"
              className="cute-btn"
              onClick={() => window.open(letter.surpriseUrl, "_blank", "noopener,noreferrer")}
            >
              Open the note
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
