/**
 * Outbound retry policy (portfolio platform standard, 2026-10-12):
 *
 * - Retry only idempotent requests (GET, HEAD, OPTIONS, PUT, DELETE) or
 *   requests that carry an `Idempotency-Key`.
 * - Retry on network errors, timeouts and 408, 425, 429, 500, 502, 503, 504.
 *   Never retry any other 4xx.
 * - Base delay 200 ms, factor 2, full jitter, at most 4 attempts, each wait
 *   capped at 5 s, total deadline 15 s. `Retry-After` is honoured up to the cap.
 * - `x-correlation-id` and `Idempotency-Key` are forwarded unchanged on every
 *   attempt.
 *
 * Callers may tighten the limits per call (a shorter deadline for calls on the
 * request path) or set a longer deadline for LLM calls; each such override is
 * documented where it is made.
 */
import {
  currentCorrelationId,
  CORRELATION_HEADER,
} from "../observability/correlation";

export const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  factor: number;
  maxDelayMs: number;
  deadlineMs: number;
}

export const DEFAULT_RETRY_POLICY: Readonly<RetryPolicy> = Object.freeze({
  maxAttempts: 4,
  baseDelayMs: 200,
  factor: 2,
  maxDelayMs: 5000,
  deadlineMs: 15_000,
});

/** Injectable clock, sleep and jitter source (tests use a fake clock). */
export interface RetryRuntime {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
}

export const realRuntime: RetryRuntime = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

/** Full-jitter backoff before attempt `attempt + 1` (attempt is 1-based). */
export function backoffDelay(
  attempt: number,
  policy: RetryPolicy,
  random: () => number,
): number {
  const ceiling = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * policy.factor ** (attempt - 1),
  );
  return Math.floor(random() * ceiling);
}

/** `Retry-After` as milliseconds (delta-seconds or HTTP date), or null. */
export function parseRetryAfter(
  value: string | null | undefined,
  nowMs: number,
): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - nowMs);
}

export function isIdempotent(method: string, idempotencyKey?: string): boolean {
  return (
    IDEMPOTENT_METHODS.has(method.toUpperCase()) || Boolean(idempotencyKey)
  );
}

export interface RetryFetchOptions {
  policy?: Partial<RetryPolicy>;
  runtime?: RetryRuntime;
  /** Per-attempt timeout (bounded by the remaining deadline). */
  attemptTimeoutMs?: number;
  /** Defaults to the request's correlation id (AsyncLocalStorage). */
  correlationId?: string;
  idempotencyKey?: string;
  fetchImpl?: typeof fetch;
}

/**
 * fetch() with the platform retry policy. Returns the last response (the
 * caller decides what a non-2xx means) or throws the last network error.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: RetryFetchOptions = {},
): Promise<Response> {
  const policy = { ...DEFAULT_RETRY_POLICY, ...options.policy };
  const rt = options.runtime ?? realRuntime;
  const doFetch = options.fetchImpl ?? fetch;
  const method = (init.method ?? "GET").toUpperCase();
  const correlationId = options.correlationId ?? currentCorrelationId();
  const headers = new Headers(init.headers);
  if (correlationId) headers.set(CORRELATION_HEADER, correlationId);
  if (options.idempotencyKey)
    headers.set("Idempotency-Key", options.idempotencyKey);
  const retryable = isIdempotent(method, options.idempotencyKey);
  const started = rt.now();
  const attempts = retryable ? policy.maxAttempts : 1;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const remaining = policy.deadlineMs - (rt.now() - started);
    if (remaining <= 0) break;
    const timeout = Math.min(remaining, options.attemptTimeoutMs ?? remaining);
    let response: Response | null = null;
    try {
      response = await doFetch(url, {
        ...init,
        method,
        headers,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      lastError = err;
    }
    if (response && !RETRYABLE_STATUS.has(response.status)) return response;
    if (attempt === attempts) {
      if (response) return response;
      break;
    }
    let wait = backoffDelay(attempt, policy, rt.random);
    const retryAfter = response
      ? parseRetryAfter(response.headers.get("retry-after"), rt.now())
      : null;
    if (retryAfter !== null) wait = Math.min(policy.maxDelayMs, retryAfter);
    const left = policy.deadlineMs - (rt.now() - started);
    if (wait >= left) {
      if (response) return response;
      break;
    }
    // Free the socket of a response we are about to discard.
    await response?.body?.cancel().catch(() => undefined);
    await rt.sleep(wait);
  }
  throw lastError ?? new Error(`request to ${new URL(url).host} timed out`);
}

/** Classification of a non-fetch call's failure for retryAsync. */
export type FailureKind = "retry" | "fatal";

/**
 * Generic retry for SDK calls (the caller passes an Idempotency-Key and the
 * correlation id into the SDK request itself). `classify` maps an error to
 * retry/fatal; `retryAfterMs` may read a Retry-After hint from it.
 */
export async function retryAsync<T>(
  fn: (attempt: number, remainingMs: number) => Promise<T>,
  classify: (err: unknown) => FailureKind,
  options: {
    policy?: Partial<RetryPolicy>;
    runtime?: RetryRuntime;
    retryAfterMs?: (err: unknown) => number | null;
  } = {},
): Promise<T> {
  const policy = { ...DEFAULT_RETRY_POLICY, ...options.policy };
  const rt = options.runtime ?? realRuntime;
  const started = rt.now();
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    const remaining = policy.deadlineMs - (rt.now() - started);
    if (remaining <= 0) break;
    try {
      return await fn(attempt, remaining);
    } catch (err) {
      lastError = err;
      if (classify(err) === "fatal" || attempt === policy.maxAttempts)
        throw err;
      let wait = backoffDelay(attempt, policy, rt.random);
      const hinted = options.retryAfterMs?.(err) ?? null;
      if (hinted !== null) wait = Math.min(policy.maxDelayMs, hinted);
      if (wait >= policy.deadlineMs - (rt.now() - started)) throw err;
      await rt.sleep(wait);
    }
  }
  throw lastError ?? new Error("retry deadline exceeded");
}
