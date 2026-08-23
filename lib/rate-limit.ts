/**
 * In-memory sliding-window rate limiter for login/MFA attempts.
 *
 * Suitable for the single-instance prototype deployment. For horizontally
 * scaled production deployments, replace the Map with a shared store
 * (e.g., Redis or the database) — the interface stays the same.
 */

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

const buckets = new Map<string, number[]>();

function prune(key: string): number[] {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length === 0) buckets.delete(key);
  else buckets.set(key, arr);
  return arr;
}

/** Records a failed attempt against the bucket identified by `key`. */
export function recordAuthFailure(key: string): void {
  const arr = prune(key);
  arr.push(Date.now());
  buckets.set(key, arr);
}

/** True once the bucket has reached MAX_FAILURES within the window. */
export function isLockedOut(key: string): boolean {
  return prune(key).length >= MAX_FAILURES;
}

/** Clears the bucket after a successful authentication. */
export function clearAuthFailures(key: string): void {
  buckets.delete(key);
}

/** Extracts a best-effort client IP from proxy headers. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "local";
}
