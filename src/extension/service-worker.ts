/// <reference types="vite/client" />
import type { LlmChunk, UserPolicy } from "../shared/types";
import { DEFAULT_POLICY } from "./policy";

const API_ORIGIN =
  import.meta.env.VITE_API_BASE_URL ?? "https://api.skipsponsor.example.com";
const API_BASE = `${API_ORIGIN}/v1`;
const inflight = new Map<string, Promise<unknown>>();

async function getInstallToken(): Promise<string> {
  const s = await chrome.storage.local.get(["installToken"]);
  if (typeof s["installToken"] === "string") return s["installToken"] as string;
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  await chrome.storage.local.set({ installToken: token });
  return token;
}

async function apiGetSegments(videoId: string): Promise<unknown> {
  if (inflight.has(videoId)) return inflight.get(videoId)!;
  const p = (async () => {
    const token = await getInstallToken();
    const res = await fetch(
      `${API_BASE}/segments/${encodeURIComponent(videoId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-extension-version": chrome.runtime.getManifest().version,
        },
      },
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
  const token = await getInstallToken();
  const res = await fetch(`${API_BASE}/segments:analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-extension-version": chrome.runtime.getManifest().version,
    },
    body: JSON.stringify({
      videoId,
      transcript,
      ...(channelId ? { channelId: channelId.slice(0, 64) } : {}),
    }),
  });
  if (!res.ok) throw new Error(`analyze ${res.status}`);
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
    const token = await getInstallToken();
    await fetch(`${API_BASE}/telemetry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
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
      .then((analysis) => sendResponse({ analysis }))
      .catch(() => sendResponse({ analysis: null }));
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
