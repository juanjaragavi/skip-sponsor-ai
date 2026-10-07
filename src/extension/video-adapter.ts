/** VideoAdapter isolates DOM video access for testability (spec §7.1). */
export interface VideoAdapter {
  getVideo(): HTMLVideoElement | null;
  getCurrentTime(): number;
  seekTo(t: number): void;
  getVideoId(): string | null;
  getChannelId(): string | null;
  onTimeUpdate(cb: (t: number) => void): () => void;
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
  onTimeUpdate(cb: (t: number) => void): () => void {
    const v = this.getVideo();
    if (!v) return () => {};
    const h = () => cb(v.currentTime);
    v.addEventListener("timeupdate", h);
    return () => v.removeEventListener("timeupdate", h);
  }
}
