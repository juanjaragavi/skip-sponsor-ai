const YT_ALLOW = /^https:\/\/[\w.-]*youtube\.com\/api\/timedtext/;
const SB_ALLOW = "https://sponsor.ajay.app";

export function assertFetchAllowed(url: string): void {
  if (YT_ALLOW.test(url)) return;
  if (url.startsWith(SB_ALLOW)) return;
  throw new Error("SSRF blocked: URL not allowlisted");
}

const UA = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0 Safari/537.36",
];

export async function fetchTimedText(
  videoId: string,
  lang = "en"
): Promise<unknown> {
  const urls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&caps=asr&fmt=json3&lang=${lang}`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=json3&lang=${lang}`,
  ];
  let lastErr: unknown = new Error("no captions");
  for (const u of urls) {
    assertFetchAllowed(u);
    try {
      const res = await fetch(u, {
        headers: { "User-Agent": UA[Math.floor(Math.random() * UA.length)]! },
      });
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
