import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DomVideoAdapter,
  getVideoIdFromUrl,
} from "../../extension/video-adapter";

/** The slice of an HTMLVideoElement the adapter touches. */
class FakeVideo extends EventTarget {
  currentTime = 0;
}

interface PageOptions {
  video?: FakeVideo | null;
  channel?: { href: string; text: string } | null;
  playerClasses?: string[] | null;
  mainWorld?: boolean;
  href?: string;
}

/**
 * Minimal YouTube watch page: the adapter only queries a handful of
 * selectors, so a fake `document` is enough (Vitest runs in node).
 */
function installPage(o: PageOptions = {}) {
  const dispatched: Event[] = [];
  const classes =
    o.playerClasses === null
      ? null
      : new Set(o.playerClasses ?? ["html5-video-player"]);
  const nodes: Record<string, unknown> = {
    "video.html5-main-video": o.video ?? null,
    "ytd-channel-name a, #channel-name a": o.channel && {
      href: o.channel.href,
      textContent: o.channel.text,
    },
    ".html5-video-player": classes && {
      classList: { contains: (c: string) => classes.has(c) },
    },
  };
  vi.stubGlobal("document", {
    querySelector: (sel: string) => nodes[sel] ?? null,
    documentElement: {
      hasAttribute: (name: string) =>
        name === "data-skipsponsor-main" && o.mainWorld === true,
    },
    dispatchEvent: (e: Event) => {
      dispatched.push(e);
      return true;
    },
  });
  vi.stubGlobal("location", {
    href: o.href ?? "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42",
  });
  return { dispatched };
}

describe("getVideoIdFromUrl", () => {
  it("rejects other hosts and malformed ids", () => {
    expect(
      getVideoIdFromUrl("https://www.example.com/watch?v=dQw4w9WgXcQ"),
    ).toBeNull();
    expect(
      getVideoIdFromUrl("https://www.youtube.com/watch?v=short"),
    ).toBeNull();
    expect(getVideoIdFromUrl("https://www.youtube.com/watch")).toBeNull();
  });
});

describe("DomVideoAdapter", () => {
  afterEach(() => vi.unstubAllGlobals());
  const adapter = new DomVideoAdapter();

  it("reads the playhead of YouTube's main video, 0 when there is none", () => {
    const video = new FakeVideo();
    video.currentTime = 73.5;
    installPage({ video });
    expect(adapter.getVideo()).toBe(video);
    expect(adapter.getCurrentTime()).toBe(73.5);

    installPage({ video: null });
    expect(adapter.getVideo()).toBeNull();
    expect(adapter.getCurrentTime()).toBe(0);
  });

  it("seeks through the MAIN-world player API when that script is present", () => {
    const video = new FakeVideo();
    const page = installPage({ video, mainWorld: true });

    adapter.seekTo(120);

    expect(page.dispatched).toHaveLength(1);
    const e = page.dispatched[0] as CustomEvent<number>;
    expect(e.type).toBe("skipsponsor:seek");
    expect(e.detail).toBe(120);
    expect(video.currentTime).toBe(0);
  });

  it("falls back to writing currentTime without the MAIN-world script", () => {
    const video = new FakeVideo();
    const page = installPage({ video });

    adapter.seekTo(95.25);

    expect(video.currentTime).toBe(95.25);
    expect(page.dispatched).toEqual([]);
  });

  it("ignores a seek when the page has no video yet", () => {
    const page = installPage({ video: null });
    expect(() => adapter.seekTo(10)).not.toThrow();
    expect(page.dispatched).toEqual([]);
  });

  it("takes the video id from the page URL", () => {
    installPage();
    expect(adapter.getVideoId()).toBe("dQw4w9WgXcQ");
    installPage({ href: "https://www.youtube.com/feed/subscriptions" });
    expect(adapter.getVideoId()).toBeNull();
  });

  it("identifies the channel by @handle or channel id", () => {
    installPage({
      channel: { href: "https://www.youtube.com/@LinusTechTips", text: "LTT" },
    });
    expect(adapter.getChannelId()).toBe("@LinusTechTips");

    installPage({
      channel: {
        href: "https://www.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw/videos",
        text: "LTT",
      },
    });
    expect(adapter.getChannelId()).toBe("channel/UCXuqSBlHAE6Xw-yeJA0Tunw");

    installPage({
      channel: { href: "https://www.youtube.com/user/legacy", text: "Old" },
    });
    expect(adapter.getChannelId()).toBeNull();

    installPage({ channel: null });
    expect(adapter.getChannelId()).toBeNull();
  });

  it("reads the trimmed channel name, null when blank or missing", () => {
    installPage({
      channel: {
        href: "https://www.youtube.com/@x",
        text: "  Linus Tech Tips\n",
      },
    });
    expect(adapter.getChannelName()).toBe("Linus Tech Tips");
    installPage({
      channel: { href: "https://www.youtube.com/@x", text: "  " },
    });
    expect(adapter.getChannelName()).toBeNull();
    installPage({ channel: null });
    expect(adapter.getChannelName()).toBeNull();
  });

  it("detects YouTube's own ads from the player's classes", () => {
    installPage({ playerClasses: ["html5-video-player", "ad-showing"] });
    expect(adapter.isAdPlaying()).toBe(true);
    installPage({ playerClasses: ["html5-video-player", "ad-interrupting"] });
    expect(adapter.isAdPlaying()).toBe(true);
    installPage({ playerClasses: ["html5-video-player", "playing-mode"] });
    expect(adapter.isAdPlaying()).toBe(false);
    installPage({ playerClasses: null });
    expect(adapter.isAdPlaying()).toBe(false);
  });

  it("reports the playhead on timeupdate and seeking until unsubscribed", () => {
    const video = new FakeVideo();
    installPage({ video });
    const times: [string, number][] = [];
    const offTime = adapter.onTimeUpdate((t) => times.push(["time", t]));
    const offSeek = adapter.onSeeking((t) => times.push(["seek", t]));

    video.currentTime = 12;
    video.dispatchEvent(new Event("timeupdate"));
    video.currentTime = 300;
    video.dispatchEvent(new Event("seeking"));
    offTime();
    offSeek();
    video.dispatchEvent(new Event("timeupdate"));
    video.dispatchEvent(new Event("seeking"));

    expect(times).toEqual([
      ["time", 12],
      ["seek", 300],
    ]);
  });

  it("returns a harmless unsubscribe when there is no video to listen to", () => {
    installPage({ video: null });
    const cb = vi.fn();
    const off = adapter.onTimeUpdate(cb);
    expect(() => off()).not.toThrow();
    expect(cb).not.toHaveBeenCalled();
  });
});
