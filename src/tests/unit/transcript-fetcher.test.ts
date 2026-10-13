import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertFetchAllowed,
  fetchTimedText,
} from "../../api/services/transcript-fetcher";

describe("assertFetchAllowed (SSRF allowlist)", () => {
  it("allows YouTube timedtext and SponsorBlock", () => {
    for (const url of [
      "https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&fmt=json3",
      "https://youtube.com/api/timedtext?v=dQw4w9WgXcQ",
      "https://m.youtube.com/api/timedtext?v=dQw4w9WgXcQ",
      "https://sponsor.ajay.app/api/skipSegments?videoID=dQw4w9WgXcQ",
    ])
      expect(() => assertFetchAllowed(url), url).not.toThrow();
  });

  it("blocks other hosts, paths and schemes", () => {
    for (const url of [
      "https://example.com/",
      "http://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "http://169.254.169.254/latest/meta-data/",
      "file:///etc/passwd",
      "not a url",
    ])
      expect(() => assertFetchAllowed(url), url).toThrow(/SSRF blocked/);
  });

  it("blocks look-alike hosts that only share a prefix or suffix", () => {
    for (const url of [
      // Suffix look-alikes of youtube.com
      "https://evilyoutube.com/api/timedtext?v=dQw4w9WgXcQ",
      "https://not-youtube.com/api/timedtext?v=dQw4w9WgXcQ",
      // Prefix look-alikes of sponsor.ajay.app
      "https://sponsor.ajay.app.evil.example/api/skipSegments",
      "https://sponsor.ajay.apple.example/api/skipSegments",
      // Credentials trick: the real host is evil.example
      "https://sponsor.ajay.app@evil.example/api/skipSegments",
      "https://www.youtube.com@evil.example/api/timedtext",
    ])
      expect(() => assertFetchAllowed(url), url).toThrow(/SSRF blocked/);
  });
});

describe("fetchTimedText", () => {
  const fetchMock = vi.fn<typeof fetch>();
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status });

  it("returns the ASR track when YouTube serves it", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(json(200, { events: [{ tStartMs: 0 }] }));

    await expect(fetchTimedText("dQw4w9WgXcQ", "es")).resolves.toEqual({
      events: [{ tStartMs: 0 }],
    });
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toBe(
      "https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&caps=asr&fmt=json3&lang=es",
    );
    const headers = new Headers(fetchMock.mock.calls[0]![1]!.headers);
    expect(headers.get("user-agent")).toMatch(/Chrome\//);
  });

  it("falls back to the manual track when there is no ASR track", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(json(200, { events: [] }));

    await expect(fetchTimedText("dQw4w9WgXcQ")).resolves.toEqual({
      events: [],
    });
    expect(String(fetchMock.mock.calls[1]![0])).toBe(
      "https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&fmt=json3&lang=en",
    );
  });

  it("reports 'no captions' when both tracks are missing", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    await expect(fetchTimedText("dQw4w9WgXcQ")).rejects.toThrow("no captions");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces the last HTTP error when YouTube refuses both tracks", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 403 }))
      .mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(fetchTimedText("dQw4w9WgXcQ")).rejects.toThrow(
      "timedtext 401",
    );
  });

  it("surfaces a network failure after the retry budget", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchTimedText("dQw4w9WgXcQ")).rejects.toThrow("fetch failed");
    // Two URLs, at most two attempts each (platform policy, tighter budget).
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
