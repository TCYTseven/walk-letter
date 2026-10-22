import { create } from "zustand";

export type Stage = "envelope" | "letter" | "world";

interface AppState {
  stage: Stage;
  setStage: (s: Stage) => void;

  /** White flash transition in progress (FlashTransition switches stage to "world" at peak). */
  flashing: boolean;
  triggerFlash: () => void;
  endFlash: () => void;

  /** Phone detected and user chose "continue anyway" -> touch controls. */
  isMobile: boolean;
  mobileAcknowledged: boolean;
  setMobile: (v: boolean) => void;
  acknowledgeMobile: () => void;

  /** Memory walk: true while pointer is locked (desktop) or touch session started (mobile). */
  playing: boolean;
  setPlaying: (v: boolean) => void;
  /** Registered by PlayerControls; call from a click handler to request pointer lock. */
  requestLock: () => void;
  setRequestLock: (fn: () => void) => void;

  /** Mobile "move forward" button held. */
  touchForward: boolean;
  setTouchForward: (v: boolean) => void;

  /** Player reached the final platform. */
  reachedEnd: boolean;
  setReachedEnd: (v: boolean) => void;

  /** Number of photos revealed so far (for optional UI). */
  revealedCount: number;
  markRevealed: () => void;
}

export const useStore = create<AppState>((set) => ({
  stage: "envelope",
  setStage: (stage) => set({ stage }),

  flashing: false,
  triggerFlash: () => set({ flashing: true }),
  endFlash: () => set({ flashing: false }),

  isMobile: false,
  mobileAcknowledged: false,
  setMobile: (isMobile) => set({ isMobile }),
  acknowledgeMobile: () => set({ mobileAcknowledged: true }),

  playing: false,
  setPlaying: (playing) => set({ playing }),
  requestLock: () => {},
  setRequestLock: (requestLock) => set({ requestLock }),

  touchForward: false,
  setTouchForward: (touchForward) => set({ touchForward }),

  reachedEnd: false,
  setReachedEnd: (reachedEnd) => set({ reachedEnd }),

  revealedCount: 0,
  markRevealed: () => set((s) => ({ revealedCount: s.revealedCount + 1 })),
}));
