import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchSponsorBlock } from "../../api/services/sponsorblock";

const respond = (status: number, body?: unknown) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body === undefined ? "Not Found" : JSON.stringify(body), {
      status,
    }),
  );

describe("fetchSponsorBlock", () => {
  afterEach(() => vi.restoreAllMocks());

  it("treats 404 (no segments for this video) as an empty result", async () => {
    respond(404);
    await expect(fetchSponsorBlock("dQw4w9WgXcQ")).resolves.toEqual([]);
  });

  it("maps community segments", async () => {
    respond(200, [
      { segment: [12.5, 40], category: "sponsor" },
      { segment: [0, 8], category: "intro" },
    ]);
    const out = await fetchSponsorBlock("dQw4w9WgXcQ");
    expect(
      out.map((s) => [s.startTime, s.endTime, s.category, s.source]),
    ).toEqual([
      [12.5, 40, "sponsor", "sponsorblock"],
      [0, 8, "intro", "sponsorblock"],
    ]);
  });

  it("still fails on real errors", async () => {
    respond(503, { error: "down" });
    await expect(fetchSponsorBlock("dQw4w9WgXcQ")).rejects.toThrow("503");
  });

  it("keeps the non-sponsor categories it asks for and treats unknown ones as sponsor", async () => {
    respond(200, [
      { segment: [1, 2], category: "selfpromo" },
      { segment: [3, 4], category: "outro" },
      { segment: [5, 6], category: "interaction_reminder" },
      { segment: [7, 8], category: "some_future_category" },
    ]);
    const out = await fetchSponsorBlock("dQw4w9WgXcQ");
    expect(out.map((s) => s.category)).toEqual([
      "selfpromo",
      "outro",
      "interaction_reminder",
      "sponsor",
    ]);
    // Community labels carry a fixed, below-threshold confidence and unique ids.
    expect(new Set(out.map((s) => s.id)).size).toBe(4);
    expect(out.every((s) => s.confidence === 0.7)).toBe(true);
  });

  it("only ever calls the SponsorBlock API for the requested video", async () => {
    const fetchSpy = respond(404);
    await fetchSponsorBlock("dQw4w9WgXcQ");
    const url = new URL(String(fetchSpy.mock.calls[0]![0]));
    expect(url.origin).toBe("https://sponsor.ajay.app");
    expect(url.searchParams.get("videoID")).toBe("dQw4w9WgXcQ");
  });
});
