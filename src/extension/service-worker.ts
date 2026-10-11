import type { LlmChunk, UserPolicy } from "../shared/types";
import type { AnalysisLimit, AnalyzeReply } from "../shared/messages";
import { DEFAULT_POLICY } from "./policy";

// Set at build time from VITE_API_BASE_URL (vite.config.ts); production
// builds fail without it, so no placeholder host can ship.
const API_ORIGIN = __API_ORIGIN__;
const API_BASE = `${API_ORIGIN}/v1`;
const inflight = new Map<string, Promise<unknown>>();

/** Server-issued, signed install token (POST /v1/installs). */
const SIGNED_TOKEN = /^v1\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]+$/;
/** After a failed mint, wait this long before asking the API again. */
const MINT_RETRY_MS = 10 * 60 * 1000;
let minting: Promise<string> | null = null;
let mintFailedAt = 0;

const version = (): string => chrome.runtime.getManifest().version;

async function storedToken(): Promise<string | null> {
  const s = await chrome.storage.local.get(["installToken"]);
  return typeof s["installToken"] === "string" ? s["installToken"] : null;
}

/**
 * Anonymous install token for the daily analysis allowance. Prefers a signed
 * token from the API; when the API is unreachable (or an older API has no
 * /v1/installs) it keeps a random local token so requests still work.
 */
async function getInstallToken(renew = false): Promise<string> {
  const current = await storedToken();
  if (!renew && current && SIGNED_TOKEN.test(current)) return current;
  if (!renew && Date.now() - mintFailedAt < MINT_RETRY_MS && current)
    return current;
  minting ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/installs`, {
        method: "POST",
        headers: { "x-extension-version": version() },
      });
      const body = res.ok
        ? ((await res.json()) as { installToken?: unknown })
        : {};
      if (typeof body.installToken === "string") {
        await chrome.storage.local.set({ installToken: body.installToken });
        mintFailedAt = 0;
        return body.installToken;
      }
    } catch {
      // offline or API down: fall through to a local token
    }
    mintFailedAt = Date.now();
    if (current) return current;
    const local = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    await chrome.storage.local.set({ installToken: local });
    return local;
  })().finally(() => (minting = null));
  return minting;
}

/** fetch with the install token; a rejected token (401) is renewed once. */
async function authedFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const send = (token: string) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${token}`,
        "x-extension-version": version(),
      },
    });
  const res = await send(await getInstallToken());
  return res.status === 401 ? send(await getInstallToken(true)) : res;
}

/** The API refused a fresh analysis; carries the RFC7807 reason. */
class AnalysisLimitedError extends Error {
  constructor(readonly limit: AnalysisLimit) {
    super(`analysis limited: ${limit.reason}`);
  }
}

async function limitFrom(res: Response): Promise<AnalysisLimit | null> {
  if (![401, 429, 503].includes(res.status)) return null;
  try {
    const body = (await res.json()) as Partial<AnalysisLimit>;
    if (typeof body.reason === "string" && typeof body.resetAt === "string")
      return { reason: body.reason, resetAt: body.resetAt } as AnalysisLimit;
  } catch {
    // not a problem+json body
  }
  return null;
}

/** First report of a given limit since it last reset? (one notice per day) */
async function shouldAnnounce(limit: AnalysisLimit): Promise<boolean> {
  const key = `${limit.reason}|${limit.resetAt}`;
  const s = await chrome.storage.local.get(["limitAnnounced"]);
  if (s["limitAnnounced"] === key) return false;
  await chrome.storage.local.set({ limitAnnounced: key });
  return true;
}

async function apiGetSegments(videoId: string): Promise<unknown> {
  if (inflight.has(videoId)) return inflight.get(videoId)!;
  const p = (async () => {
    const res = await authedFetch(
      `${API_BASE}/segments/${encodeURIComponent(videoId)}`,
    );
    if (!res.ok) throw new Error(`segments ${res.status}`);
    return res.json() as Promise<unknown>;
  })();
  inflight.set(videoId, p);
  try {
    return await p;
  } finally {
    inflight.delete(videoId);
  }
}

async function apiAnalyze(
  videoId: string,
  channelId: string | null,
  transcript: LlmChunk[],
): Promise<unknown> {
  const res = await authedFetch(`${API_BASE}/segments:analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoId,
      transcript,
      ...(channelId ? { channelId: channelId.slice(0, 64) } : {}),
    }),
  });
  if (!res.ok) {
    const limit = await limitFrom(res);
    if (limit) throw new AnalysisLimitedError(limit);
    throw new Error(`analyze ${res.status}`);
  }
  return res.json() as Promise<unknown>;
}

async function postTelemetry(
  videoId: string,
  eventType: string,
  latencyMs?: number,
): Promise<void> {
  try {
    // Privacy › "Share skip statistics" off: send nothing.
    const s = await chrome.storage.sync.get(["telemetryEnabled"]);
    if (s["telemetryEnabled"] === false) return;
    await authedFetch(`${API_BASE}/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, eventType, latencyMs }),
    });
  } catch {
    // telemetry best-effort
  }
}

async function ensurePolicy(): Promise<UserPolicy> {
  const s = await chrome.storage.sync.get(["policy"]);
  if (s["policy"])
    return { ...DEFAULT_POLICY, ...(s["policy"] as Partial<UserPolicy>) };
  await chrome.storage.sync.set({ policy: DEFAULT_POLICY });
  return { ...DEFAULT_POLICY };
}

/** Toolbar icon mirrors the master switch: grey "disabled" mark when skipping is off. */
async function syncActionIcon(p?: UserPolicy): Promise<void> {
  const policy = p ?? (await ensurePolicy());
  const off = !policy.globalEnabled || policy.mode === "off";
  const suffix = off ? "-disabled" : "";
  await chrome.action.setIcon({
    path: {
      16: `icons/icon-16${suffix}.png`,
      32: `icons/icon-32${suffix}.png`,
    },
  });
  await chrome.action.setTitle({
    title: off ? "SkipSponsor AI — skipping is off" : "SkipSponsor AI",
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes["policy"]) {
    void syncActionIcon({
      ...DEFAULT_POLICY,
      ...((changes["policy"].newValue as Partial<UserPolicy> | undefined) ??
        {}),
    });
  }
});
chrome.runtime.onStartup.addListener(() => void syncActionIcon());

chrome.runtime.onInstalled.addListener(() => {
  void ensurePolicy().then(syncActionIcon);
  void getInstallToken();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "SEGMENTS_GET") {
    apiGetSegments(String(msg.videoId))
      .then((analysis) => sendResponse({ analysis }))
      .catch(() => sendResponse({ analysis: null }));
    return true;
  }
  if (msg?.type === "SEGMENTS_ANALYZE") {
    apiAnalyze(
      String(msg.videoId),
      (msg.channelId as string | null) ?? null,
      msg.transcript as LlmChunk[],
    )
      .then((analysis) => sendResponse({ analysis } satisfies AnalyzeReply))
      .catch(async (err: unknown) => {
        if (!(err instanceof AnalysisLimitedError))
          return sendResponse({ analysis: null } satisfies AnalyzeReply);
        sendResponse({
          analysis: null,
          limit: err.limit,
          announce: await shouldAnnounce(err.limit),
        } satisfies AnalyzeReply);
      });
    return true;
  }
  if (msg?.type === "TELEMETRY") {
    void postTelemetry(
      String(msg.videoId),
      String(msg.eventType),
      msg.latencyMs as number | undefined,
    );
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "POLICY_GET") {
    ensurePolicy().then((p) => sendResponse({ policy: p }));
    return true;
  }
  if (msg?.type === "HEALTH_GET") {
    // About › Service status.
    const host = new URL(API_ORIGIN).host;
    fetch(`${API_ORIGIN}/healthz`, { signal: AbortSignal.timeout(5000) })
      .then((r) => sendResponse({ ok: r.ok, host }))
      .catch(() => sendResponse({ ok: false, host }));
    return true;
  }
  return false;
});

export {};
