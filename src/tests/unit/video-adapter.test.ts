import { describe, it, expect } from "vitest";
import { getVideoIdFromUrl } from "../../extension/video-adapter";

describe("getVideoIdFromUrl", () => {
  it("accepts watch URLs only", () => {
    expect(getVideoIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(getVideoIdFromUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBeNull();
    expect(getVideoIdFromUrl("https://www.youtube.com/")).toBeNull();
    expect(getVideoIdFromUrl("not a url")).toBeNull();
  });
});
