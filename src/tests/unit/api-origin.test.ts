import { describe, it, expect } from "vitest";
import { DEV_API_ORIGIN, resolveApiOrigin } from "../../shared/api-origin";

describe("resolveApiOrigin (extension build)", () => {
  it("defaults to the local API only outside production builds", () => {
    expect(resolveApiOrigin(undefined, { production: false })).toBe(
      DEV_API_ORIGIN,
    );
    expect(() => resolveApiOrigin("", { production: true })).toThrow(
      /VITE_API_BASE_URL is required/,
    );
  });

  it("normalizes https URLs", () => {
    expect(
      resolveApiOrigin(" https://api.example.org/ ", { production: true }),
    ).toBe("https://api.example.org");
    expect(resolveApiOrigin("https://x.dev/base//", { production: true })).toBe(
      "https://x.dev/base",
    );
  });

  it("allows plain http only for a loopback API in production builds", () => {
    expect(
      resolveApiOrigin("http://127.0.0.1:39517", { production: true }),
    ).toBe("http://127.0.0.1:39517");
    expect(() =>
      resolveApiOrigin("http://api.example.org", { production: true }),
    ).toThrow(/https/);
    expect(
      resolveApiOrigin("http://10.0.0.5:3040", { production: false }),
    ).toBe("http://10.0.0.5:3040");
  });

  it("rejects malformed values", () => {
    expect(() =>
      resolveApiOrigin("not a url", { production: false }),
    ).toThrow();
    expect(() =>
      resolveApiOrigin("ftp://x.dev", { production: false }),
    ).toThrow();
    expect(() =>
      resolveApiOrigin("https://x.dev/?a=1", { production: true }),
    ).toThrow();
  });
});
