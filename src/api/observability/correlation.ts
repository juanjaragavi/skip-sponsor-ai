/**
 * Correlation ids (portfolio platform standard): accept `x-correlation-id`
 * from the caller when it is ≤128 chars of [A-Za-z0-9._-], otherwise mint a
 * UUIDv4. The id is echoed on the response, attached to every log line of
 * the request (Fastify's request logger, label `correlation_id`) and
 * forwarded on outbound calls through AsyncLocalStorage.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export const CORRELATION_HEADER = "x-correlation-id";
const VALID_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** The caller's id when valid, else a new UUIDv4. */
export function acceptCorrelationId(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && VALID_ID.test(value)
    ? value
    : randomUUID();
}

interface CorrelationContext {
  correlationId: string;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

/** Run `fn` (and everything it awaits) under a correlation id. */
export function runWithCorrelationId<T>(id: string, fn: () => T): T {
  return storage.run({ correlationId: id }, fn);
}

/** The correlation id of the current request, if any. */
export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
