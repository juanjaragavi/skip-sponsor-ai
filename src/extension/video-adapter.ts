/** VideoAdapter isolates DOM video access for testability (spec §7.1). */
export interface VideoAdapter {
  getVideo(): HTMLVideoElement | null;
  getCurrentTime(): number;
  seekTo(t: number): void;
  getVideoId(): string | null;
  getChannelId(): string | null;
  getChannelName(): string | null;
  /** YouTube plays its own ads in the same <video>; their clock is not the video's. */
  isAdPlaying(): boolean;
  onTimeUpdate(cb: (t: number) => void): () => void;
  onSeeking(cb: (t: number) => void): () => void;
}

export function getVideoIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("youtube.com")) return null;
    if (!u.pathname.startsWith("/watch")) return null;
    const v = u.searchParams.get("v");
    return v && /^[A-Za-z0-9_-]{11}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export class DomVideoAdapter implements VideoAdapter {
  getVideo(): HTMLVideoElement | null {
    return document.querySelector<HTMLVideoElement>("video.html5-main-video");
  }
  getCurrentTime(): number {
    return this.getVideo()?.currentTime ?? 0;
  }
  seekTo(t: number): void {
    // Prefer YouTube's player API (via the MAIN-world script): writing
    // currentTime behind the player's back can make it snap back.
    if (document.documentElement.hasAttribute("data-skipsponsor-main")) {
      document.dispatchEvent(
        new CustomEvent("skipsponsor:seek", { detail: t }),
      );
      return;
    }
    const v = this.getVideo();
    if (v) v.currentTime = t;
  }
  getVideoId(): string | null {
    return getVideoIdFromUrl(location.href);
  }
  getChannelId(): string | null {
    const link = document.querySelector<HTMLAnchorElement>(
      "ytd-channel-name a, #channel-name a",
    );
    const href = link?.href ?? "";
    const m = href.match(/\/(@[^/]+|channel\/[^/]+)/);
    return m ? m[1]! : null;
  }
  getChannelName(): string | null {
    const name = document
      .querySelector("ytd-channel-name a, #channel-name a")
      ?.textContent?.trim();
    return name ? name : null;
  }
  isAdPlaying(): boolean {
    const player = document.querySelector(".html5-video-player");
    return (
      player?.classList.contains("ad-showing") === true ||
      player?.classList.contains("ad-interrupting") === true
    );
  }
  onTimeUpdate(cb: (t: number) => void): () => void {
    return this.listen("timeupdate", cb);
  }
  onSeeking(cb: (t: number) => void): () => void {
    return this.listen("seeking", cb);
  }
  private listen(type: string, cb: (t: number) => void): () => void {
    const v = this.getVideo();
    if (!v) return () => {};
    const h = (): void => cb(v.currentTime);
    v.addEventListener(type, h);
    return () => v.removeEventListener(type, h);
  }
}
