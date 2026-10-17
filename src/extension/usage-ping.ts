/**
 * Anonymous install and usage counts (privacy draft 2026-10-17).
 *
 * What is sent, and only while Settings › Privacy › "Share usage statistics"
 * is on (the same switch as skip statistics; default on):
 * - `install` once, when the extension is installed;
 * - `update` once per version update;
 * - `active` at most once per UTC day, the first time a YouTube video is
 *   opened that day (so "weekly active" means it was really used);
 * - an uninstall count, through the page Chrome opens after an uninstall.
 *
 * Each ping carries a random usage id (a UUID created here and kept in
 * chrome.storage.local, separate from the install token), the event and the
 * extension version. No URL, video ID, channel, settings or install token.
 * The request omits credentials. Turning the switch off stops every ping and
 * clears the uninstall page.
 */

export const USAGE_ID_KEY = "usageId";
export const LAST_ACTIVE_KEY = "usageLastActiveDay";

export type UsageEvent = "install" | "update" | "active";

type Items = Record<string, unknown>;
interface StorageArea {
  get(keys: string[]): Promise<Items>;
  set(items: Items): Promise<void>;
}

export interface UsageDeps {
  local: StorageArea;
  sync: Pick<StorageArea, "get">;
  fetch: typeof fetch;
  setUninstallURL: (url: string) => Promise<void> | void;
  apiOrigin: string;
  version: string;
  now?: () => Date;
  randomId?: () => string;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Settings › Privacy › "Share usage statistics" (stored as telemetryEnabled). */
export async function usageEnabled(d: UsageDeps): Promise<boolean> {
  const s = await d.sync.get(["telemetryEnabled"]);
  return s["telemetryEnabled"] !== false;
}

/** The random usage id, created on first use. */
export async function usageId(d: UsageDeps): Promise<string> {
  const s = await d.local.get([USAGE_ID_KEY]);
  const current = s[USAGE_ID_KEY];
  if (typeof current === "string" && UUID.test(current)) return current;
  const id = (d.randomId ?? (() => crypto.randomUUID()))();
  await d.local.set({ [USAGE_ID_KEY]: id });
  return id;
}

export function uninstallUrl(
  apiOrigin: string,
  id: string,
  version: string,
): string {
  const q = new URLSearchParams({ id, v: version });
  return `${apiOrigin}/v1/usage/uninstalled?${q.toString()}`;
}

/** Send one ping. False when statistics are off or the API did not accept it. */
export async function sendUsage(
  d: UsageDeps,
  event: UsageEvent,
): Promise<boolean> {
  try {
    if (!(await usageEnabled(d))) return false;
    const res = await d.fetch(`${d.apiOrigin}/v1/usage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({
        id: await usageId(d),
        event,
        version: d.version,
      }),
    });
    return res.ok;
  } catch {
    return false; // offline or API down: best effort
  }
}

/**
 * The daily "active" ping: sent the first time a video is opened on a UTC
 * day; the day is remembered only once the API accepted it, so a failed ping
 * is retried on the next video.
 */
export async function pingActiveOncePerDay(d: UsageDeps): Promise<boolean> {
  const today = utcDay((d.now ?? (() => new Date()))());
  const s = await d.local.get([LAST_ACTIVE_KEY]);
  if (s[LAST_ACTIVE_KEY] === today) return false;
  if (!(await sendUsage(d, "active"))) return false;
  await d.local.set({ [LAST_ACTIVE_KEY]: today });
  return true;
}

/** Point Chrome's uninstall page at the counter, or clear it when opted out. */
export async function syncUninstallUrl(d: UsageDeps): Promise<void> {
  try {
    const url = (await usageEnabled(d))
      ? uninstallUrl(d.apiOrigin, await usageId(d), d.version)
      : "";
    await d.setUninstallURL(url);
  } catch {
    // an invalid origin in a dev build must not break the service worker
  }
}

/** chrome.runtime.onInstalled: count installs and version updates. */
export async function onInstalledUsage(
  d: UsageDeps,
  details: { reason: string; previousVersion?: string },
): Promise<void> {
  await syncUninstallUrl(d);
  if (details.reason === "install") {
    await sendUsage(d, "install");
  } else if (
    details.reason === "update" &&
    details.previousVersion !== d.version
  ) {
    await sendUsage(d, "update");
  }
}
