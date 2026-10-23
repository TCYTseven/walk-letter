"use client";

import { useEffect, useState } from "react";
import { letter } from "@/lib/letter";
import { useStore } from "@/lib/store";
import { ENVELOPE_OPENED_EVENT, letterCardSize } from "./envelope/shared";

/**
 * DOM layer for scene 1:
 *  - a subtle "click the envelope" hint before it's opened
 *  - the crisp, readable letter card once the 3D letter has arrived (stage === "letter").
 *    The card is sized with the same helper the 3D letter uses, so it lands exactly on top of it.
 */
export default function LetterOverlay() {
  const stage = useStore((s) => s.stage);
  const [opened, setOpened] = useState(false);
  const [touch, setTouch] = useState(false);
  const [card, setCard] = useState({ w: 0, h: 0 });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpened(true);
    window.addEventListener(ENVELOPE_OPENED_EVENT, onOpen);
    setTouch(window.matchMedia("(pointer: coarse)").matches);
    const onResize = () => setCard(letterCardSize(window.innerWidth, window.innerHeight));
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener(ENVELOPE_OPENED_EVENT, onOpen);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  if (stage === "world") return null;

  const showHint = stage === "envelope" && !opened;

  return (
    <div className="overlay-root">
      <style>{CSS}</style>

      {stage === "envelope" && (
        <div className={`lo-hint ${showHint ? "" : "lo-hint--gone"}`} aria-hidden={!showHint}>
          <div className="lo-hint-main">{touch ? "tap" : "click"} the envelope ♡</div>
          <div className="lo-hint-sub">{touch ? "drag to look around" : "right-click + drag to look around"}</div>
        </div>
      )}

      {stage === "letter" && card.h > 0 && (
        <div className="lo-center">
          <article className="lo-card" style={{ width: card.w, height: card.h }} aria-label="Letter">
            <div className="lo-scroll">
              <p className="lo-greeting">{letter.greeting}</p>
              {letter.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              <p className="lo-sign">
                {letter.signoff}
                <br />
                <span className="lo-name">{letter.signature}</span>
              </p>
            </div>
            <div className="lo-footer">
              <button
                className="cute-btn"
                disabled={leaving}
                onClick={() => {
                  setLeaving(true);
                  useStore.getState().triggerFlash();
                }}
              >
                Next ♡
              </button>
            </div>
          </article>
        </div>
      )}
    </div>
  );
}

const CSS = `
.lo-hint {
  position: absolute;
  left: 50%;
  bottom: max(6vh, 28px);
  transform: translateX(-50%);
  text-align: center;
  pointer-events: none !important;
  color: var(--ink);
  animation: lo-hint-in 1.2s ease 1.2s both;
  transition: opacity 0.5s ease, transform 0.5s ease;
  white-space: nowrap;
}
.lo-hint--gone { opacity: 0 !important; transform: translate(-50%, 10px); animation: none; }
.lo-hint-main {
  font-family: var(--font-hand), cursive;
  font-size: clamp(1.5rem, 3.2vh, 2rem);
  animation: lo-breathe 2.6s ease-in-out infinite;
}
.lo-hint-sub {
  margin-top: 2px;
  font-family: var(--font-ui), system-ui, sans-serif;
  font-size: 0.78rem;
  letter-spacing: 0.02em;
  opacity: 0.45;
}
@keyframes lo-hint-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes lo-breathe { 0%, 100% { opacity: 0.75; } 50% { opacity: 1; } }

.lo-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none !important;
}
.lo-card {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  position: relative;
  background:
    radial-gradient(ellipse at center, rgba(255,240,220,0) 55%, rgba(230,205,175,0.22) 100%),
    var(--cream);
  border-radius: 4px;
  box-shadow: 0 18px 50px rgba(59, 47, 74, 0.18), 0 2px 6px rgba(59, 47, 74, 0.08);
  color: var(--ink);
  animation: lo-card-in 0.6s ease both;
  overflow: hidden;
}
.lo-card::before {
  content: "";
  position: absolute;
  inset: 2.2% 3.05%; /* matches the border drawn on the 3D letter texture */
  border: 1.5px solid rgba(255, 143, 171, 0.55);
  pointer-events: none;
}
.lo-scroll {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  padding: 9% 10% 2%;
  font-family: var(--font-hand), cursive;
  font-size: clamp(1.1rem, 2.35vh, 1.62rem);
  line-height: 1.38;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,143,171,0.5) transparent;
}
.lo-scroll p { margin: 0 0 0.75em; }
.lo-greeting { font-size: 1.2em; font-weight: 600; margin-bottom: 0.6em !important; }
.lo-sign { margin-top: 1em !important; }
.lo-name { font-size: 1.35em; font-weight: 700; color: #e0507a; }
.lo-footer {
  display: flex;
  justify-content: center;
  padding: 0.6em 0 7%;
  background: linear-gradient(to bottom, rgba(255,250,242,0), var(--cream) 30%);
  animation: lo-fade 0.6s ease 0.5s both;
}
@keyframes lo-card-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes lo-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
`;
