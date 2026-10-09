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
