import { fetchWithRetry } from "../lib/retry";

const SB_HOST = "sponsor.ajay.app";

/** youtube.com or a subdomain of it (not look-alikes such as evilyoutube.com). */
function isYouTubeHost(host: string): boolean {
  return host === "youtube.com" || host.endsWith(".youtube.com");
}

/**
 * Server-side fetches go only to YouTube's timedtext API and SponsorBlock.
 * Compare the parsed host exactly: a string prefix/suffix match let through
 * look-alikes such as `sponsor.ajay.app.evil.example` and `evilyoutube.com`.
 */
export function assertFetchAllowed(url: string): void {
  let u: URL | null = null;
  try {
    u = new URL(url);
  } catch {
    // not a URL: blocked below
  }
  if (u && u.protocol === "https:" && !u.username && !u.password) {
    if (isYouTubeHost(u.hostname) && u.pathname === "/api/timedtext") return;
    if (u.hostname === SB_HOST) return;
  }
  throw new Error("SSRF blocked: URL not allowlisted");
}

const UA = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0 Safari/537.36",
];

const TIMEDTEXT_TIMEOUT_MS = 4000;

export async function fetchTimedText(
  videoId: string,
  lang = "en",
): Promise<unknown> {
  const urls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&caps=asr&fmt=json3&lang=${lang}`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=json3&lang=${lang}`,
  ];
  let lastErr: unknown = new Error("no captions");
  for (const u of urls) {
    assertFetchAllowed(u);
    try {
      // Without YouTube's proof-of-origin token this usually fails; never
      // let it hold the request (it took up to ~30s). Platform retry policy
      // with a tighter deadline: at most 2 attempts within the 4 s budget.
      const res = await fetchWithRetry(
        u,
        {
          headers: {
            "User-Agent": UA[Math.floor(Math.random() * UA.length)]!,
          },
        },
        {
          attemptTimeoutMs: TIMEDTEXT_TIMEOUT_MS,
          policy: { maxAttempts: 2, deadlineMs: TIMEDTEXT_TIMEOUT_MS },
        },
      );
      if (res.status === 404) continue;
      if (!res.ok) {
        lastErr = new Error(`timedtext ${res.status}`);
        continue;
      }
      return (await res.json()) as unknown;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
