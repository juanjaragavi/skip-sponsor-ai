import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Operator-only access to the shared segment cache (security audit
 * 2026-10-12, SS-1/SS-2/SS-3). Every install reads the same cached analysis
 * for a video, so wiping it, injecting segments into it or forcing a fresh
 * analysis over a ready one changes what every user's player skips. Those
 * actions need ADMIN_API_TOKEN, sent in its own header (never the install
 * token's `Authorization`). The header is not in the CORS allow-list, so a
 * web page cannot send it from a browser; it is meant for operator scripts.
 */
export const ADMIN_TOKEN_HEADER = "x-admin-token";

/** Shortest accepted ADMIN_API_TOKEN in production. */
export const ADMIN_TOKEN_MIN_LENGTH = 32;

const digest = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

/**
 * Constant-time comparison over SHA-256 digests (equal length whatever the
 * input). An empty configured token never matches: the routes are disabled.
 */
export function adminTokenMatches(
  expected: string,
  provided: string | string[] | undefined,
): boolean {
  if (expected.length === 0 || typeof provided !== "string") return false;
  return timingSafeEqual(digest(expected), digest(provided));
}
