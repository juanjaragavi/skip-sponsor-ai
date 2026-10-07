import type { UserPolicy } from "../shared/types";
import { DEFAULT_POLICY } from "./policy";

const API_BASE = "https://api.skipsponsor.example.com/v1";
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
      }
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

async function postTelemetry(
  videoId: string,
  eventType: string,
  latencyMs?: number
): Promise<void> {
  try {
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
  if (s["policy"]) return s["policy"] as UserPolicy;
  await chrome.storage.sync.set({ policy: DEFAULT_POLICY });
  return { ...DEFAULT_POLICY };
}

chrome.runtime.onInstalled.addListener(() => {
  void ensurePolicy();
  void getInstallToken();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "SEGMENTS_GET") {
    apiGetSegments(String(msg.videoId))
      .then((analysis) => sendResponse({ analysis }))
      .catch(() => sendResponse({ analysis: null }));
    return true;
  }
  if (msg?.type === "TELEMETRY") {
    void postTelemetry(
      String(msg.videoId),
      String(msg.eventType),
      msg.latencyMs as number | undefined
    );
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "POLICY_GET") {
    ensurePolicy().then((p) => sendResponse({ policy: p }));
    return true;
  }
  return false;
});

export {};
