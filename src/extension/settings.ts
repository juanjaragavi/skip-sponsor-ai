import type { UserPolicy } from "../shared/types";
import { DEFAULT_POLICY } from "./policy";

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
  const set = new Set(policy.blockedChannels);
  if (allowed) set.add(channelId);
  else set.delete(channelId);
  const labels = await loadChannelLabels();
  if (allowed && name) labels[channelId] = name;
  if (!allowed) delete labels[channelId];
  await chrome.storage.sync.set({ channelLabels: labels });
  return updatePolicy({ blockedChannels: [...set] });
}
