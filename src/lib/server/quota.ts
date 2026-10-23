import { createHash } from "node:crypto";
import { putFile, readFile } from "./storage";

/**
 * One letter per IP address per day. The first photo upload claims a share id for the
 * caller's IP; for the next 24 hours that IP may only upload to, and publish, that id.
 * Retrying a failed upload reuses the id, so it does not use up the day's letter.
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;

interface Claim {
  id: string;
  claimedAt: number;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("x-real-ip") ?? forwarded ?? "unknown";
}

function claimPath(ip: string): string {
  // Hashed so stored paths never contain raw addresses.
  const salt = process.env.BLOB_READ_WRITE_TOKEN ?? "walk-letter";
  return `limits/${createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32)}.json`;
}

async function readClaim(ip: string): Promise<Claim | null> {
  const bytes = await readFile(claimPath(ip));
  if (!bytes) return null;
  const claim = JSON.parse(bytes.toString("utf8")) as Claim;
  return Date.now() - claim.claimedAt < WINDOW_MS ? claim : null;
}

export class QuotaError extends Error {
  constructor(retryAt: number) {
    const hours = Math.max(1, Math.ceil((retryAt - Date.now()) / (60 * 60 * 1000)));
    super(`You can make one letter per day. Try again in about ${hours} hour${hours === 1 ? "" : "s"}.`);
  }
}

/** Claims `id` for this IP, or confirms it already holds it. Throws QuotaError otherwise. */
export async function claimLetter(ip: string, id: string): Promise<void> {
  const claim = await readClaim(ip);
  if (claim?.id === id) return;
  if (claim) throw new QuotaError(claim.claimedAt + WINDOW_MS);
  await putFile(claimPath(ip), JSON.stringify({ id, claimedAt: Date.now() } satisfies Claim), "application/json", {
    overwrite: true,
  });
}
