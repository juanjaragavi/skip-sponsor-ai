/**
 * Deterministic stand-in for a YouTube watch page.
 *
 * Mirrors the DOM contracts the content script depends on, as observed on
 * live youtube.com (Oct 2026):
 * - three transcript panel variants (legacy, modern, "In this video");
 * - the panel keeps the previous video's rows for a while after an SPA
 *   navigation (stale DOM);
 * - YouTube ads play in the same `video.html5-main-video` element while the
 *   player carries the `ad-showing` class.
 *
 * The <video> has no media source: per the HTML spec, `currentTime` then
 * reflects the last value written, which gives the test a fully scripted
 * clock (`__fx.tick(t)`) without real playback.
 */

export type PanelVariant = "legacy" | "modern" | "inThisVideo";

export interface FixtureVideo {
  id: string;
  title: string;
  channel: string;
  /** null = video without captions (no transcript button). */
  rows: [timestamp: string, text: string][] | null;
}

export function ts(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function rowsEvery(
  step: number,
  until: number,
  textAt: (t: number) => string,
): [string, string][] {
  const rows: [string, string][] = [];
  for (let t = 0; t < until; t += step) rows.push([ts(t), textAt(t)]);
  return rows;
}

/** Sponsor read 30s-60s, right after a 10s music intro. */
export const VIDEO_A: FixtureVideo = {
  id: "fixtureAAAA",
  title: "Alpha video",
  channel: "@alpha-channel",
  rows: rowsEvery(5, 120, (t) => {
    if (t < 10) return "[Music]";
    if (t < 30) return `alpha topic discussion part ${t}`;
    if (t === 30)
      return "But before we continue, this video is sponsored by AcmeVPN.";
    if (t < 60)
      return `AcmeVPN keeps you private, use code ACME for a discount ${t}`;
    if (t === 60) return "Anyway, back to the video and the alpha topic.";
    return `alpha topic discussion part ${t}`;
  }),
};

/** Sponsor read 80s-100s; 30s-60s is ordinary content (intro animation + topic). */
export const VIDEO_B: FixtureVideo = {
  id: "fixtureBBBB",
  title: "Beta video",
  channel: "@beta-channel",
  rows: rowsEvery(5, 150, (t) => {
    if (t < 15) return "[Music]";
    if (t < 80) return `beta topic explanation segment ${t}`;
    if (t === 80)
      return "This video is sponsored by BetaBank, the bank for creators.";
    if (t < 100)
      return `BetaBank gives you a free account with the link below ${t}`;
    if (t === 100) return "Okay, back to the video, the beta topic continues.";
    return `beta topic explanation segment ${t}`;
  }),
};

export const VIDEO_NO_CAPTIONS: FixtureVideo = {
  id: "fixtureNONE",
  title: "No captions video",
  channel: "@quiet-channel",
  rows: null,
};

/**
 * Legacy panel granularity (~1.4 rows/s, as on live auto-generated tracks):
 * 5,600 rows exceed the API's 5,000-cue request limit.
 */
export const VIDEO_LONG: FixtureVideo = {
  id: "fixtureLONG",
  title: "Long video",
  channel: "@long-channel",
  rows: Array.from({ length: 5600 }, (_, i): [string, string] => {
    const t = Math.floor(i * 0.7);
    if (t === 3000) return [ts(t), "this video is sponsored by LongCo"];
    if (t > 3000 && t < 3040) return [ts(t), `LongCo promo code LONG ${i}`];
    if (t === 3040) return [ts(t), "back to the video now"];
    return [ts(t), `long talk word ${i}`];
  }),
};

export const ALL_VIDEOS = [VIDEO_A, VIDEO_B, VIDEO_NO_CAPTIONS, VIDEO_LONG];

export interface FixtureOptions {
  variant: PanelVariant;
  /** How long stale rows of the previous video survive an SPA navigation. */
  staleMs: number;
  /** Latency between opening the panel and the rows rendering. */
  rowDelayMs: number;
}

const PAGE_SCRIPT = String.raw`
(() => {
  const fx = window.__fx;
  const panel = document.querySelector("ytd-engagement-panel-section-list-renderer");
  const content = panel.querySelector("#content");
  const player = document.getElementById("movie_player");
  const video = document.querySelector("video.html5-main-video");
  const desc = document.getElementById("description");
  const EXPANDED = "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED";
  const HIDDEN = "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN";
  let current = fx.initial;
  let renderedFor = null;
  let navAt = -Infinity;
  let pending = 0;

  function rowHtml(r) {
    const [t, text] = r;
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    if (fx.variant === "legacy")
      return '<ytd-transcript-segment-renderer><div class="segment-timestamp">\n      ' + t +
        '\n    </div><yt-formatted-string class="segment-text">' + esc(text) +
        "</yt-formatted-string></ytd-transcript-segment-renderer>";
    return '<transcript-segment-view-model><div aria-hidden="true" class="ytwTranscriptSegmentViewModelTimestamp">' + t +
      '</div><div class="ytwTranscriptSegmentViewModelTimestampA11yLabel">' + t +
      ' seconds</div><span role="text">' + esc(text) + "</span></transcript-segment-view-model>";
  }

  function renderRows(id) {
    const v = fx.videos[id];
    content.innerHTML = (v.rows || []).map(rowHtml).join("");
    renderedFor = id;
  }

  function renderDescription(id) {
    const v = fx.videos[id];
    desc.innerHTML = v.rows
      ? '<ytd-video-description-transcript-section-renderer><button id="show-transcript">Show transcript</button></ytd-video-description-transcript-section-renderer>'
      : "";
    const btn = desc.querySelector("button");
    if (btn) btn.addEventListener("click", openPanel);
    document.querySelector("ytd-channel-name a").href = "https://www.youtube.com/" + v.channel;
    document.getElementById("title").textContent = v.title;
  }

  function openPanel() {
    panel.setAttribute("visibility", EXPANDED);
    if (renderedFor === current) return;
    const id = current;
    const wait = Math.max(fx.rowDelayMs, navAt + fx.staleMs - performance.now());
    clearTimeout(pending);
    pending = setTimeout(() => { if (id === current) renderRows(id); }, wait);
  }

  panel.querySelector("#visibility-button button").addEventListener("click", () => {
    panel.setAttribute("visibility", HIDDEN);
  });

  fx.navigate = (id) => {
    current = id;
    navAt = performance.now();
    history.pushState({}, "", "/watch?v=" + id);
    document.getElementById("nav-marker").textContent = id;
    clearTimeout(pending);
    setTimeout(() => {
      // YouTube eventually drops the old rows and collapses the panel.
      content.innerHTML = "";
      renderedFor = null;
      panel.setAttribute("visibility", HIDDEN);
      renderDescription(id);
      document.dispatchEvent(new Event("yt-navigate-finish"));
    }, fx.staleMs);
  };
  fx.openTranscript = openPanel;
  fx.tick = (t) => {
    video.currentTime = t;
    video.dispatchEvent(new Event("timeupdate"));
    return video.currentTime;
  };
  fx.time = () => video.currentTime;
  fx.setAd = (on) => player.classList.toggle("ad-showing", on);
  fx.panelState = () => ({ visibility: panel.getAttribute("visibility"), rows: content.children.length });

  renderDescription(current);
})();
`;

export function fixtureHtml(
  videoId: string,
  videos: readonly FixtureVideo[],
  opts: FixtureOptions,
): string {
  const targetId =
    opts.variant === "legacy"
      ? ' target-id="engagement-panel-searchable-transcript"'
      : opts.variant === "modern"
        ? ' target-id="PAmodern_transcript_view"'
        : ""; // "In this video" panel carries no target-id
  const data = {
    initial: videoId,
    variant: opts.variant,
    staleMs: opts.staleMs,
    rowDelayMs: opts.rowDelayMs,
    videos: Object.fromEntries(videos.map((v) => [v.id, v])),
  };
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>YouTube</title></head>
<body>
  <div id="nav-marker"></div>
  <h1 id="title"></h1>
  <div id="movie_player" class="html5-video-player"><video class="html5-main-video"></video></div>
  <ytd-channel-name><a href="#">channel</a></ytd-channel-name>
  <div id="description"></div>
  <ytd-engagement-panel-section-list-renderer${targetId} visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN">
    <div id="header"><div id="visibility-button"><button aria-label="Close">x</button></div></div>
    <div id="content"></div>
  </ytd-engagement-panel-section-list-renderer>
  <ytd-engagement-panel-section-list-renderer target-id="engagement-panel-comments-section" visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"></ytd-engagement-panel-section-list-renderer>
  <script>window.__fx = ${JSON.stringify(data)};</script>
  <script>${PAGE_SCRIPT}</script>
</body></html>`;
}
