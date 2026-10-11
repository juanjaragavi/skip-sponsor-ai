import { describe, it, expect } from "vitest";
import { corsOrigin } from "../../api/cors";
import { buildServer } from "../../api/server";
import { memoryPersistence } from "../../api/persistence";

const EXT = `chrome-extension://${"a".repeat(32)}`;
const OTHER_EXT = `chrome-extension://${"b".repeat(32)}`;

describe("corsOrigin", () => {
  it("parses CORS_ORIGIN", () => {
    expect(corsOrigin("*", true)).toBe(true);
    expect(corsOrigin(` ${EXT}/ , https://x.dev`, true)).toEqual([
      EXT,
      "https://x.dev",
    ]);
    expect(corsOrigin("", false)).toBe(true);
    const prod = corsOrigin("", true) as RegExp;
    expect(prod.test(EXT)).toBe(true);
    expect(prod.test("https://evil.example")).toBe(false);
  });
});

describe("CORS on the API", () => {
  const preflight = async (
    origin: string,
    deps: { corsOrigin: string; isProduction: boolean },
  ) => {
    const app = buildServer({ persistence: memoryPersistence(), ...deps });
    const res = await app.inject({
      method: "OPTIONS",
      url: "/v1/segments:analyze",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    await app.close();
    return res.headers["access-control-allow-origin"];
  };

  it("allows only the pinned extension when CORS_ORIGIN is set", async () => {
    const deps = { corsOrigin: EXT, isProduction: true };
    expect(await preflight(EXT, deps)).toBe(EXT);
    expect(await preflight(OTHER_EXT, deps)).toBeUndefined();
  });

  it("allows any extension but no website in production by default", async () => {
    const deps = { corsOrigin: "", isProduction: true };
    expect(await preflight(OTHER_EXT, deps)).toBe(OTHER_EXT);
    expect(await preflight("https://evil.example", deps)).toBeUndefined();
  });
});
