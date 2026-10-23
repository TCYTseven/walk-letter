"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { applySharedLetter } from "@/lib/letter";
import type { SharedLetter } from "@/lib/types";

const Experience = dynamic(() => import("@/components/Experience"), { ssr: false });

/** Plays a letter made at /customize. */
export default function SharedLetterPlayer({ shared }: { shared: SharedLetter }) {
  // Runs once in the browser, before the Experience (and the world code that reads the photos) loads.
  // Skipped on the server so one request's letter never lingers in shared module state.
  useState(() => {
    if (typeof window !== "undefined") applySharedLetter(shared);
  });
  return <Experience />;
}
