/**
 * Runs in the page's MAIN world (YouTube's own JS context). The isolated
 * content script cannot call YouTube's player API, so it asks this script to
 * seek via a DOM event. Seeking through `movie_player.seekTo` keeps YouTube's
 * player state in sync; writing `video.currentTime` behind its back can make
 * the player snap back (server-side ads, SABR streaming), which looked like
 * an endless skip loop.
 *
 * Self-contained on purpose: no imports.
 */
interface YtPlayer extends HTMLElement {
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime?: () => number;
}

document.documentElement.setAttribute("data-skipsponsor-main", "1");

document.addEventListener("skipsponsor:seek", (e: Event) => {
  const t = (e as CustomEvent<unknown>).detail;
  if (typeof t !== "number" || !Number.isFinite(t) || t < 0) return;
  const player = document.getElementById("movie_player") as YtPlayer | null;
  if (typeof player?.seekTo === "function") {
    player.seekTo(t, true);
    return;
  }
  const video = document.querySelector<HTMLVideoElement>(
    "video.html5-main-video",
  );
  if (video) video.currentTime = t;
});

/**
 * Transcript panel request for the content script (innertube-transcript.ts).
 * Loads the panel the YouTube web client itself loads for "Show transcript",
 * with the page's own client context and credentials. Only this one panel id
 * is accepted, and the answer goes back as a JSON string.
 */
interface YtConfig {
  get?: (key: string) => unknown;
  data_?: Record<string, unknown>;
}

const PANEL_ID = "PAmodern_transcript_view";
const PANEL_PARAMS = /^[A-Za-z0-9+/=_-]{8,200}$/;

function ytConfigValue(key: string): unknown {
  const cfg = (window as unknown as { ytcfg?: YtConfig }).ytcfg;
  return cfg?.get?.(key) ?? cfg?.data_?.[key];
}

document.addEventListener("skipsponsor:get-panel", (e: Event) => {
  let req: { id?: unknown; panelId?: unknown; params?: unknown };
  try {
    req = JSON.parse(String((e as CustomEvent<unknown>).detail)) as typeof req;
  } catch {
    return;
  }
  const { id, panelId, params } = req;
  if (
    typeof id !== "string" ||
    panelId !== PANEL_ID ||
    typeof params !== "string" ||
    !PANEL_PARAMS.test(params)
  )
    return;
  const reply = (ok: boolean, status: number, text: string) =>
    document.dispatchEvent(
      new CustomEvent("skipsponsor:get-panel-result", {
        detail: JSON.stringify({ id, ok, status, text }),
      }),
    );
  const context = ytConfigValue("INNERTUBE_CONTEXT");
  if (!context) {
    reply(false, 0, "");
    return;
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const clientName = ytConfigValue("INNERTUBE_CONTEXT_CLIENT_NAME");
  const clientVersion = ytConfigValue("INNERTUBE_CLIENT_VERSION");
  if (clientName !== undefined)
    headers["x-youtube-client-name"] = String(clientName);
  if (typeof clientVersion === "string")
    headers["x-youtube-client-version"] = clientVersion;
  fetch("/youtubei/v1/get_panel?prettyPrint=false", {
    method: "POST",
    credentials: "same-origin",
    headers,
    body: JSON.stringify({ context, panelId, params }),
  })
    .then(async (res) =>
      reply(res.ok, res.status, res.ok ? await res.text() : ""),
    )
    .catch(() => reply(false, 0, ""));
});
