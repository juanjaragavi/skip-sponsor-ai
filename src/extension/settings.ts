import type { UserPolicy } from "../shared/types";
import { DEFAULT_POLICY, sameChannel } from "./policy";

/** Stored display names for channels in the "don't skip" list. */
export type ChannelLabels = Record<string, string>;

const merge = (stored: unknown): UserPolicy => ({
  ...DEFAULT_POLICY,
  ...((stored as Partial<UserPolicy> | undefined) ?? {}),
});

export async function loadPolicy(): Promise<UserPolicy> {
  const s = await chrome.storage.sync.get(["policy"]);
  return merge(s["policy"]);
}

/** Read-modify-write so concurrent popup/options edits don't drop fields. */
export async function updatePolicy(
  patch: Partial<UserPolicy>,
): Promise<UserPolicy> {
  const next = { ...(await loadPolicy()), ...patch };
  await chrome.storage.sync.set({ policy: next });
  return next;
}

export function onPolicyChange(cb: (p: UserPolicy) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes["policy"])
      cb(merge(changes["policy"].newValue));
  });
}

/** Privacy › "Share skip statistics" (default on; off = no telemetry calls). */
export async function loadTelemetryEnabled(): Promise<boolean> {
  const s = await chrome.storage.sync.get(["telemetryEnabled"]);
  return s["telemetryEnabled"] !== false;
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.sync.set({ telemetryEnabled: enabled });
}

/**
 * Privacy › Reset: forget settings, channel list and the anonymous install
 * token in this browser. A new token is generated on the next request.
 */
export async function resetAll(): Promise<void> {
  await Promise.all([
    chrome.storage.sync.clear(),
    chrome.storage.local.clear(),
  ]);
  await chrome.storage.sync.set({ policy: DEFAULT_POLICY });
}

export async function loadChannelLabels(): Promise<ChannelLabels> {
  const s = await chrome.storage.sync.get(["channelLabels"]);
  return (s["channelLabels"] as ChannelLabels | undefined) ?? {};
}

/** Add or remove a channel from the list where skipping is turned off. */
export async function setChannelAllowed(
  channelId: string,
  allowed: boolean,
  name?: string | null,
): Promise<UserPolicy> {
  const policy = await loadPolicy();
  const set = new Set(
    policy.blockedChannels.filter((c) => !sameChannel(c, channelId)),
  );
  if (allowed) set.add(channelId);
  const labels = await loadChannelLabels();
  for (const key of Object.keys(labels))
    if (sameChannel(key, channelId)) delete labels[key];
  if (allowed && name) labels[channelId] = name;
  await chrome.storage.sync.set({ channelLabels: labels });
  return updatePolicy({ blockedChannels: [...set] });
}
