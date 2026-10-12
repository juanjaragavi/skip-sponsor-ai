import { describe, expect, it } from "vitest";
import { COMMIT_ENV_VARS, resolveCommit } from "../../api/config";

describe("resolveCommit (GET /healthz `commit`)", () => {
  it("checks GIT_COMMIT_SHA, VERCEL_GIT_COMMIT_SHA, SOURCE_COMMIT in order", () => {
    expect(COMMIT_ENV_VARS).toEqual([
      "GIT_COMMIT_SHA",
      "VERCEL_GIT_COMMIT_SHA",
      "SOURCE_COMMIT",
    ]);
    expect(
      resolveCommit({
        GIT_COMMIT_SHA: "aaa",
        VERCEL_GIT_COMMIT_SHA: "bbb",
        SOURCE_COMMIT: "ccc",
      }),
    ).toBe("aaa");
    expect(
      resolveCommit({ VERCEL_GIT_COMMIT_SHA: "bbb", SOURCE_COMMIT: "ccc" }),
    ).toBe("bbb");
    expect(resolveCommit({ SOURCE_COMMIT: " ccc " })).toBe("ccc");
  });

  it("treats blank values as unset and falls back to unknown", () => {
    expect(resolveCommit({ GIT_COMMIT_SHA: "  ", SOURCE_COMMIT: "ccc" })).toBe(
      "ccc",
    );
    expect(resolveCommit({})).toBe("unknown");
  });
});
