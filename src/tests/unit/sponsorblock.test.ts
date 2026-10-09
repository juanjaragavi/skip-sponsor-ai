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
});
