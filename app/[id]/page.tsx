import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SharedLetterPlayer from "@/components/SharedLetterPlayer";
import { ID_PATTERN, isSharedLetter, manifestPath } from "@/lib/share";
import { readFile } from "@/lib/server/storage";
import type { SharedLetter } from "@/lib/types";

async function loadLetter(id: string): Promise<SharedLetter | null> {
  if (!ID_PATTERN.test(id)) return null;
  const bytes = await readFile(manifestPath(id));
  if (!bytes) return null;
  const data: unknown = JSON.parse(bytes.toString("utf8"));
  return isSharedLetter(data) ? data : null;
}

export const metadata: Metadata = {
  title: "A walk letter for you",
  description: "Open the envelope, read the letter, and take the walk.",
};

export default async function SharedLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shared = await loadLetter(id);
  if (!shared) notFound();
  return <SharedLetterPlayer shared={shared} />;
}
